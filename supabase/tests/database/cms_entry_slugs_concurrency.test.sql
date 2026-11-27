-- Concurrent publishes of addresses (014, stage 2b): `npm run test:db`.
--
-- Real sessions over dblink (see cms_texts_concurrency.test.sql for why TCP
-- and a password). Their rows commit: users and entries have ids of their
-- own (`…0018xx`) and are removed at the start and at the end with their
-- Activity events. Nothing else is touched.
--
-- Checked, each time with the first publish still uncommitted while the
-- second runs:
--   1. two originals with one address: one wins, the other is refused;
--   2. an original against a translation of another entry with the same
--      address in that language (rows of different languages: only the type
--      lock serializes them, the unique index cannot): one wins.
-- Case 2 needs a second language; on a site without one it is skipped.

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
    delete from public.cms_activity where entity_id like '00000000-0000-4000-8000-0000000018%';
    delete from public.cms_entries where id::text like '00000000-0000-4000-8000-0000000018%';
    delete from public.cms_users where user_id in ('00000000-0000-4000-8000-0000000018a1', '00000000-0000-4000-8000-0000000018a2');
    delete from auth.users where id in ('00000000-0000-4000-8000-0000000018a1', '00000000-0000-4000-8000-0000000018a2');
  $sql$);
$$;

select pg_temp.cleanup();

-- The language of the original, and a second language if the site has one.
select set_config('cms_test.lang', coalesce(public.cms_default_locale(null), 'en'), true);
select set_config('cms_test.second', coalesce(
  (select l.code::text from public.cms_languages l where not l.is_default order by l.sort_order, l.code limit 1), ''
), true);

select dblink_exec('cms_setup', $sql$
  insert into auth.users (id, email) values
    ('00000000-0000-4000-8000-0000000018a1', 'admin-a-014-slug-conc@example.test'),
    ('00000000-0000-4000-8000-0000000018a2', 'admin-b-014-slug-conc@example.test');
  insert into public.cms_users (user_id, role, status) values
    ('00000000-0000-4000-8000-0000000018a1', 'admin', 'active'),
    ('00000000-0000-4000-8000-0000000018a2', 'admin', 'active');
  insert into public.cms_entries (id, type) values
    ('00000000-0000-4000-8000-000000001801', 'conc-post'),
    ('00000000-0000-4000-8000-000000001802', 'conc-post'),
    ('00000000-0000-4000-8000-000000001803', 'conc-post'),
    ('00000000-0000-4000-8000-000000001804', 'conc-post');
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

-- Lock, save and publish as one SQL text (run inside the session's transaction).
create function pg_temp.publish_sql(entry text, locale text, content jsonb)
returns text
language sql
as $$
  select format(
    $sql$
      select public.cms_entry_publish('conc-post', %1$L, %2$L, t.token)::text
        from (select public.cms_entry_lock_acquire('conc-post', %1$L) as token) t,
             lateral (select public.cms_entry_save_draft('conc-post', %1$L, %2$L, %3$L, t.token)) s
    $sql$,
    entry, locale, content::text
  )
$$;

select pg_temp.open_session('cms_a', '00000000-0000-4000-8000-0000000018a1');
select pg_temp.open_session('cms_b', '00000000-0000-4000-8000-0000000018a2');

-- Publishes in A (kept open), then the same address in B; B's outcome after A commits.
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

-- 1. Two originals ------------------------------------------------------------------------

select set_config('cms_test.outcome', pg_temp.race(
  pg_temp.publish_sql('00000000-0000-4000-8000-000000001801', current_setting('cms_test.lang'), '{"title": "A", "slug": "same"}'),
  pg_temp.publish_sql('00000000-0000-4000-8000-000000001802', current_setting('cms_test.lang'), '{"title": "B", "slug": "same"}')
), true);

select ok(current_setting('cms_test.outcome') like '%is taken%', 'the second original is refused: the address is taken');

select is(
  (select n from dblink('cms_setup', $sql$
     select count(*)::int from public.cms_entry_slugs where type = 'conc-post' and slug = 'same'
   $sql$) as t (n int)),
  1,
  'one entry holds the address'
);

select is(
  (select n from dblink('cms_setup', $sql$
     select count(*)::int from public.cms_page_published where page_id = '00000000-0000-4000-8000-000000001802'
   $sql$) as t (n int)),
  0,
  'the refused publish left no publication'
);

-- 2. An original against a translation ------------------------------------------------------

select skip('the site has no second language', 3)
  where current_setting('cms_test.second') = '';

-- B's entry needs an original first (a translation translates it).
select case when current_setting('cms_test.second') <> '' then
  (select r from dblink('cms_b', pg_temp.publish_sql(
     '00000000-0000-4000-8000-000000001804', current_setting('cms_test.lang'), '{"title": "D", "slug": "d-original"}'
   )) as t (r text))
end;

select set_config('cms_test.outcome2', case when current_setting('cms_test.second') <> '' then pg_temp.race(
  -- A: the original of 1803 takes `cross`, which by fallback is its address in every language.
  pg_temp.publish_sql('00000000-0000-4000-8000-000000001803', current_setting('cms_test.lang'), '{"title": "C", "slug": "cross"}'),
  -- B: the translation of 1804 takes `cross` in the second language.
  pg_temp.publish_sql('00000000-0000-4000-8000-000000001804', current_setting('cms_test.second'), '{"title": "D2", "slug": "cross"}')
) else '' end, true);

select ok(current_setting('cms_test.outcome2') like '%is taken%', 'the translation is refused: the original took the address there')
  where current_setting('cms_test.second') <> '';

select is(
  (select n from dblink('cms_setup', $sql$
     select count(*)::int from public.cms_entry_slugs where entry_id = '00000000-0000-4000-8000-000000001804' and slug = 'cross'
   $sql$) as t (n int)),
  0,
  'the translation did not get the address'
) where current_setting('cms_test.second') <> '';

select is(
  (select n from dblink('cms_setup', format($sql$
     select count(*)::int from (
       select coalesce(own.slug, original.slug)
         from public.cms_entries e
         cross join public.cms_languages l
         left join public.cms_entry_slugs own on own.entry_id = e.id and own.locale = l.code
         left join public.cms_entry_slugs original on original.entry_id = e.id and original.locale = %L
         where e.type = 'conc-post' and coalesce(own.slug, original.slug) is not null
         group by l.code, 1
         having count(*) > 1
     ) d
   $sql$, current_setting('cms_test.lang'))) as t (n int)),
  0,
  'no address leads to two entries in any language'
) where current_setting('cms_test.second') <> '';

-- Cleanup -------------------------------------------------------------------------------

select dblink_disconnect('cms_a');
select dblink_disconnect('cms_b');
select pg_temp.cleanup();

select is(
  (select n from dblink('cms_setup', $sql$
     select (select count(*) from public.cms_entries where id::text like '00000000-0000-4000-8000-0000000018%')
          + (select count(*) from public.cms_activity where entity_id like '00000000-0000-4000-8000-0000000018%')
   $sql$) as t (n int)),
  0,
  'the run leaves no entry or event behind'
);

select dblink_disconnect('cms_setup');

select * from finish();

rollback;
