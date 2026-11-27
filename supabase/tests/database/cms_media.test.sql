-- Media (009): `npm run test:db`.
-- Self-contained: own users, files and page, one transaction, rolled back at the end.
-- Storage objects are inserted as the migration owner: the test covers the
-- registration functions, not the Storage API.

begin;

create extension if not exists pgtap with schema extensions;

select plan(32);

-- Fixture -------------------------------------------------------------------------

insert into auth.users (id, email)
values
  ('00000000-0000-4000-8000-0000000009a1', 'admin-009@example.test'),
  ('00000000-0000-4000-8000-0000000009e1', 'editor-009@example.test'),
  ('00000000-0000-4000-8000-0000000009c1', 'customer-009@example.test');

insert into public.cms_users (user_id, role, status)
values
  ('00000000-0000-4000-8000-0000000009a1', 'admin', 'active'),
  ('00000000-0000-4000-8000-0000000009e1', 'editor', 'active');

insert into storage.objects (bucket_id, name, owner_id, metadata)
values
  ('cms-media', 'a0000000-0000-4000-8000-000000000001.jpg', '00000000-0000-4000-8000-0000000009e1',
    '{"mimetype": "image/jpeg", "size": 2048}'),
  ('cms-media', 'a0000000-0000-4000-8000-000000000002.png', '00000000-0000-4000-8000-0000000009e1',
    '{"mimetype": "image/jpeg", "size": 2048}'),
  ('cms-media', 'a0000000-0000-4000-8000-000000000003.jpg', '00000000-0000-4000-8000-0000000009a1',
    '{"mimetype": "image/jpeg", "size": 2048}'),
  ('cms-media', 'a0000000-0000-4000-8000-000000000004.webp', '00000000-0000-4000-8000-0000000009e1',
    '{"mimetype": "image/webp", "size": 4096}');

-- Bucket and privileges --------------------------------------------------------------

select results_eq(
  $$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'cms-media' $$,
  $$ values (true, 5242880::bigint, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']) $$,
  'the cms-media bucket is public, limited to 5 MB and to the accepted types'
);

select ok(
  not has_function_privilege('authenticated', 'public.cms_media_object(text)', 'execute'),
  'clients cannot call cms_media_object'
);

select ok(
  not has_column_privilege('anon', 'public.cms_media', 'created_by', 'select'),
  'anon cannot read who uploaded a file'
);

-- anon ------------------------------------------------------------------------------

set local role anon;

select throws_ok(
  $$ select public.cms_media_create('a0000000-0000-4000-8000-000000000001.jpg', 'x') $$,
  '42501', null, 'anon cannot register media'
);
select throws_ok($$ select * from public.cms_media_usage() $$, '42501', null, 'anon cannot read usage');

reset role;

-- Editor registers a file ---------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000009e1", "role": "authenticated"}', true);

select ok(
  set_config(
    'cms_test.media',
    public.cms_media_create('a0000000-0000-4000-8000-000000000001.jpg', '  hero.jpg ', 1600, 900)::text,
    true
  ) is not null,
  'an editor registers an uploaded file'
);

select results_eq(
  $$ select display_name, mime, size, width, height from public.cms_media where id = current_setting('cms_test.media')::uuid $$,
  $$ values ('hero.jpg', 'image/jpeg', 2048, 1600, 900) $$,
  'mime and size come from the stored object; the name is trimmed'
);

select throws_ok(
  $$ select public.cms_media_create('a0000000-0000-4000-8000-000000000009.jpg', 'missing.jpg') $$,
  'P0002', null, 'a path without an uploaded object is refused'
);

select throws_ok(
  $$ select public.cms_media_create('a0000000-0000-4000-8000-000000000003.jpg', 'other.jpg') $$,
  '42501', null, 'a file uploaded by another user cannot be registered'
);

select throws_ok(
  $$ select public.cms_media_create('a0000000-0000-4000-8000-000000000002.png', 'fake.png') $$,
  '23514', null, 'the extension must match the stored type'
);

select throws_ok(
  $$ select public.cms_media_create('a0000000-0000-4000-8000-000000000001.jpg', 'twice.jpg') $$,
  '23505', null, 'one file is registered once'
);

select throws_ok(
  $$ insert into public.cms_media (display_name, storage_path, mime, size) values ('x', 'x.jpg', 'image/jpeg', 1) $$,
  '42501', null, 'editors write media only through functions'
);

-- Metadata ---------------------------------------------------------------------------

select lives_ok(
  $$ select public.cms_media_update(current_setting('cms_test.media')::uuid, 'Hero', 'Studio', '{"x": 30, "y": 70}') $$,
  'an editor updates the name and the defaults'
);

select results_eq(
  $$ select display_name, default_alt, default_focal from public.cms_media where id = current_setting('cms_test.media')::uuid $$,
  $$ values ('Hero', 'Studio', '{"x": 30, "y": 70}'::jsonb) $$,
  'the defaults are stored'
);

select throws_ok(
  $$ select public.cms_media_update(current_setting('cms_test.media')::uuid, 'Hero', '', '{"x": 130, "y": 0}') $$,
  '23514', null, 'a focal point outside 0–100 is refused'
);

select throws_ok(
  $$ select public.cms_media_update(current_setting('cms_test.media')::uuid, '   ', '') $$,
  '23514', null, 'the name cannot be blank'
);

select throws_ok(
  $$ select public.cms_media_delete(current_setting('cms_test.media')::uuid) $$,
  '42501', null, 'an editor cannot delete media'
);

-- Replace ------------------------------------------------------------------------------

select is(
  public.cms_media_replace(current_setting('cms_test.media')::uuid, 'a0000000-0000-4000-8000-000000000004.webp', 800, 600),
  'a0000000-0000-4000-8000-000000000001.jpg',
  'replace returns the old path for removal'
);

select results_eq(
  $$ select storage_path, mime, size, width from public.cms_media where id = current_setting('cms_test.media')::uuid $$,
  $$ values ('a0000000-0000-4000-8000-000000000004.webp', 'image/webp', 4096, 800) $$,
  'replace points the same id at the new file (R-13)'
);

select ok(
  not public.cms_media_path_in_use('a0000000-0000-4000-8000-000000000001.jpg')
    and public.cms_media_path_in_use('a0000000-0000-4000-8000-000000000004.webp'),
  'the replaced file is removable, the current one is protected'
);

reset role;

-- Usage and page reads ---------------------------------------------------------------

insert into public.cms_pages (key) values ('media-fixture');

insert into public.cms_page_published (page_id, locale, content)
select id, 'en', jsonb_build_object(
  'hero', jsonb_build_object('image', jsonb_build_object('mediaId', current_setting('cms_test.media'))),
  'items', jsonb_build_array(jsonb_build_object('id', 'a', 'cover', jsonb_build_object('mediaId', 'not-a-uuid'))),
  'count', jsonb_build_object('mediaId', 5)
)
from public.cms_pages where key = 'media-fixture';

insert into public.cms_page_draft (page_id, locale, content)
select id, 'en', jsonb_build_object(
  'gallery', jsonb_build_array(jsonb_build_object('id', 'b', 'image', jsonb_build_object('mediaId', current_setting('cms_test.media'))))
)
from public.cms_pages where key = 'media-fixture';

-- One language, the bootstrap one: the fixture locale is the default (010).
delete from public.cms_site_settings_translations;
delete from public.cms_site_texts;
delete from public.cms_languages;

update public.cms_site_settings set logo_media_id = current_setting('cms_test.media')::uuid;

set local role anon;

select results_eq(
  $$
    select jsonb_array_length(media), media -> 0 ->> 'storage_path'
    from public.cms_page_get_localized('media-fixture', 'en', 'en')
  $$,
  $$ values (1, 'a0000000-0000-4000-8000-000000000004.webp') $$,
  'the published read returns the media its content references, ignoring non-ids'
);

select throws_ok(
  $$ select * from public.cms_page_get_editable('media-fixture', 'en', 'en') $$,
  '42501', null, 'anon cannot read a draft with its media'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000009e1", "role": "authenticated"}', true);

select results_eq(
  $$ select jsonb_array_length(media) from public.cms_page_get_editable('media-fixture', 'en', 'en') $$,
  $$ values (1) $$,
  'the draft read returns its media'
);

select results_eq(
  $$
    select source, page_key, is_draft
    from public.cms_media_usage(array[current_setting('cms_test.media')::uuid])
  $$,
  $$ values ('brand.logo', null::text, false), ('page', 'media-fixture', false), ('page', 'media-fixture', true) $$,
  'usage lists published content, the draft and Brand'
);

-- Customer without CMS access ---------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000009c1", "role": "authenticated"}', true);

select throws_ok(
  $$ select * from public.cms_media_usage() $$,
  '42501', null, 'a user without CMS access cannot read usage'
);

-- Admin deletes ------------------------------------------------------------------------

select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000009a1", "role": "authenticated"}', true);

-- Media in use cannot be deleted (C-77 since 014 / 2c): here Brand and the page use it.
select throws_ok(
  $$ select public.cms_media_delete(current_setting('cms_test.media')::uuid) $$,
  'CMSMU', null, 'media in use cannot be deleted, even by an admin'
);

-- The page stops using it (its content is put back below, as a Restore of an
-- old revision would: revisions are not usage).
reset role;
update public.cms_site_settings set logo_media_id = null, favicon_media_id = null;
create temporary table media_fixture_content on commit drop as
  select 'published' as kind, page_id, locale, content from public.cms_page_published
    where page_id = (select id from public.cms_pages where key = 'media-fixture')
  union all
  select 'draft', page_id, locale, content from public.cms_page_draft
    where page_id = (select id from public.cms_pages where key = 'media-fixture');
update public.cms_page_published set content = '{}' where page_id = (select id from public.cms_pages where key = 'media-fixture');
update public.cms_page_draft set content = '{}' where page_id = (select id from public.cms_pages where key = 'media-fixture');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-4000-8000-0000000009a1", "role": "authenticated"}', true);

select lives_ok(
  $$ select public.cms_media_delete(current_setting('cms_test.media')::uuid) $$,
  'an admin deletes media nobody uses any more'
);

select throws_ok(
  $$ select public.cms_media_delete(current_setting('cms_test.media')::uuid) $$,
  'P0002', null, 'deleted media cannot be deleted again'
);

select is_empty(
  $$ select * from public.cms_media_usage(array[current_setting('cms_test.media')::uuid]) $$,
  'deleted media has no usage'
);

reset role;
update public.cms_page_published pub set content = f.content
  from media_fixture_content f where f.kind = 'published' and f.page_id = pub.page_id and f.locale = pub.locale;
update public.cms_page_draft d set content = f.content
  from media_fixture_content f where f.kind = 'draft' and f.page_id = d.page_id and f.locale = d.locale;
set local role anon;

select is_empty(
  $$ select id from public.cms_media where id = current_setting('cms_test.media')::uuid $$,
  'anon does not see deleted media'
);

select results_eq(
  $$ select jsonb_array_length(media) from public.cms_page_get_localized('media-fixture', 'en', 'en') $$,
  $$ values (0) $$,
  'content that uses deleted media resolves to nothing: the site renders the code default'
);

reset role;

select ok(
  public.cms_media_path_in_use('a0000000-0000-4000-8000-000000000004.webp'),
  'the file of deleted media stays protected: revisions may still use it (C-77)'
);

select * from finish();

rollback;
