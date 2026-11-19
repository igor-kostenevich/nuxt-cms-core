-- Forms and submissions (011): `npm run test:db`.
-- One transaction, rolled back at the end.

begin;

create extension if not exists pgtap with schema extensions;

select plan(44);

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-000000011001', 'owner-011@example.test'),
  ('00000000-0000-4000-8000-000000011002', 'admin-011@example.test'),
  ('00000000-0000-4000-8000-000000011003', 'editor-011@example.test');

insert into public.cms_users (user_id, role, status)
values
  ('00000000-0000-4000-8000-000000011001', 'owner', 'active'),
  ('00000000-0000-4000-8000-000000011002', 'admin', 'active'),
  ('00000000-0000-4000-8000-000000011003', 'editor', 'active');

delete from public.cms_form_submissions where form_key in ('contact', 'quote');
delete from public.cms_site_texts;
delete from public.cms_site_settings_translations;
delete from public.cms_page_locks where page_id is not null;
delete from public.cms_languages;
insert into public.cms_languages (code, name, native_name, active, is_default, sort_order)
values ('en', 'English', 'English', true, true, 0), ('de', 'German', 'Deutsch', false, false, 1);
delete from public.cms_forms where key in ('contact', 'quote');
delete from public.cms_form_rate_limits where bucket like '%:test-%' or bucket like 'client:test-%';

create function pg_temp.as_user(user_id text)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

-- Who may call and touch what ------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.cms_form_submit(text, jsonb, uuid, text, text, text, text, integer, integer, integer, integer)', 'execute')
    and not has_function_privilege('authenticated', 'public.cms_form_submit(text, jsonb, uuid, text, text, text, text, integer, integer, integer, integer)', 'execute'),
  'visitors and CMS users cannot write a submission directly'
);

select ok(
  has_function_privilege('service_role', 'public.cms_form_submit(text, jsonb, uuid, text, text, text, text, integer, integer, integer, integer)', 'execute'),
  'the server route (secret key) can'
);

select ok(
  not has_table_privilege('authenticated', 'public.cms_form_rate_limits', 'select')
    and not has_table_privilege('anon', 'public.cms_form_rate_limits', 'select'),
  'rate limit counters are not readable'
);

select ok(
  not has_table_privilege('authenticated', 'public.cms_form_submissions', 'insert')
    and not has_table_privilege('anon', 'public.cms_form_submissions', 'select'),
  'no direct insert; anon reads nothing'
);

select ok(
  has_column_privilege('authenticated', 'public.cms_form_submissions', 'location', 'update')
    and has_column_privilege('authenticated', 'public.cms_form_submissions', 'read_at', 'update')
    and not has_column_privilege('authenticated', 'public.cms_form_submissions', 'payload', 'update')
    and not has_column_privilege('authenticated', 'public.cms_form_submissions', 'form_key', 'update')
    and not has_column_privilege('authenticated', 'public.cms_form_submissions', 'created_at', 'update')
    and not has_column_privilege('authenticated', 'public.cms_form_submissions', 'client_token', 'update')
    and not has_column_privilege('authenticated', 'public.cms_form_submissions', 'search_text', 'update')
    and not has_column_privilege('authenticated', 'public.cms_form_submissions', 'payload_fingerprint', 'update'),
  'only where a submission is and whether it is read can change'
);

select ok(
  has_column_privilege('authenticated', 'public.cms_forms', 'enabled', 'update')
    and not has_column_privilege('authenticated', 'public.cms_forms', 'key', 'update')
    and has_column_privilege('authenticated', 'public.cms_forms', 'key', 'insert')
    and not has_column_privilege('authenticated', 'public.cms_forms', 'updated_by', 'insert'),
  'a form is turned on or off, never renamed; the stamp is the database''s'
);

-- Writing a submission (the function runs as its owner; the caller only needs execute) --

create temp table results (label text, status text, submission_id uuid);

create function pg_temp.submit(label text, form text, token text, body jsonb, client text, form_limit integer default 3, client_limit integer default 10)
returns void
language sql
as $$
  insert into results
    select label, r.status, r.submission_id
      from public.cms_form_submit(form, body, token::uuid, 'search', client, '/contact', 'en', form_limit, client_limit, 600) r;
$$;

select pg_temp.submit('first', 'contact', '00000000-0000-4000-8000-0000000110a1', '{"name": "Olena", "message": "Hi"}', 'test-a');

select is((select status from results where label = 'first'), 'ok', 'a valid submission is stored');

select is(
  (select payload_fingerprint from public.cms_form_submissions where id = (select submission_id from results where label = 'first')),
  encode(sha256(convert_to('{"name": "Olena", "message": "Hi"}'::jsonb::text, 'UTF8')), 'hex'),
  'its fingerprint is the hash of the stored payload'
);

select pg_temp.submit('retry', 'contact', '00000000-0000-4000-8000-0000000110a1', '{"message": "Hi", "name": "Olena"}', 'test-a');

select results_eq(
  $$ select status, submission_id from results where label = 'retry' $$,
  $$ select 'duplicate'::text, submission_id from results where label = 'first' $$,
  'a retry with the same token and values returns the same submission'
);

select is(
  (select count from public.cms_form_rate_limits where bucket = 'form:contact:test-a'),
  1,
  'a retry does not count against the limit'
);

select pg_temp.submit('reused', 'contact', '00000000-0000-4000-8000-0000000110a1', '{"name": "Someone else"}', 'test-a');

select results_eq(
  $$ select status, submission_id from results where label = 'reused' $$,
  $$ values ('token_reused'::text, null::uuid) $$,
  'the same token with other values is refused'
);

select is(
  (select count(*)::integer from public.cms_form_submissions where form_key = 'contact'),
  1,
  'retries made no new rows'
);

-- Limits: 3 per form and visitor in the window.
select pg_temp.submit('second', 'contact', '00000000-0000-4000-8000-0000000110a2', '{"name": "B"}', 'test-a');
select pg_temp.submit('third', 'contact', '00000000-0000-4000-8000-0000000110a3', '{"name": "C"}', 'test-a');
select pg_temp.submit('fourth', 'contact', '00000000-0000-4000-8000-0000000110a4', '{"name": "D"}', 'test-a');

select results_eq(
  $$ select status from results where label in ('second', 'third', 'fourth') order by label = 'fourth', label $$,
  $$ values ('ok'), ('ok'), ('rate_limited') $$,
  'the attempt over the limit of the form is refused'
);

select is(
  (select count from public.cms_form_rate_limits where bucket = 'form:contact:test-a'),
  4,
  'a refused attempt still counts (the status is returned, not raised)'
);

-- 5 per visitor across all forms.
select pg_temp.submit('other-form', 'quote', '00000000-0000-4000-8000-0000000110b1', '{"name": "E"}', 'test-a', 3, 5);
select pg_temp.submit('other-form-2', 'quote', '00000000-0000-4000-8000-0000000110b2', '{"name": "F"}', 'test-a', 3, 5);

select results_eq(
  $$ select status from results where label in ('other-form', 'other-form-2') order by label $$,
  $$ values ('ok'), ('rate_limited') $$,
  'trying another form does not get around the limit of the visitor'
);

select pg_temp.submit('other-visitor', 'contact', '00000000-0000-4000-8000-0000000110c1', '{"name": "G"}', 'test-b');

select is((select status from results where label = 'other-visitor'), 'ok', 'another visitor has a limit of their own');

insert into results
  select 'hidden-language', r.status, r.submission_id
    from public.cms_form_submit('contact', '{"name": "L"}', '00000000-0000-4000-8000-0000000110c2', '', 'test-l', '/de', 'de') r;

select results_eq(
  $$
    select s.locale::text from public.cms_form_submissions s
      where s.id in (select submission_id from results where label in ('first', 'hidden-language'))
      order by s.created_at, s.locale nulls last
  $$,
  $$ values ('en'::text), (null::text) $$,
  'the language is kept when it is active on the site, else left empty'
);

insert into public.cms_forms (key, enabled) values ('quote', false);
select pg_temp.submit('disabled', 'quote', '00000000-0000-4000-8000-0000000110d1', '{"name": "H"}', 'test-c');

select is((select status from results where label = 'disabled'), 'disabled', 'a form the owner turned off takes nothing');

select throws_ok(
  $$ select * from public.cms_form_submit('contact', '[1]', '00000000-0000-4000-8000-0000000110e1', '', 'test-d', '/', 'en') $$,
  '22023', null, 'the payload must be an object'
);

insert into public.cms_form_rate_limits (bucket, window_start, count)
  values ('client:test-old', now() - interval '2 days', 1);
select pg_temp.submit('cleanup', 'contact', '00000000-0000-4000-8000-0000000110f1', '{"name": "I"}', 'test-e');

select is(
  (select count(*)::integer from public.cms_form_rate_limits where bucket = 'client:test-old'),
  0,
  'old windows are cleaned up by the next submission'
);

-- No trustworthy address: only the ceiling of the form, no shared visitor bucket.
create function pg_temp.submit_total(label text, token text, client text, total_limit integer)
returns void
language sql
as $$
  insert into results
    select label, r.status, r.submission_id
      from public.cms_form_submit('limits', '{"name": "T"}'::jsonb, token::uuid, '', client, '/', 'en', 2, 10, 600, total_limit) r;
$$;

select pg_temp.submit_total('anonymous-1', '00000000-0000-4000-8000-0000000111a1', null, 3);
select pg_temp.submit_total('anonymous-2', '00000000-0000-4000-8000-0000000111a2', null, 3);

select is(
  (select count(*)::integer from public.cms_form_rate_limits where bucket like 'form:limits:%' or bucket like 'client:%' and bucket not like 'client:test-%'),
  0,
  'a visitor without an address gets no visitor bucket'
);

select is(
  (select count from public.cms_form_rate_limits where bucket = 'total:limits'),
  2,
  'but counts against the ceiling of the form'
);

-- A visitor blocked by their own limit (2 per form here) does not use up the ceiling of the others.
select pg_temp.submit_total('spammer-1', '00000000-0000-4000-8000-0000000111b1', 'test-s', 3);
select pg_temp.submit_total('spammer-2', '00000000-0000-4000-8000-0000000111b2', 'test-s', 3);
select pg_temp.submit_total('spammer-3', '00000000-0000-4000-8000-0000000111b3', 'test-s', 3);

select results_eq(
  $$ select status from results where label like 'anonymous-%' or label like 'spammer-%' order by label $$,
  $$ values ('ok'), ('ok'), ('ok'), ('form_limited'), ('rate_limited') $$,
  'the ceiling of the form refuses everyone over it, whatever the address'
);

select is(
  (select count from public.cms_form_rate_limits where bucket = 'total:limits'),
  4,
  'an attempt refused by the ceiling counts; one refused by a visitor limit would not'
);

select throws_ok(
  $$ select * from public.cms_form_submit('limits', '{}', '00000000-0000-4000-8000-0000000111c1', '', 'test-n', '/', 'en', null) $$,
  '22023', null, 'a missing limit is refused, not read as "no limit"'
);

-- Reading and handling ------------------------------------------------------------------

select set_config('cms_test.first', (select submission_id::text from results where label = 'first'), true);
select set_config('cms_test.second', (select submission_id::text from results where label = 'second'), true);

select pg_temp.as_user('00000000-0000-4000-8000-000000011003');

select is((select count(*)::integer from public.cms_form_submissions), 0, 'an editor sees no submissions');

select is(
  (select count(*)::integer from public.cms_form_stats()),
  0,
  'nor their numbers'
);

update public.cms_form_submissions set location = 'spam' where id = current_setting('cms_test.first')::uuid;
delete from public.cms_form_submissions where id = current_setting('cms_test.first')::uuid;

select throws_ok(
  $$ select public.cms_form_set_enabled('contact', false) $$,
  '42501', null, 'an editor cannot turn a form off'
);

reset role;

select is(
  (select location from public.cms_form_submissions where id = current_setting('cms_test.first')::uuid),
  'inbox',
  'an editor changes and deletes nothing'
);

select pg_temp.as_user('00000000-0000-4000-8000-000000011002');

select is(
  (select count(*)::integer from public.cms_form_submissions where form_key in ('contact', 'quote')),
  7,
  'an admin sees the submissions'
);

reset role;
select pg_temp.as_user('00000000-0000-4000-8000-000000011001');

select lives_ok(
  $$ update public.cms_form_submissions set location = 'archived', read_at = now() where id = current_setting('cms_test.first')::uuid $$,
  'the owner archives and reads a submission'
);

select throws_ok(
  $$ update public.cms_form_submissions set payload = '{}' where id = current_setting('cms_test.first')::uuid $$,
  '42501', null, 'the payload cannot change'
);

select throws_ok(
  $$ update public.cms_form_submissions set form_key = 'quote' where id = current_setting('cms_test.first')::uuid $$,
  '42501', null, 'the form cannot change'
);

select throws_ok(
  $$ update public.cms_form_submissions set created_at = now() where id = current_setting('cms_test.first')::uuid $$,
  '42501', null, 'the time cannot change'
);

select throws_ok(
  $$ update public.cms_form_submissions set client_token = gen_random_uuid() where id = current_setting('cms_test.first')::uuid $$,
  '42501', null, 'the client token cannot change'
);

select throws_ok(
  $$ update public.cms_form_submissions set search_text = 'x' where id = current_setting('cms_test.first')::uuid $$,
  '42501', null, 'the search text cannot change'
);

select throws_ok(
  $$ insert into public.cms_form_submissions (form_key, payload, payload_fingerprint, client_token) values ('contact', '{}', 'x', gen_random_uuid()) $$,
  '42501', null, 'a submission cannot be inserted from the admin'
);

select lives_ok(
  $$ delete from public.cms_form_submissions where id = current_setting('cms_test.second')::uuid $$,
  'the owner deletes a submission'
);

select lives_ok(
  $$ select public.cms_form_set_enabled('contact', false) $$,
  'the owner turns a form off'
);

select throws_ok(
  $$ update public.cms_forms set key = 'renamed' where key = 'contact' $$,
  '42501', null, 'a form cannot be renamed'
);

select results_eq(
  $$ select form_key, total, unread from public.cms_form_stats() where form_key = 'contact' $$,
  $$ values ('contact'::text, 5::bigint, 4::bigint) $$,
  'numbers per form: total without spam, unread in the inbox'
);

reset role;

select results_eq(
  $$
    select location, read_at is not null from public.cms_form_submissions where id = current_setting('cms_test.first')::uuid
    union all
    select 'deleted', true where not exists (select 1 from public.cms_form_submissions where id = current_setting('cms_test.second')::uuid)
  $$,
  $$ values ('archived'::text, true), ('deleted', true) $$,
  'what the owner did is stored'
);

select results_eq(
  $$ select enabled, updated_by from public.cms_forms where key = 'contact' $$,
  $$ values (false, '00000000-0000-4000-8000-000000011001'::uuid) $$,
  'the database stamps who turned it off'
);

set local role anon;

select throws_ok(
  $$ select * from public.cms_form_submissions $$,
  '42501', null, 'anon cannot read submissions'
);

reset role;

select * from finish();

rollback;
