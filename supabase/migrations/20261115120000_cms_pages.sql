-- CMS Core migration: pages as a content entity, published read only.
--
-- A page here is a code-defined route of the Client Project (home, about).
-- Its structure lives in Vue; the CMS stores only the content values the
-- developer made editable (MASTER_PLAN C-01). The route stays in code, so a
-- page is addressed by a stable `key`, not by a slug. Template pages such as
-- products are collection records with their own slug, not rows here.
--
-- Identity and content are separate tables:
--   cms_pages           one row per page, no content
--   cms_page_published  one content document per (page, locale)
-- The draft (007) gets its own table of the same shape, because RLS is
-- row-level: a draft in a published row would be readable by anon (C-06).
-- The locale is part of the key from the start, so localization (010) adds a
-- languages table without rewriting existing rows.

create table public.cms_pages (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  created_at timestamptz not null default now(),
  constraint cms_pages_key_unique unique (key),
  -- Lowercase kebab-case: the key is an identifier in code, not a URL.
  constraint cms_pages_key_format check (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

comment on table public.cms_pages is
  'Code-defined pages of the site. A missing row means the page renders its code defaults.';

create table public.cms_page_published (
  page_id uuid not null references public.cms_pages (id) on delete cascade,
  locale text not null,
  -- The page content as one document. The shape inside the object is
  -- defined by the field address format (006), not by this table.
  content jsonb not null default '{}'::jsonb,
  published_at timestamptz not null default now(),
  primary key (page_id, locale),
  -- Canonical BCP 47 casing, so one language has exactly one spelling and
  -- a languages table (010) can reference it: uk, en-GB, zh-Hant, es-419.
  -- Keep identical to CMS_LOCALE_PATTERN in src/config.ts.
  constraint cms_page_published_locale_format
    check (locale ~ '^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$'),
  constraint cms_page_published_content_object
    check (jsonb_typeof(content) = 'object')
);

comment on table public.cms_page_published is
  'Published content of a page, one document per locale. The only page content the public site reads.';

alter table public.cms_pages enable row level security;
alter table public.cms_page_published enable row level security;

-- Published content is public site content.
create policy "cms_pages_select_all"
  on public.cms_pages
  for select
  to anon, authenticated
  using (true);

create policy "cms_page_published_select_all"
  on public.cms_page_published
  for select
  to anon, authenticated
  using (true);

-- Read only for every client role. Rows are created and published through
-- database functions in Draft / Publish (007) and Edit Mode (008), which add
-- their own grants. Until then nothing but a migration or seed writes here.
revoke all on table public.cms_pages from anon, authenticated;
revoke all on table public.cms_page_published from anon, authenticated;
grant select on table public.cms_pages to anon, authenticated;
grant select on table public.cms_page_published to anon, authenticated;
