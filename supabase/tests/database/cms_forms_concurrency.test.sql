-- Concurrent form submissions (011): `npm run test:db`.
--
-- Real sessions over dblink (see cms_texts_concurrency.test.sql for why TCP
-- and a password). Their rows commit: they use the form key `concurrency`
-- and buckets `…:test-conc…`, removed at the start and at the end.
--
-- Checked:
--   1. the same token and values at once: one submission, one counted attempt;
--   2. the same token with other values at once: token_reused;
--   3. different tokens at the limit at once: no lost count, the limit holds.

begin;

create extension if not exists pgtap with schema extensions;
create extension if not exists dblink with schema extensions;

select plan(8);

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

create function pg_temp.cleanup()
returns void
language sql
as $$
  select dblink_exec(current_setting('cms_test.conn'), $sql$
    delete from public.cms_form_submissions where form_key = 'concurrency';
    delete from public.cms_form_rate_limits where bucket like '%test-conc%';
  $sql$);
$$;

select pg_temp.cleanup();

select dblink_connect('cms_a', current_setting('cms_test.conn'));
select dblink_connect('cms_b', current_setting('cms_test.conn'));

-- A call of cms_form_submit as SQL text: status and id as text.
create function pg_temp.submit(token text, body text, client text, form_limit integer default 5)
returns text
language sql
as $$
  select format(
    'select status, submission_id::text from public.cms_form_submit(%L, %L::jsonb, %L::uuid, %L, %L, %L, %L, %s, 10, 600)',
    'concurrency', body, token, '', client, '/', 'en', form_limit
  )
$$;

create function pg_temp.busy(name text)
returns integer
language sql
as $$
  select pg_sleep(0.3);
  select dblink_is_busy(name);
$$;

-- 1. The same token and values at once -------------------------------------------------

select dblink_exec('cms_a', 'begin');
select count(*) from dblink('cms_a', pg_temp.submit('00000000-0000-4000-8000-0000000c0001', '{"name": "A"}', 'test-conc-1'))
  as t (status text, id text);
select dblink_send_query('cms_b', pg_temp.submit('00000000-0000-4000-8000-0000000c0001', '{"name": "A"}', 'test-conc-1'));

select is(pg_temp.busy('cms_b'), 1, 'a retry with the same token waits for the first request');

select dblink_exec('cms_a', 'commit');

create temp table second_result as
  select * from dblink_get_result('cms_b') as t (status text, id text);
select count(*) from dblink_get_result('cms_b') as t (status text, id text);

select results_eq(
  $$ select status, id::uuid from second_result $$,
  $$ select 'duplicate'::text, id from public.cms_form_submissions where form_key = 'concurrency' $$,
  'it then finds the submission and returns it'
);

select is(
  (select count from public.cms_form_rate_limits where bucket = 'form:concurrency:test-conc-1'),
  1,
  'one submission, one counted attempt'
);

-- 2. The same token with other values at once -------------------------------------------

select dblink_exec('cms_a', 'begin');
select count(*) from dblink('cms_a', pg_temp.submit('00000000-0000-4000-8000-0000000c0002', '{"name": "B"}', 'test-conc-2'))
  as t (status text, id text);
select dblink_send_query('cms_b', pg_temp.submit('00000000-0000-4000-8000-0000000c0002', '{"name": "Other"}', 'test-conc-2'));
select pg_temp.busy('cms_b');
select dblink_exec('cms_a', 'commit');

select results_eq(
  $$ select status from dblink_get_result('cms_b') as t (status text, id text) $$,
  $$ values ('token_reused'::text) $$,
  'other values with the same token are refused'
);
select count(*) from dblink_get_result('cms_b') as t (status text, id text);

-- 3. Different tokens at the limit at once (limit 2) --------------------------------------

select dblink_exec('cms_a', 'begin');
select count(*) from dblink('cms_a', pg_temp.submit('00000000-0000-4000-8000-0000000c0003', '{"n": 1}', 'test-conc-3', 2))
  as t (status text, id text);
select dblink_send_query('cms_b', pg_temp.submit('00000000-0000-4000-8000-0000000c0004', '{"n": 2}', 'test-conc-3', 2));

select is(pg_temp.busy('cms_b'), 1, 'a second visitor request waits on the counter row');

select dblink_exec('cms_a', 'commit');

select results_eq(
  $$ select status from dblink_get_result('cms_b') as t (status text, id text) $$,
  $$ values ('ok'::text) $$,
  'and then counts on top of the first one'
);
select count(*) from dblink_get_result('cms_b') as t (status text, id text);

select results_eq(
  $$ select status from dblink('cms_a', pg_temp.submit('00000000-0000-4000-8000-0000000c0005', '{"n": 3}', 'test-conc-3', 2)) as t (status text, id text) $$,
  $$ values ('rate_limited'::text) $$,
  'the third is over the limit: no count was lost'
);

select is(
  (select count(*)::integer from public.cms_form_submissions where form_key = 'concurrency' and payload ? 'n'),
  2,
  'exactly the limit got in'
);

select dblink_disconnect('cms_a');
select dblink_disconnect('cms_b');
select pg_temp.cleanup();

select * from finish();

rollback;
