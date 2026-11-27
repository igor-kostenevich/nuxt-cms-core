-- Concurrent writes of the Texts screen (010d, C-89): `npm run test:db`.
--
-- Two sessions at once cannot be shown inside one transaction, so the test
-- opens real sessions to this database with dblink. Their fixtures commit:
-- the users and the page have keys of their own and are removed at the end
-- (and at the start, after an interrupted run), with the Activity events this
-- run wrote (014: a test must not leave events in the database it runs on).
-- Nothing else is touched: events of earlier runs stay.
--
-- Checked:
--   1. two writes of different texts of one page keep both (page mutex);
--   2. publishing a language waits for a write and skips the draft it changed;
--   3. taking the Edit Mode lock waits for a write, so the editor loads it;
--   4. no foreign key deadlock: Edit Mode holds its lock row and inserts a
--      draft and a revision (FK checks take FOR KEY SHARE on the document
--      row, cms_documents since 014; on the page row before) while the Texts
--      screen holds the page mutex and waits for that lock row. FOR NO KEY
--      UPDATE lets the FK checks pass; FOR UPDATE would not.

begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(14);

-- dblink refuses a connection without a password for a non-superuser, and
-- local connections over the socket are trusted. So the sessions connect over
-- TCP to the address of this server, with the password of the local
-- Supabase stack.
select set_config(
  'cms_test.conn',
  format(
    'host=%s port=%s dbname=%s user=postgres password=postgres',
    coalesce(host(inet_server_addr()), 'db'),
    coalesce(inet_server_port(), 5432),
    current_database()
  ),
  true
);

select dblink_connect('cms_setup', current_setting('cms_test.conn'));

-- Events written from here on are this run's.
select set_config('cms_test.started', clock_timestamp()::text, true);

select dblink_exec('cms_setup', $sql$
  delete from public.cms_pages where key = 'concurrency-fixture';
  delete from public.cms_users where user_id in ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000d002');
  delete from auth.users where id in ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000d002');

  insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-00000000d001', 'editor-010d-concurrency@example.test'),
    ('00000000-0000-4000-8000-00000000d002', 'admin-010d-concurrency@example.test');
  insert into public.cms_users (user_id, role, status) values
    ('00000000-0000-4000-8000-00000000d001', 'editor', 'active'),
    ('00000000-0000-4000-8000-00000000d002', 'admin', 'active');
  insert into public.cms_pages (key) values ('concurrency-fixture');
  insert into public.cms_page_fields (page_id, address, kind)
    select id, f.address, 'text'
      from public.cms_pages, (values ('hero.title'), ('hero.subtitle')) as f (address)
      where key = 'concurrency-fixture';
$sql$);

-- The language of the original, or the bootstrap one of an empty site.
select set_config('cms_test.locale', coalesce(public.cms_default_locale(null), 'en'), true);

-- Sessions: two editors (a, b) and an admin (p) who may publish.
create function pg_temp.open_session(name text, user_id text)
returns void
language plpgsql
as $$
begin
  perform dblink_connect(name, current_setting('cms_test.conn'));
  perform dblink_exec(name, 'set role authenticated');
  perform dblink_exec(name, format(
    'set request.jwt.claims = %L',
    json_build_object('sub', user_id, 'role', 'authenticated')::text
  ));
end;
$$;

select pg_temp.open_session('cms_a', '00000000-0000-4000-8000-00000000d001');
select pg_temp.open_session('cms_b', '00000000-0000-4000-8000-00000000d001');
select pg_temp.open_session('cms_p', '00000000-0000-4000-8000-00000000d002');

-- A call of cms_page_set_texts for the fixture page, as SQL text.
create function pg_temp.set_texts(entries text)
returns text
language sql
as $$
  select format(
    'select public.cms_page_set_texts(%L, %L, %L)::text',
    'concurrency-fixture', current_setting('cms_test.locale'), entries
  )
$$;

create function pg_temp.draft()
returns jsonb
language sql
as $$
  select d.content
    from public.cms_page_draft d join public.cms_pages p on p.id = d.page_id
    where p.key = 'concurrency-fixture' and d.locale = current_setting('cms_test.locale')
$$;

-- Waits until the async query of a session has blocked (or finished).
create function pg_temp.busy(name text)
returns integer
language sql
as $$
  select pg_sleep(0.3);
  select dblink_is_busy(name);
$$;

-- 1. Two writes of different texts ------------------------------------------------

select dblink_exec('cms_a', 'begin');
select * from dblink('cms_a', pg_temp.set_texts('{"hero.title": "A"}')) as t (r text);
select dblink_send_query('cms_b', pg_temp.set_texts('{"hero.subtitle": "B"}'));

select is(pg_temp.busy('cms_b'), 1, 'a second write of the page waits for the first (page mutex)');

select dblink_exec('cms_a', 'commit');
select * from dblink_get_result('cms_b') as t (r text);
select * from dblink_get_result('cms_b') as t (r text);

select is(
  pg_temp.draft(),
  '{"hero": {"title": "A", "subtitle": "B"}}'::jsonb,
  'both texts are in the draft: the second write read the first one'
);

-- 2. Publishing a language while a text is being written ------------------------

select set_config('cms_test.marker', (
  select to_json(d.updated_at) #>> '{}'
    from public.cms_page_draft d join public.cms_pages p on p.id = d.page_id
    where p.key = 'concurrency-fixture' and d.locale = current_setting('cms_test.locale')
), true);

select dblink_exec('cms_a', 'begin');
select * from dblink('cms_a', pg_temp.set_texts('{"hero.title": "A2"}')) as t (r text);
select dblink_send_query('cms_p', format(
  'select published, skipped from public.cms_language_publish(%L, %L)',
  current_setting('cms_test.locale'),
  json_build_array(json_build_object('key', 'concurrency-fixture', 'draftUpdatedAt', current_setting('cms_test.marker')))::text
));

select is(pg_temp.busy('cms_p'), 1, 'publishing waits for a write of the page');

select dblink_exec('cms_a', 'commit');

select results_eq(
  $$ select published, skipped from dblink_get_result('cms_p') as t (published integer, skipped integer) $$,
  $$ values (0, 1) $$,
  'the draft changed while publishing waited: the page is skipped, not published half-way'
);
select * from dblink_get_result('cms_p') as t (published integer, skipped integer);

select ok(
  pg_temp.draft() ->> 'hero' is not null
    and pg_temp.draft() -> 'hero' ->> 'title' = 'A2'
    and not exists (
      select 1 from public.cms_page_published pub join public.cms_pages p on p.id = pub.page_id
        where p.key = 'concurrency-fixture'
    ),
  'the new text stays in the draft and nothing was published'
);

-- 3. Taking the Edit Mode lock while a text is being written ---------------------

select dblink_exec('cms_a', 'begin');
select * from dblink('cms_a', pg_temp.set_texts('{"hero.subtitle": "B3"}')) as t (r text);
select dblink_send_query('cms_p', $$ select public.cms_page_lock_acquire('concurrency-fixture')::text $$);

select is(pg_temp.busy('cms_p'), 1, 'taking the lock waits for a write of the page');

select dblink_exec('cms_a', 'commit');
select set_config('cms_test.token', (select r from dblink_get_result('cms_p') as t (r text)), true);
select * from dblink_get_result('cms_p') as t (r text);

select ok(current_setting('cms_test.token') <> '', 'the editor gets the lock after the write');

select is(
  pg_temp.draft() -> 'hero' ->> 'subtitle',
  'B3',
  'so the editor loads a draft that already has the text'
);

-- 4. No foreign key deadlock between Edit Mode and the Texts screen ---------------

-- No draft: Edit Mode's save inserts one (a foreign key check on the page).
select dblink_exec('cms_setup', $sql$
  delete from public.cms_page_draft d using public.cms_pages p
    where p.id = d.page_id and p.key = 'concurrency-fixture';
$sql$);

-- Edit Mode: a request that holds the lock row (heartbeat), then saves.
select dblink_exec('cms_p', 'begin');
select * from dblink('cms_p', format(
  'select public.cms_page_lock_heartbeat(%L, %L)::text', 'concurrency-fixture', current_setting('cms_test.token')
)) as t (r text);

-- The Texts screen: takes the page mutex, then waits for the lock row.
select dblink_send_query('cms_a', pg_temp.set_texts('{"hero.title": "T4"}'));

select is(pg_temp.busy('cms_a'), 1, 'the Texts screen holds the page and waits for the Edit Mode lock row');

select ok(
  (select r from dblink('cms_p', format(
    'select public.cms_page_save_draft(%L, %L, %L, %L)::text',
    'concurrency-fixture', current_setting('cms_test.locale'), '{"hero": {"title": "Editor"}}', current_setting('cms_test.token')
  )) as t (r text)) is not null,
  'Edit Mode inserts a first draft meanwhile: its foreign key check does not wait for the mutex'
);

select ok(
  (select r from dblink('cms_p', format(
    'select public.cms_page_publish(%L, %L, %L)::text',
    'concurrency-fixture', current_setting('cms_test.locale'), current_setting('cms_test.token')
  )) as t (r text)) is not null,
  'Edit Mode publishes meanwhile: the revision insert does not wait either'
);

select dblink_exec('cms_p', 'commit');

select count(*) from dblink_get_result('cms_a', false) as t (r text);
select set_config('cms_test.error', dblink_error_message('cms_a'), true);
select count(*) from dblink_get_result('cms_a', false) as t (r text);

select ok(
  current_setting('cms_test.error') like '%is open in Edit Mode%',
  'the Texts screen then gets "open in Edit Mode"'
);

select ok(
  current_setting('cms_test.error') not like '%deadlock%',
  'and no deadlock'
);

-- Cleanup -------------------------------------------------------------------------

select * from dblink('cms_p', format(
  'select public.cms_page_lock_release(%L, %L)::text', 'concurrency-fixture', current_setting('cms_test.token')
)) as t (r text);

select dblink_disconnect('cms_a');
select dblink_disconnect('cms_b');
select dblink_disconnect('cms_p');

select dblink_exec('cms_setup', format($sql$
  delete from public.cms_activity
    where created_at >= %L::timestamptz
      and entity_type = 'page'
      and entity_label = 'concurrency-fixture';
  delete from public.cms_pages where key = 'concurrency-fixture';
  delete from public.cms_users where user_id in ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000d002');
  delete from auth.users where id in ('00000000-0000-4000-8000-00000000d001', '00000000-0000-4000-8000-00000000d002');
$sql$, current_setting('cms_test.started')));

select is(
  (select n from dblink('cms_setup', format(
     $sql$ select count(*)::int from public.cms_activity where created_at >= %L::timestamptz and entity_label = 'concurrency-fixture' $sql$,
     current_setting('cms_test.started'))) as t (n int)),
  0,
  'the run leaves no Activity event behind'
);

select dblink_disconnect('cms_setup');

select * from finish();

rollback;
