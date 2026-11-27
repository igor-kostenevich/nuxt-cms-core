-- Concurrent create and the real lock of entries (014, stage 2a): `npm run test:db`.
--
-- Real sessions over dblink (see cms_texts_concurrency.test.sql for why TCP
-- and a password). Their rows commit: users and entries have ids of their
-- own (`…0016xx`) and are removed at the start and at the end, with their
-- Activity events (of this run or of an interrupted one: the ids belong to
-- this test only). Nothing else is touched.
--
-- Checked:
--   1. the same create sent twice at once (a retry while the first is still
--      running): one entry, one create event, both answers name it;
--   2. a create retried after the first committed (its answer was lost):
--      the same entry, nothing new;
--   3. the same id from two users at once: one entry, the other is refused;
--   4. the lock across sessions: a second editor is locked out, then gets
--      the entry once the first releases it.

begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(13);

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

create function pg_temp.cleanup()
returns void
language sql
as $$
  select dblink_exec('cms_setup', $sql$
    delete from public.cms_activity where entity_id like '00000000-0000-4000-8000-0000000016%';
    delete from public.cms_entries where id::text like '00000000-0000-4000-8000-0000000016%';
    delete from public.cms_users where user_id in ('00000000-0000-4000-8000-0000000016e1', '00000000-0000-4000-8000-0000000016e2');
    delete from auth.users where id in ('00000000-0000-4000-8000-0000000016e1', '00000000-0000-4000-8000-0000000016e2');
  $sql$);
$$;

select pg_temp.cleanup();

select dblink_exec('cms_setup', $sql$
  insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-0000000016e1', 'editor-a-014-conc@example.test'),
    ('00000000-0000-4000-8000-0000000016e2', 'editor-b-014-conc@example.test');
  insert into public.cms_users (user_id, role, status) values
    ('00000000-0000-4000-8000-0000000016e1', 'editor', 'active'),
    ('00000000-0000-4000-8000-0000000016e2', 'editor', 'active');
$sql$);

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

-- A create as SQL text; `en` is the bootstrap language of an empty site.
create function pg_temp.create_sql(entry_id text, title text, take_lock boolean)
returns text
language sql
as $$
  select format(
    $sql$ select id::text, (lock_token is not null)::text from public.cms_entry_create('job', %L, %L, %L, 'en') $sql$,
    json_build_object('title', title)::text, take_lock, entry_id
  )
$$;

-- Two sessions of editor A (two tabs, or a retry), one of editor B.
select pg_temp.open_session('cms_a1', '00000000-0000-4000-8000-0000000016e1');
select pg_temp.open_session('cms_a2', '00000000-0000-4000-8000-0000000016e1');
select pg_temp.open_session('cms_b', '00000000-0000-4000-8000-0000000016e2');

-- 1. The same create at once ------------------------------------------------------------

select dblink_exec('cms_a1', 'begin');
select * from dblink('cms_a1', pg_temp.create_sql('00000000-0000-4000-8000-000000001601', 'Designer', true)) as t (id text, locked text);
-- The retry waits on the primary key of the uncommitted first.
select dblink_send_query('cms_a2', pg_temp.create_sql('00000000-0000-4000-8000-000000001601', 'Designer', true));
select pg_sleep(0.2);
select dblink_exec('cms_a1', 'commit');

select results_eq(
  $$ select id, locked from dblink_get_result('cms_a2') as t (id text, locked text) $$,
  $$ values ('00000000-0000-4000-8000-000000001601'::text, 'true'::text) $$,
  'the concurrent retry answers with the same entry and the lock'
);
select count(*) from dblink_get_result('cms_a2') as t (id text, locked text);

select is(
  (select n from dblink('cms_setup', $sql$
     select (select count(*) from public.cms_entries where id = '00000000-0000-4000-8000-000000001601')::int
   $sql$) as t (n int)),
  1,
  'one entry'
);

select is(
  (select n from dblink('cms_setup', format($sql$
     select count(*)::int from public.cms_activity
       where action = 'create' and entity_id = '00000000-0000-4000-8000-000000001601' and created_at >= %L::timestamptz
   $sql$, current_setting('cms_test.started'))) as t (n int)),
  1,
  'one create event'
);

select is(
  (select n from dblink('cms_setup', $sql$
     select count(*)::int from public.cms_page_locks where page_id = '00000000-0000-4000-8000-000000001601'
   $sql$) as t (n int)),
  1,
  'one lock, held by the editor'
);

-- 2. A retry after the first committed --------------------------------------------------

select results_eq(
  format($$ select id from dblink('cms_a1', %L) as t (id text, locked text) $$,
         pg_temp.create_sql('00000000-0000-4000-8000-000000001601', 'Designer', false)),
  $$ values ('00000000-0000-4000-8000-000000001601'::text) $$,
  'a later retry returns the same entry'
);

select is(
  (select n from dblink('cms_setup', $sql$
     select (select count(*) from public.cms_entries where id::text like '00000000-0000-4000-8000-0000000016%')::int
   $sql$) as t (n int)),
  1,
  'and creates nothing'
);

-- 3. One id from two users at once ------------------------------------------------------

select dblink_exec('cms_a1', 'begin');
select * from dblink('cms_a1', pg_temp.create_sql('00000000-0000-4000-8000-000000001602', 'Mine', false)) as t (id text, locked text);
select dblink_send_query('cms_b', pg_temp.create_sql('00000000-0000-4000-8000-000000001602', 'Theirs', false));
select pg_sleep(0.2);
select dblink_exec('cms_a1', 'commit');

select count(*) from dblink_get_result('cms_b', false) as t (id text, locked text);
select set_config('cms_test.error', coalesce(dblink_error_message('cms_b'), ''), true);
select count(*) from dblink_get_result('cms_b', false) as t (id text, locked text);

select ok(current_setting('cms_test.error') like '%id is taken%', 'the second user is refused');

select is(
  (select title from dblink('cms_setup', $sql$
     select d.content ->> 'title' from public.cms_page_draft d where d.page_id = '00000000-0000-4000-8000-000000001602'
   $sql$) as t (title text)),
  'Mine',
  'the entry is the first user''s'
);

-- 4. The lock across sessions -------------------------------------------------------------

select ok(
  (select dblink_exec('cms_b', $sql$ select public.cms_entry_lock_acquire('job', '00000000-0000-4000-8000-000000001601') $sql$, false)) like 'ERROR%'
    and dblink_error_message('cms_b') like '%being edited by another user%',
  'editor B is locked out while editor A holds the lock'
);

-- Tokens are not readable by clients; the setup session reads it for the test.
select set_config('cms_test.token', (
  select t from dblink('cms_setup', $sql$
    select token::text from public.cms_page_locks where page_id = '00000000-0000-4000-8000-000000001601'
  $sql$) as r (t text)
), true);

select is(
  (select t from dblink('cms_a1', format(
     $sql$ select public.cms_entry_save_draft('job', '00000000-0000-4000-8000-000000001601', 'en', '{"title": "Designer 2"}', %L)::text $sql$,
     current_setting('cms_test.token'))) as r (t text)) is not null,
  true,
  'editor A saves under the lock'
);

select lives_ok(
  format($$ select * from dblink('cms_a1', %L) as t (r text) $$, format(
    $sql$ select public.cms_entry_lock_release('job', '00000000-0000-4000-8000-000000001601', %L)::text $sql$,
    current_setting('cms_test.token'))),
  'editor A releases'
);

select ok(
  (select t from dblink('cms_b', $sql$
     select public.cms_entry_lock_acquire('job', '00000000-0000-4000-8000-000000001601')::text
   $sql$) as r (t text)) is not null,
  'then editor B gets the lock'
);

-- Cleanup -------------------------------------------------------------------------------

select dblink_disconnect('cms_a1');
select dblink_disconnect('cms_a2');
select dblink_disconnect('cms_b');
select pg_temp.cleanup();

select is(
  (select n from dblink('cms_setup', format($sql$
     select (select count(*) from public.cms_entries where id::text like '00000000-0000-4000-8000-0000000016%%')
          + (select count(*) from public.cms_documents where id::text like '00000000-0000-4000-8000-0000000016%%')
          + (select count(*) from public.cms_activity where created_at >= %L::timestamptz and entity_id like '00000000-0000-4000-8000-0000000016%%')
   $sql$, current_setting('cms_test.started'))) as t (n int)),
  0,
  'the run leaves no entry, document or event behind'
);

select dblink_disconnect('cms_setup');

select * from finish();

rollback;
