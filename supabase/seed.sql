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

-- Site languages (010, C-87): English is the language of the original — the
-- texts in the playground code are English — and Ukrainian a translation.
insert into public.cms_languages (code, name, native_name, is_default, sort_order)
values
  ('en', 'English', 'English', true, 0),
  ('uk', 'Ukrainian', 'Українська', false, 1);

insert into public.cms_site_settings_translations (locale, site_name)
values ('uk', 'Сайт CMS Core');

-- Site texts in Ukrainian; English comes from cms.texts.ts (C-85).
insert into public.cms_site_texts (key, locale, value)
values
  ('nav.about', 'uk', 'Про нас'),
  ('nav.services', 'uk', 'Послуги'),
  ('nav.contact', 'uk', 'Контакти'),
  ('header.cta', 'uk', 'Написати нам');

-- Playground pages. Core migrations insert no pages: they belong to the Client Project.
-- `about` is left out on purpose, to show a page without a row rendering its code defaults.
-- `home` in en is the base document; uk is a translation: translated leaves by address
-- (C-78). The lead is left untranslated on purpose: Ukrainian shows the English one.
-- A service from code is translated by its stable id (C-88).
with home as (
  insert into public.cms_pages (key)
  values ('home')
  returning id
)
insert into public.cms_page_published (page_id, locale, content)
select id, 'en', $json$
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
from home
union all
select id, 'uk', $json$
{
  "hero.eyebrow": "Креативна студія",
  "hero.title": "Створюємо цифровий досвід, який зворушує.",
  "hero.cta.label": "Почати проєкт",
  "services.items.strategy.title": "Стратегія й напрям"
}
$json$::jsonb
from home;

-- Blog posts (014): entries of the type `post` declared in cms.content.ts.
-- `calm-interfaces` has a Ukrainian translation with its own address;
-- `prototype-in-code` has none (Ukrainian shows the original at the same
-- address); `old-news` is archived; `coming-soon` is a draft only.
insert into public.cms_entries (id, type, first_published_at, archived_at) values
  ('b1000000-0000-4000-8000-000000000001', 'post', '2026-11-10T09:00:00Z', null),
  ('b1000000-0000-4000-8000-000000000002', 'post', '2026-11-14T09:00:00Z', null),
  ('b1000000-0000-4000-8000-000000000003', 'post', '2026-11-18T09:00:00Z', null),
  ('b1000000-0000-4000-8000-000000000004', 'post', '2026-11-01T09:00:00Z', '2026-11-05T09:00:00Z'),
  ('b1000000-0000-4000-8000-000000000005', 'post', null, null);

insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('b1000000-0000-4000-8000-000000000001', 'en', $json$
  { "title": "Designing calm interfaces", "slug": "calm-interfaces",
    "excerpt": "Fewer choices on a screen, more confidence in the next step.",
    "body": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "A calm interface shows what matters now and keeps the rest one step away." }] }] } }
  $json$::jsonb, '2026-11-10T09:00:00Z'),
  ('b1000000-0000-4000-8000-000000000001', 'uk', $json$
  { "title": "Спокійні інтерфейси", "slug": "spokiini-interfeisy",
    "excerpt": "Менше виборів на екрані — більше впевненості в наступному кроці." }
  $json$::jsonb, '2026-11-11T09:00:00Z'),
  ('b1000000-0000-4000-8000-000000000002', 'en', $json$
  { "title": "Why we prototype in code", "slug": "prototype-in-code",
    "excerpt": "A prototype in the browser answers questions a picture cannot.",
    "body": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Real data, real devices, real latency: the browser tells the truth early." }] }] } }
  $json$::jsonb, '2026-11-14T09:00:00Z'),
  ('b1000000-0000-4000-8000-000000000003', 'en', $json$
  { "title": "A small studio, a short list", "slug": "small-studio",
    "excerpt": "We take few projects at a time, and finish them.",
    "body": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Focus is a feature. So is saying no." }] }] } }
  $json$::jsonb, '2026-11-18T09:00:00Z'),
  ('b1000000-0000-4000-8000-000000000004', 'en', $json$
  { "title": "Old news", "slug": "old-news", "excerpt": "Archived: not on the site any more." }
  $json$::jsonb, '2026-11-01T09:00:00Z');

insert into public.cms_page_draft (page_id, locale, content) values
  ('b1000000-0000-4000-8000-000000000005', 'en', '{"title": "Coming soon", "slug": "coming-soon", "excerpt": "Not published yet."}');

insert into public.cms_entry_slugs (entry_id, locale, type, slug) values
  ('b1000000-0000-4000-8000-000000000001', 'en', 'post', 'calm-interfaces'),
  ('b1000000-0000-4000-8000-000000000001', 'uk', 'post', 'spokiini-interfeisy'),
  ('b1000000-0000-4000-8000-000000000002', 'en', 'post', 'prototype-in-code'),
  ('b1000000-0000-4000-8000-000000000003', 'en', 'post', 'small-studio'),
  ('b1000000-0000-4000-8000-000000000004', 'en', 'post', 'old-news');

-- Vacancies (014): entries of the type `vacancy`, edited in Content with the
-- playground's own editor; manual order (sort_order). `designer` has a
-- Ukrainian translation; `backend` is a draft only.
insert into public.cms_entries (id, type, sort_order, first_published_at) values
  ('c1000000-0000-4000-8000-000000000001', 'vacancy', 0, '2026-11-15T09:00:00Z'),
  ('c1000000-0000-4000-8000-000000000002', 'vacancy', 1, '2026-11-16T09:00:00Z'),
  ('c1000000-0000-4000-8000-000000000003', 'vacancy', 2, null);

insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('c1000000-0000-4000-8000-000000000001', 'en', $json$
  { "title": "Product designer", "location": "Kyiv", "employment": "full",
    "description": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Shape interfaces with the team that builds them." }] }] } }
  $json$::jsonb, '2026-11-15T09:00:00Z'),
  ('c1000000-0000-4000-8000-000000000001', 'uk', '{"title": "Продуктовий дизайнер", "location": "Київ"}', '2026-11-15T10:00:00Z'),
  ('c1000000-0000-4000-8000-000000000002', 'en', $json$
  { "title": "Frontend developer", "location": "Remote", "employment": "contract",
    "description": { "type": "doc", "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": "Vue, Nuxt and a taste for detail." }] }] } }
  $json$::jsonb, '2026-11-16T09:00:00Z');

insert into public.cms_page_draft (page_id, locale, content) values
  ('c1000000-0000-4000-8000-000000000003', 'en', '{"title": "Backend developer", "location": "Lviv", "employment": "full"}');

-- Demo content of a site in use (014): more posts, case studies (Pages), and
-- the Content types — vacancies, testimonials, team, FAQ, clients. Fixed ids
-- by prefix, so the rows are easy to find: b1 posts, d1 case studies, c1
-- vacancies, e2 testimonials, e1 team, f1 FAQ, a1 clients. No media: images
-- stay empty (Media Picker in the admin).
create function pg_temp.demo_doc(text) returns jsonb language sql as $$
  select jsonb_build_object('type', 'doc', 'content', jsonb_build_array(
    jsonb_build_object('type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', $1)))))
$$;

-- Static pages with content (`about` stays without a row on purpose, above).
insert into public.cms_pages (key, edit_path) values
  ('careers', '/careers'), ('services', '/services'), ('work', '/work'), ('contact', '/contact')
on conflict (key) do nothing;

insert into public.cms_page_published (page_id, locale, content, published_at)
select p.id, v.locale, v.content::jsonb, '2026-11-20T10:00:00Z'
from (values
  ('careers', 'en', '{"title": "Join the studio", "lead": "Twelve people, real projects, no busywork. Remote-friendly, Kyiv office."}'),
  ('careers', 'uk', '{"title": "Приєднуйтесь до студії", "lead": "Дванадцять людей, справжні проєкти, без зайвої метушні. Можна віддалено, офіс у Києві."}'),
  ('services', 'en', '{"title": "What we do", "lead": "Strategy, identity and websites — from the first workshop to launch and beyond.", "clientsTitle": "Clients", "faqTitle": "Questions we hear often"}'),
  ('services', 'uk', '{"title": "Що ми робимо", "lead": "Стратегія, айдентика й сайти — від першого воркшопу до запуску й далі.", "clientsTitle": "Клієнти", "faqTitle": "Часті питання"}'),
  ('work', 'en', '{"title": "Selected work", "lead": "Brands, products and websites we built with our clients."}'),
  ('work', 'uk', '{"title": "Вибрані проєкти", "lead": "Бренди, продукти й сайти, які ми зробили разом із клієнтами."}'),
  ('contact', 'en', '{"title": "Let’s talk", "lead": "Tell us what you are building. We answer within two working days.", "address": "Kyiv, 12 Khreshchatyk St.", "email": "hello@luminary.studio"}')
) as v(key, locale, content)
join public.cms_pages p on p.key = v.key
where not exists (select 1 from public.cms_page_published x where x.page_id = p.id and x.locale = v.locale);

-- A page with unpublished changes: the Work lead is being rewritten.
insert into public.cms_page_draft (page_id, locale, content)
select id, 'en', '{"title": "Selected work", "lead": "Brands, products and websites — a few we are proud of."}'
from public.cms_pages where key = 'work'
on conflict do nothing;

-- More posts.
insert into public.cms_entries (id, type, first_published_at) values
  ('b1000000-0000-4000-8000-000000000006', 'post', '2026-11-20T09:00:00Z'),
  ('b1000000-0000-4000-8000-000000000007', 'post', '2026-11-21T09:00:00Z'),
  ('b1000000-0000-4000-8000-000000000008', 'post', '2026-11-22T09:00:00Z'),
  ('b1000000-0000-4000-8000-000000000009', 'post', '2026-11-23T09:00:00Z');

insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('b1000000-0000-4000-8000-000000000006', 'en', jsonb_build_object('title', 'Naming a product in a week', 'slug', 'naming-in-a-week',
    'excerpt', 'A short list, three rounds, one decision.', 'body', pg_temp.demo_doc('Names are tested in sentences, not in logos.')), '2026-11-20T09:00:00Z'),
  ('b1000000-0000-4000-8000-000000000006', 'uk', jsonb_build_object('title', 'Назва продукту за тиждень', 'slug', 'nazva-za-tyzhden',
    'excerpt', 'Короткий список, три раунди, одне рішення.', 'body', pg_temp.demo_doc('Назви перевіряють у реченнях, а не в логотипах.')), '2026-11-20T12:00:00Z'),
  ('b1000000-0000-4000-8000-000000000007', 'en', jsonb_build_object('title', 'Accessibility is a design tool', 'slug', 'accessibility-design-tool',
    'excerpt', 'Contrast, focus and plain words make every interface better.', 'body', pg_temp.demo_doc('We test with a keyboard before we test with a mouse.')), '2026-11-21T09:00:00Z'),
  ('b1000000-0000-4000-8000-000000000008', 'en', jsonb_build_object('title', 'What a design system is not', 'slug', 'design-system-is-not',
    'excerpt', 'It is not a Figma file, and it is never finished.', 'body', pg_temp.demo_doc('A design system is the agreements a team keeps.')), '2026-11-22T09:00:00Z'),
  ('b1000000-0000-4000-8000-000000000009', 'en', jsonb_build_object('title', 'Launch checklist for small sites', 'slug', 'launch-checklist',
    'excerpt', 'Twenty things we check before a site goes live.', 'body', pg_temp.demo_doc('Redirects, forms, analytics, favicon, 404 — and a second pair of eyes.')), '2026-11-23T09:00:00Z');

-- A published post with unpublished changes.
insert into public.cms_page_draft (page_id, locale, content) values
  ('b1000000-0000-4000-8000-000000000009', 'en', jsonb_build_object('title', 'Launch checklist for small sites', 'slug', 'launch-checklist',
    'excerpt', 'Twenty-five things we check before a site goes live.', 'body', pg_temp.demo_doc('Redirects, forms, analytics, favicon, 404, cookies — and a second pair of eyes.')));

insert into public.cms_entry_slugs (entry_id, locale, type, slug) values
  ('b1000000-0000-4000-8000-000000000006', 'en', 'post', 'naming-in-a-week'),
  ('b1000000-0000-4000-8000-000000000006', 'uk', 'post', 'nazva-za-tyzhden'),
  ('b1000000-0000-4000-8000-000000000007', 'en', 'post', 'accessibility-design-tool'),
  ('b1000000-0000-4000-8000-000000000008', 'en', 'post', 'design-system-is-not'),
  ('b1000000-0000-4000-8000-000000000009', 'en', 'post', 'launch-checklist');

-- Case studies (Pages, /work/[slug]), newest first.
insert into public.cms_entries (id, type, sort_order, first_published_at, archived_at) values
  ('d1000000-0000-4000-8000-000000000001', 'project', 0, '2026-10-01T09:00:00Z', null),
  ('d1000000-0000-4000-8000-000000000002', 'project', 1, '2026-10-10T09:00:00Z', null),
  ('d1000000-0000-4000-8000-000000000003', 'project', 2, '2026-10-20T09:00:00Z', null),
  ('d1000000-0000-4000-8000-000000000004', 'project', 3, '2026-11-02T09:00:00Z', null),
  ('d1000000-0000-4000-8000-000000000005', 'project', 4, '2026-06-01T09:00:00Z', '2026-09-01T09:00:00Z'),
  ('d1000000-0000-4000-8000-000000000006', 'project', -1, null, null);

insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('d1000000-0000-4000-8000-000000000001', 'en', jsonb_build_object('title', 'A bank app people actually like', 'slug', 'bank-app',
    'client', 'Northwind Bank', 'year', '2026', 'summary', 'Rebuilt onboarding: from 11 screens to 4, sign-ups up 38%.',
    'body', pg_temp.demo_doc('We started with support tickets, not with screens.')), '2026-10-01T09:00:00Z'),
  ('d1000000-0000-4000-8000-000000000001', 'uk', jsonb_build_object('title', 'Банківський застосунок, який подобається', 'slug', 'bankivskyi-zastosunok',
    'client', 'Northwind Bank', 'summary', 'Новий онбординг: з 11 екранів до 4, реєстрацій на 38% більше.'), '2026-10-02T09:00:00Z'),
  ('d1000000-0000-4000-8000-000000000002', 'en', jsonb_build_object('title', 'Identity for a coffee roaster', 'slug', 'coffee-roaster',
    'client', 'Kava Lab', 'year', '2025', 'summary', 'A wordmark, a packaging system and a shop that sells out.',
    'body', pg_temp.demo_doc('Every bag tells where the beans come from.')), '2026-10-10T09:00:00Z'),
  ('d1000000-0000-4000-8000-000000000003', 'en', jsonb_build_object('title', 'Museum website in three languages', 'slug', 'museum-website',
    'client', 'City History Museum', 'year', '2025', 'summary', 'Collections online, tickets in two taps, readable on any phone.',
    'body', pg_temp.demo_doc('The collection is the hero; the interface steps aside.')), '2026-10-20T09:00:00Z'),
  ('d1000000-0000-4000-8000-000000000004', 'en', jsonb_build_object('title', 'Dashboard for a logistics startup', 'slug', 'logistics-dashboard',
    'client', 'Shiply', 'year', '2026', 'summary', 'Dispatchers see every truck, delay and driver on one screen.',
    'body', pg_temp.demo_doc('We sat with dispatchers for a week before drawing a line.')), '2026-11-02T09:00:00Z'),
  ('d1000000-0000-4000-8000-000000000005', 'en', jsonb_build_object('title', 'Conference site 2025', 'slug', 'conference-2025',
    'client', 'DevDays', 'year', '2025', 'summary', 'Archived: the event is over.'), '2026-06-01T09:00:00Z');

insert into public.cms_page_draft (page_id, locale, content) values
  ('d1000000-0000-4000-8000-000000000006', 'en', jsonb_build_object('title', 'E-commerce redesign', 'slug', 'ecommerce-redesign',
    'client', 'Atelier', 'year', '2026', 'summary', 'In progress: not on the site yet.'));

insert into public.cms_entry_slugs (entry_id, locale, type, slug) values
  ('d1000000-0000-4000-8000-000000000001', 'en', 'project', 'bank-app'),
  ('d1000000-0000-4000-8000-000000000001', 'uk', 'project', 'bankivskyi-zastosunok'),
  ('d1000000-0000-4000-8000-000000000002', 'en', 'project', 'coffee-roaster'),
  ('d1000000-0000-4000-8000-000000000003', 'en', 'project', 'museum-website'),
  ('d1000000-0000-4000-8000-000000000004', 'en', 'project', 'logistics-dashboard'),
  ('d1000000-0000-4000-8000-000000000005', 'en', 'project', 'conference-2025');

-- More vacancies, with the fields of the form (C-103).
insert into public.cms_entries (id, type, sort_order, first_published_at, archived_at) values
  ('c1000000-0000-4000-8000-000000000004', 'vacancy', 3, '2026-11-18T09:00:00Z', null),
  ('c1000000-0000-4000-8000-000000000005', 'vacancy', 4, '2026-11-19T09:00:00Z', null),
  ('c1000000-0000-4000-8000-000000000006', 'vacancy', 5, '2026-09-01T09:00:00Z', '2026-10-01T09:00:00Z');

insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('c1000000-0000-4000-8000-000000000004', 'en', jsonb_build_object(
    'title', 'Senior frontend engineer', 'location', 'Kyiv', 'employment', 'full', 'level', 'senior', 'salary', 4500,
    'remote', true, 'hot', true, 'startDate', '2026-12-15', 'deadline', '2026-12-05T16:00:00Z',
    'interviews', jsonb_build_object('start', '2026-12-08', 'end', '2026-12-12'),
    'skills', jsonb_build_array('vue', 'typescript', 'testing'),
    'summary', 'Lead the frontend of our client projects: Nuxt, design systems, accessibility.',
    'description', pg_temp.demo_doc('You will own the frontend architecture of two to three projects at a time.'),
    'contactEmail', 'jobs@luminary.studio', 'contactPhone', '+380 44 123 45 67', 'companyUrl', 'https://luminary.studio'), '2026-11-18T09:00:00Z'),
  ('c1000000-0000-4000-8000-000000000004', 'uk', jsonb_build_object(
    'title', 'Старший frontend-інженер', 'location', 'Київ',
    'summary', 'Ведіть frontend клієнтських проєктів: Nuxt, дизайн-системи, доступність.',
    'description', pg_temp.demo_doc('Ви відповідатимете за frontend-архітектуру двох-трьох проєктів одночасно.')), '2026-11-18T12:00:00Z'),
  ('c1000000-0000-4000-8000-000000000005', 'en', jsonb_build_object(
    'title', 'UX researcher', 'location', 'Lviv', 'employment', 'part', 'level', 'middle', 'salary', 2000,
    'remote', false, 'hot', false, 'startDate', '2027-01-10',
    'skills', jsonb_build_array('figma', 'testing'),
    'summary', 'Interviews, usability tests and clear reports, three days a week.',
    'contactEmail', 'jobs@luminary.studio'), '2026-11-19T09:00:00Z'),
  ('c1000000-0000-4000-8000-000000000006', 'en', jsonb_build_object(
    'title', 'Summer intern', 'location', 'Kyiv', 'employment', 'contract', 'level', 'junior',
    'summary', 'Archived: the internship is closed.'), '2026-09-01T09:00:00Z');

-- Testimonials.
insert into public.cms_entries (id, type, sort_order, first_published_at) values
  ('e2000000-0000-4000-8000-000000000001', 'testimonial', 0, '2026-11-01T09:00:00Z'),
  ('e2000000-0000-4000-8000-000000000002', 'testimonial', 1, '2026-11-02T09:00:00Z'),
  ('e2000000-0000-4000-8000-000000000003', 'testimonial', 2, '2026-11-03T09:00:00Z'),
  ('e2000000-0000-4000-8000-000000000004', 'testimonial', 3, null);

insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('e2000000-0000-4000-8000-000000000001', 'en', '{"title": "Olena Kovalenko", "role": "Head of product, Northwind Bank", "quote": "They asked better questions than we did, and the numbers followed."}', '2026-11-01T09:00:00Z'),
  ('e2000000-0000-4000-8000-000000000001', 'uk', '{"title": "Олена Коваленко", "role": "Керівниця продукту, Northwind Bank", "quote": "Вони ставили кращі питання, ніж ми, — і цифри пішли вгору."}', '2026-11-01T10:00:00Z'),
  ('e2000000-0000-4000-8000-000000000002', 'en', '{"title": "Marco Rossi", "role": "Founder, Kava Lab", "quote": "Our packaging sold the first batch before the website was even live."}', '2026-11-02T09:00:00Z'),
  ('e2000000-0000-4000-8000-000000000003', 'en', '{"title": "Anna Schmidt", "role": "Director, City History Museum", "quote": "Visitors finally find what they came for — on their phones."}', '2026-11-03T09:00:00Z');

insert into public.cms_page_draft (page_id, locale, content) values
  ('e2000000-0000-4000-8000-000000000004', 'en', '{"title": "Taras Melnyk", "role": "CTO, Shiply", "quote": "Waiting for approval from the client."}');

-- Team.
insert into public.cms_entries (id, type, sort_order, first_published_at) values
  ('e1000000-0000-4000-8000-000000000001', 'member', 0, '2026-10-01T09:00:00Z'),
  ('e1000000-0000-4000-8000-000000000002', 'member', 1, '2026-10-01T09:00:00Z'),
  ('e1000000-0000-4000-8000-000000000003', 'member', 2, '2026-10-01T09:00:00Z'),
  ('e1000000-0000-4000-8000-000000000004', 'member', 3, '2026-10-01T09:00:00Z'),
  ('e1000000-0000-4000-8000-000000000005', 'member', 4, '2026-11-15T09:00:00Z');

insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('e1000000-0000-4000-8000-000000000001', 'en', '{"title": "Iryna Bondar", "role": "Founder, creative director", "bio": "Fifteen years of brands and interfaces. Says no to most projects.", "email": "iryna@luminary.studio", "linkedin": "https://www.linkedin.com/"}', '2026-10-01T09:00:00Z'),
  ('e1000000-0000-4000-8000-000000000001', 'uk', '{"title": "Ірина Бондар", "role": "Засновниця, креативна директорка", "bio": "Пʼятнадцять років брендів та інтерфейсів. Відмовляє більшості проєктів."}', '2026-10-01T10:00:00Z'),
  ('e1000000-0000-4000-8000-000000000002', 'en', '{"title": "Dmytro Shevchuk", "role": "Lead developer", "bio": "Nuxt, Postgres and fast pages.", "email": "dmytro@luminary.studio"}', '2026-10-01T09:00:00Z'),
  ('e1000000-0000-4000-8000-000000000002', 'uk', '{"title": "Дмитро Шевчук", "role": "Провідний розробник", "bio": "Nuxt, Postgres і швидкі сторінки."}', '2026-10-01T10:00:00Z'),
  ('e1000000-0000-4000-8000-000000000003', 'en', '{"title": "Sofia Lysenko", "role": "Product designer", "bio": "Turns workshops into prototypes in a day."}', '2026-10-01T09:00:00Z'),
  ('e1000000-0000-4000-8000-000000000004', 'en', '{"title": "Andriy Petrenko", "role": "Project manager", "bio": "Keeps deadlines realistic and clients informed."}', '2026-10-01T09:00:00Z'),
  ('e1000000-0000-4000-8000-000000000005', 'en', '{"title": "Kateryna Moroz", "role": "Copywriter", "bio": "Plain words for complicated products."}', '2026-11-15T09:00:00Z');

-- FAQ.
insert into public.cms_entries (id, type, sort_order, first_published_at) values
  ('f1000000-0000-4000-8000-000000000001', 'faq', 0, '2026-10-05T09:00:00Z'),
  ('f1000000-0000-4000-8000-000000000002', 'faq', 1, '2026-10-05T09:00:00Z'),
  ('f1000000-0000-4000-8000-000000000003', 'faq', 2, '2026-10-05T09:00:00Z'),
  ('f1000000-0000-4000-8000-000000000004', 'faq', 3, '2026-10-05T09:00:00Z'),
  ('f1000000-0000-4000-8000-000000000005', 'faq', 4, '2026-10-05T09:00:00Z');

insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('f1000000-0000-4000-8000-000000000001', 'en', jsonb_build_object('title', 'How much does a website cost?', 'topic', 'pricing',
    'answer', pg_temp.demo_doc('Most of our sites cost between $8,000 and $40,000. We give a fixed price after the first workshop.')), '2026-10-05T09:00:00Z'),
  ('f1000000-0000-4000-8000-000000000001', 'uk', jsonb_build_object('title', 'Скільки коштує сайт?',
    'answer', pg_temp.demo_doc('Більшість наших сайтів коштує від $8 000 до $40 000. Фіксовану ціну називаємо після першого воркшопу.')), '2026-10-05T10:00:00Z'),
  ('f1000000-0000-4000-8000-000000000002', 'en', jsonb_build_object('title', 'How long does a project take?', 'topic', 'process',
    'answer', pg_temp.demo_doc('Six to twelve weeks for a website, three to six for an identity.')), '2026-10-05T09:00:00Z'),
  ('f1000000-0000-4000-8000-000000000002', 'uk', jsonb_build_object('title', 'Скільки триває проєкт?',
    'answer', pg_temp.demo_doc('Від шести до дванадцяти тижнів для сайту, від трьох до шести — для айдентики.')), '2026-10-05T10:00:00Z'),
  ('f1000000-0000-4000-8000-000000000003', 'en', jsonb_build_object('title', 'Can we edit the site ourselves?', 'topic', 'general',
    'answer', pg_temp.demo_doc('Yes: every site comes with a CMS, and we train your team.')), '2026-10-05T09:00:00Z'),
  ('f1000000-0000-4000-8000-000000000004', 'en', jsonb_build_object('title', 'Do you work with startups?', 'topic', 'general',
    'answer', pg_temp.demo_doc('Yes, from the first prototype. We also offer a smaller sprint format.')), '2026-10-05T09:00:00Z'),
  ('f1000000-0000-4000-8000-000000000005', 'en', jsonb_build_object('title', 'What happens after launch?', 'topic', 'process',
    'answer', pg_temp.demo_doc('Three months of support are included; after that, a monthly plan if you need one.')), '2026-10-05T09:00:00Z');

-- Clients (ordered by name).
insert into public.cms_entries (id, type, first_published_at) values
  ('a1000000-0000-4000-8000-000000000001', 'client', '2026-09-01T09:00:00Z'),
  ('a1000000-0000-4000-8000-000000000002', 'client', '2026-09-01T09:00:00Z'),
  ('a1000000-0000-4000-8000-000000000003', 'client', '2026-09-01T09:00:00Z'),
  ('a1000000-0000-4000-8000-000000000004', 'client', '2026-09-01T09:00:00Z'),
  ('a1000000-0000-4000-8000-000000000005', 'client', '2026-09-01T09:00:00Z'),
  ('a1000000-0000-4000-8000-000000000006', 'client', '2026-09-01T09:00:00Z');

insert into public.cms_page_published (page_id, locale, content, published_at) values
  ('a1000000-0000-4000-8000-000000000001', 'en', '{"title": "Northwind Bank", "industry": "Finance", "website": "https://example.com/northwind", "since": 2024}', '2026-09-01T09:00:00Z'),
  ('a1000000-0000-4000-8000-000000000002', 'en', '{"title": "Kava Lab", "industry": "Food & drink", "website": "https://example.com/kava", "since": 2025}', '2026-09-01T09:00:00Z'),
  ('a1000000-0000-4000-8000-000000000003', 'en', '{"title": "City History Museum", "industry": "Culture", "since": 2023}', '2026-09-01T09:00:00Z'),
  ('a1000000-0000-4000-8000-000000000003', 'uk', '{"title": "Музей історії міста", "industry": "Культура"}', '2026-09-01T10:00:00Z'),
  ('a1000000-0000-4000-8000-000000000004', 'en', '{"title": "Shiply", "industry": "Logistics", "website": "https://example.com/shiply", "since": 2026}', '2026-09-01T09:00:00Z'),
  ('a1000000-0000-4000-8000-000000000005', 'en', '{"title": "DevDays", "industry": "Events", "since": 2025}', '2026-09-01T09:00:00Z'),
  ('a1000000-0000-4000-8000-000000000006', 'en', '{"title": "Atelier", "industry": "Fashion", "website": "https://example.com/atelier", "since": 2026}', '2026-09-01T09:00:00Z');

-- Every publication has a revision (C-51), the seeded ones included.
insert into public.cms_page_revisions (page_id, locale, content, created_at)
select page_id, locale, content, published_at
from public.cms_page_published;

-- Seeding is not an action of the team: the triggers of 012 logged the direct
-- inserts above, and a fresh project starts with an empty Activity.
delete from public.cms_activity;
