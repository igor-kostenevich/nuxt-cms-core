-- Local development fixtures. `supabase db reset` applies this file; `supabase db push` does not.
-- These users are not part of the published Core migrations.
-- Password for every account: local-dev-password

create function pg_temp.seed_auth_user(user_id uuid, user_email text)
returns void
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token
  ) values (
    '00000000-0000-0000-0000-000000000000',
    user_id,
    'authenticated',
    'authenticated',
    user_email,
    extensions.crypt('local-dev-password', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    ''
  );

  insert into auth.identities (
    user_id,
    provider,
    provider_id,
    identity_data,
    last_sign_in_at,
    created_at,
    updated_at
  ) values (
    user_id,
    'email',
    user_id::text,
    jsonb_build_object(
      'sub', user_id::text,
      'email', user_email,
      'email_verified', true,
      'phone_verified', false
    ),
    now(),
    now(),
    now()
  );
end;
$$;

select pg_temp.seed_auth_user('11111111-1111-4111-8111-111111111111', 'owner@example.com');
select pg_temp.seed_auth_user('55555555-5555-4555-8555-555555555555', 'admin@example.com');
select pg_temp.seed_auth_user('22222222-2222-4222-8222-222222222222', 'editor@example.com');
select pg_temp.seed_auth_user('33333333-3333-4333-8333-333333333333', 'customer@example.com');
select pg_temp.seed_auth_user('44444444-4444-4444-8444-444444444444', 'disabled@example.com');

insert into public.cms_users (user_id, role, status)
values
  ('11111111-1111-4111-8111-111111111111', 'owner', 'active'),
  ('55555555-5555-4555-8555-555555555555', 'admin', 'active'),
  ('22222222-2222-4222-8222-222222222222', 'editor', 'active'),
  ('44444444-4444-4444-8444-444444444444', 'editor', 'disabled');

-- Playground pages. Core migrations insert no pages: they belong to the Client Project.
-- `about` is left out on purpose, to show a page without a row rendering its code defaults.
with home as (
  insert into public.cms_pages (key)
  values ('home')
  returning id
)
insert into public.cms_page_published (page_id, locale, content)
select id, 'uk', $json$
{
  "hero": {
    "eyebrow": "Creative studio",
    "title": "We craft digital experiences that move people.",
    "lead": {
      "type": "doc",
      "content": [{
        "type": "paragraph",
        "content": [
          { "type": "text", "text": "Strategy, identity and websites for brands that want to be " },
          { "type": "text", "text": "remembered", "marks": [{ "type": "bold" }] },
          { "type": "text", "text": ". This text comes from cms_page_published." }
        ]
      }]
    },
    "cta": { "label": "Start a project", "href": "/#contact" }
  }
}
$json$::jsonb
from home;

-- Every publication has a revision (C-51), the seeded one included.
insert into public.cms_page_revisions (page_id, locale, content, created_at)
select page_id, locale, content, published_at
from public.cms_page_published;
