-- Documents (014, stage 1): `npm run test:db`.
--
-- Checked:
--   1. every page has a document of kind 'page', and no document is left
--      without its subtype row (after the migration and after each scenario);
--   2. inserting a page creates its document, a skipped ON CONFLICT insert does not;
--   3. a document cannot belong to two subtypes, its id cannot change;
--   4. deleting the page or the document removes both and the content;
--   5. who may read cms_documents;
--   6. two sessions creating the same page lazily (the Edit Mode lock) at once
--      leave one page and one document.

begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(17);

-- A document without its subtype row (a page, or since 2a an entry).
create function pg_temp.orphans()
returns integer
language sql
as $$
  select count(*)::int
    from public.cms_documents d
    where not exists (select 1 from public.cms_pages p where p.id = d.id)
      and not exists (select 1 from public.cms_entries e where e.id = d.id)
$$;

-- 1. Existing pages ------------------------------------------------------------------

select is(
  (select count(*)::int from public.cms_pages p
     left join public.cms_documents d on d.id = p.id and d.kind = 'page'
     where d.id is null),
  0,
  'every page has a document of kind page'
);

select is(pg_temp.orphans(), 0, 'no document without its page');

-- 2. Creation -----------------------------------------------------------------------

insert into public.cms_pages (id, key) values ('00000000-0000-4000-8000-00000000e101', 'documents-fixture');

select is(
  (select kind from public.cms_documents where id = '00000000-0000-4000-8000-00000000e101'),
  'page',
  'inserting a page creates its document'
);

select lives_ok(
  $$ insert into public.cms_pages (key) values ('documents-fixture') on conflict (key) do nothing $$,
  'a second insert of the key is skipped'
);

select is(pg_temp.orphans(), 0, 'a skipped insert leaves no document');

-- 3. Exclusivity --------------------------------------------------------------------

insert into public.cms_documents (id, kind) values ('00000000-0000-4000-8000-00000000e102', 'entry');

select throws_ok(
  $$ insert into public.cms_pages (id, key) values ('00000000-0000-4000-8000-00000000e102', 'documents-taken') $$,
  '23505',
  null,
  'a page cannot take the id of another document'
);

delete from public.cms_documents where id = '00000000-0000-4000-8000-00000000e102';

select throws_ok(
  $$ update public.cms_pages set id = '00000000-0000-4000-8000-00000000e103' where key = 'documents-fixture' $$,
  '23514',
  null,
  'the id of a page cannot change'
);

-- 4. Deletion -----------------------------------------------------------------------

insert into public.cms_page_draft (page_id, locale, content)
  values ('00000000-0000-4000-8000-00000000e101', coalesce(public.cms_default_locale(null), 'en'), '{}');

delete from public.cms_pages where key = 'documents-fixture';

select is(
  (select count(*)::int from public.cms_documents where id = '00000000-0000-4000-8000-00000000e101'),
  0,
  'deleting a page deletes its document'
);

select is(
  (select count(*)::int from public.cms_page_draft where page_id = '00000000-0000-4000-8000-00000000e101'),
  0,
  'and its content'
);

insert into public.cms_pages (id, key) values ('00000000-0000-4000-8000-00000000e104', 'documents-fixture-2');
insert into public.cms_page_draft (page_id, locale, content)
  values ('00000000-0000-4000-8000-00000000e104', coalesce(public.cms_default_locale(null), 'en'), '{}');

delete from public.cms_documents where id = '00000000-0000-4000-8000-00000000e104';

select is(
  (select count(*)::int from public.cms_pages where id = '00000000-0000-4000-8000-00000000e104')
    + (select count(*)::int from public.cms_page_draft where page_id = '00000000-0000-4000-8000-00000000e104'),
  0,
  'deleting a document deletes its page and content'
);

select is(pg_temp.orphans(), 0, 'still no document without its page');

-- 5. Access -------------------------------------------------------------------------

insert into public.cms_pages (key) values ('documents-fixture-3');
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-00000000e001', 'editor-014-documents@example.test'),
  ('00000000-0000-4000-8000-00000000e002', 'outsider-014-documents@example.test');
insert into public.cms_users (user_id, role, status) values
  ('00000000-0000-4000-8000-00000000e001', 'editor', 'active');

set local role anon;

select throws_ok(
  $$ select count(*) from public.cms_documents $$,
  '42501',
  null,
  'anon cannot read documents'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000e002", "role": "authenticated"}', true);

select is(
  (select count(*)::int from public.cms_documents),
  0,
  'a signed-in user without CMS access sees no documents'
);

select throws_ok(
  $$ insert into public.cms_documents (id, kind) values (gen_random_uuid(), 'page') $$,
  '42501',
  null,
  'and cannot create one'
);

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-00000000e001", "role": "authenticated"}', true);

select ok(
  exists (select 1 from public.cms_documents d join public.cms_pages p on p.id = d.id where p.key = 'documents-fixture-3'),
  'an editor sees documents'
);

reset role;

-- 6. Concurrent lazy creation ---------------------------------------------------------

-- Real sessions over dblink, like cms_texts_concurrency.test.sql: their
-- fixtures commit, have keys of their own and are removed at the end.
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

select dblink_exec('cms_setup', $sql$
  delete from public.cms_pages where key = 'documents-race';
  delete from public.cms_users where user_id in ('00000000-0000-4000-8000-00000000e011', '00000000-0000-4000-8000-00000000e012');
  delete from auth.users where id in ('00000000-0000-4000-8000-00000000e011', '00000000-0000-4000-8000-00000000e012');
  insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-00000000e011', 'editor-a-014-documents@example.test'),
    ('00000000-0000-4000-8000-00000000e012', 'editor-b-014-documents@example.test');
  insert into public.cms_users (user_id, role, status) values
    ('00000000-0000-4000-8000-00000000e011', 'editor', 'active'),
    ('00000000-0000-4000-8000-00000000e012', 'editor', 'active');
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

select pg_temp.open_session('cms_a', '00000000-0000-4000-8000-00000000e011');
select pg_temp.open_session('cms_b', '00000000-0000-4000-8000-00000000e012');

-- A creates the page and holds its transaction; B tries the same key, waits on
-- the unique index, then skips the insert and finds the page locked by A.
select dblink_exec('cms_a', 'begin');
select * from dblink('cms_a', $$ select public.cms_page_lock_acquire('documents-race')::text $$) as t (r text);
select dblink_send_query('cms_b', $$ select public.cms_page_lock_acquire('documents-race')::text $$);
select pg_sleep(0.2);
select dblink_exec('cms_a', 'commit');

select count(*) from dblink_get_result('cms_b', false) as t (r text);
select set_config('cms_test.error', coalesce(dblink_error_message('cms_b'), ''), true);
select count(*) from dblink_get_result('cms_b', false) as t (r text);

select ok(
  current_setting('cms_test.error') like '%being edited by another user%',
  'the second session gets "being edited", not a duplicate key error'
);

select is(
  (select r::int from dblink('cms_setup', $sql$
     select (select count(*) from public.cms_pages where key = 'documents-race')
       + (select count(*) from public.cms_documents d
            where not exists (select 1 from public.cms_pages p where p.id = d.id)
              and not exists (select 1 from public.cms_entries e where e.id = d.id))
   $sql$) as t (r text)),
  1,
  'one page, one document, no orphan'
);

select dblink_disconnect('cms_a');
select dblink_disconnect('cms_b');

select dblink_exec('cms_setup', $sql$
  delete from public.cms_pages where key = 'documents-race';
  delete from public.cms_users where user_id in ('00000000-0000-4000-8000-00000000e011', '00000000-0000-4000-8000-00000000e012');
  delete from auth.users where id in ('00000000-0000-4000-8000-00000000e011', '00000000-0000-4000-8000-00000000e012');
$sql$);
select dblink_disconnect('cms_setup');

select * from finish();

rollback;
