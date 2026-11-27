-- Concurrent reorder and media delete (014, stage 2c): `npm run test:db`.
--
-- Real sessions over dblink (see cms_texts_concurrency.test.sql for why TCP
-- and a password). Their rows commit: users, entries (type `conc-order`) and
-- media have ids of their own (`…0020xx`) and are removed at the start and at
-- the end, with their Activity events. Nothing else is touched.
--
-- Checked, each time with the first session still uncommitted:
--   1. two reorders from the same version: one wins, the other is refused,
--      one Activity event, the winner's order stays;
--   2. a draft save that starts using a media item, and a delete of that
--      item: the delete waits for the save and is refused.

begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(7);

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

create function pg_temp.cleanup()
returns void
language sql
as $$
  select dblink_exec('cms_setup', $sql$
    delete from public.cms_activity
      where entity_id like '00000000-0000-4000-8000-0000000020%'
         or (entity_type = 'entry' and details ->> 'type' = 'conc-order');
    delete from public.cms_entries where id::text like '00000000-0000-4000-8000-0000000020%';
    delete from public.cms_media where id::text like '00000000-0000-4000-8000-0000000020%';
    delete from public.cms_users where user_id in ('00000000-0000-4000-8000-0000000020a1', '00000000-0000-4000-8000-0000000020a2');
    delete from auth.users where id in ('00000000-0000-4000-8000-0000000020a1', '00000000-0000-4000-8000-0000000020a2');
  $sql$);
$$;

select pg_temp.cleanup();

select dblink_exec('cms_setup', $sql$
  insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-0000000020a1', 'admin-a-014-manage-conc@example.test'),
    ('00000000-0000-4000-8000-0000000020a2', 'admin-b-014-manage-conc@example.test');
  insert into public.cms_users (user_id, role, status) values
    ('00000000-0000-4000-8000-0000000020a1', 'admin', 'active'),
    ('00000000-0000-4000-8000-0000000020a2', 'admin', 'active');
  insert into public.cms_entries (id, type, sort_order) values
    ('00000000-0000-4000-8000-000000002001', 'conc-order', 0),
    ('00000000-0000-4000-8000-000000002002', 'conc-order', 1),
    ('00000000-0000-4000-8000-000000002003', 'conc-order', 2);
  insert into public.cms_media (id, storage_path, display_name, mime, size) values
    ('00000000-0000-4000-8000-0000000020d1', '00000000-0000-4000-8000-0000000020d1.jpg', 'conc.jpg', 'image/jpeg', 1);
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

select pg_temp.open_session('cms_a', '00000000-0000-4000-8000-0000000020a1');
select pg_temp.open_session('cms_b', '00000000-0000-4000-8000-0000000020a2');

-- Runs `a_sql` in A (kept open), sends `b_sql` to B, commits A; B's error or 'ok'.
create function pg_temp.race(a_sql text, b_sql text)
returns text
language plpgsql
as $$
declare
  outcome text;
begin
  perform dblink_exec('cms_a', 'begin');
  perform * from dblink('cms_a', a_sql) as t (r text);
  perform dblink_send_query('cms_b', b_sql);
  perform pg_sleep(0.3);
  perform dblink_exec('cms_a', 'commit');

  perform * from dblink_get_result('cms_b', false) as t (r text);
  outcome := coalesce(nullif(dblink_error_message('cms_b'), 'OK'), 'ok');
  perform * from dblink_get_result('cms_b', false) as t (r text);
  return outcome;
end;
$$;

-- 1. Two reorders from one version ----------------------------------------------------------

select set_config('cms_test.version', (
  select v from dblink('cms_setup', $sql$ select public.cms_entry_order_version('conc-order') $sql$) as t (v text)
), true);

select set_config('cms_test.outcome', pg_temp.race(
  format($sql$ select public.cms_entry_reorder('conc-order', array['00000000-0000-4000-8000-000000002003', '00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000002001']::uuid[], %L) $sql$,
         current_setting('cms_test.version')),
  format($sql$ select public.cms_entry_reorder('conc-order', array['00000000-0000-4000-8000-000000002002', '00000000-0000-4000-8000-000000002001', '00000000-0000-4000-8000-000000002003']::uuid[], %L) $sql$,
         current_setting('cms_test.version'))
), true);

select ok(current_setting('cms_test.outcome') like '%changed meanwhile%', 'the second reorder from the same version is refused');

select is(
  (select o from dblink('cms_setup', $sql$
     select string_agg(right(id::text, 4), ',' order by sort_order, id) from public.cms_entries where type = 'conc-order'
   $sql$) as t (o text)),
  '2003,2002,2001',
  'the first order stays'
);

select is(
  (select n from dblink('cms_setup', $sql$
     select count(*)::int from public.cms_activity where action = 'reorder' and details ->> 'type' = 'conc-order'
   $sql$) as t (n int)),
  1,
  'one reorder event'
);

-- 2. A save that starts using a media item, and a delete of it -------------------------------

select set_config('cms_test.token', (
  select t from dblink('cms_a', $sql$
    select public.cms_entry_lock_acquire('conc-order', '00000000-0000-4000-8000-000000002001')::text
  $sql$) as r (t text)
), true);

select set_config('cms_test.outcome2', pg_temp.race(
  format($sql$ select public.cms_entry_save_draft('conc-order', '00000000-0000-4000-8000-000000002001', %L,
                 '{"title": "With photo", "photo": {"mediaId": "00000000-0000-4000-8000-0000000020d1"}}', %L)::text $sql$,
         coalesce((select v from dblink('cms_setup', $q$ select public.cms_default_locale('en') $q$) as t (v text)), 'en'),
         current_setting('cms_test.token')),
  $sql$ select public.cms_media_delete('00000000-0000-4000-8000-0000000020d1')::text $sql$
), true);

select ok(current_setting('cms_test.outcome2') like '%used on the site%', 'the delete waits for the save and sees the new use');

select is(
  (select n from dblink('cms_setup', $sql$
     select count(*)::int from public.cms_media where id = '00000000-0000-4000-8000-0000000020d1' and deleted_at is null
   $sql$) as t (n int)),
  1,
  'the media item stays'
);

select is(
  (select n from dblink('cms_setup', $sql$
     select count(*)::int from public.cms_media_references(array['00000000-0000-4000-8000-0000000020d1']::uuid[])
   $sql$) as t (n int)),
  1,
  'and is used by the entry draft'
);

-- Cleanup -------------------------------------------------------------------------------

select dblink_disconnect('cms_a');
select dblink_disconnect('cms_b');
select pg_temp.cleanup();

select is(
  (select n from dblink('cms_setup', $sql$
     select (select count(*) from public.cms_entries where id::text like '00000000-0000-4000-8000-0000000020%')
          + (select count(*) from public.cms_media where id::text like '00000000-0000-4000-8000-0000000020%')
          + (select count(*) from public.cms_activity
               where entity_id like '00000000-0000-4000-8000-0000000020%' or details ->> 'type' = 'conc-order')
   $sql$) as t (n int)),
  0,
  'the run leaves no entry, media or event behind'
);

select dblink_disconnect('cms_setup');

select * from finish();

rollback;
