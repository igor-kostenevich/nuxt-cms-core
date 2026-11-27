-- CMS Core migration: documents (014, stage 1). No change of behaviour.
--
-- A document is what has content: a draft, publications, revisions, a lock,
-- registered fields. Until now only a static page (cms_pages) was one; 014
-- adds standalone entries. cms_documents is the shared identity, cms_pages
-- and (later) cms_entries are its subtypes, and the content tables point at
-- the document. The column stays `page_id` and the tables keep their names:
-- read "page" there as "document".
--
-- Integrity:
--   - a subtype row creates its document itself (an AFTER INSERT trigger), so
--     every existing insert into cms_pages (the lock RPC, seeds, fixtures) keeps
--     working. AFTER, not BEFORE: a row skipped by ON CONFLICT DO NOTHING fires
--     no AFTER trigger, so a lost race leaves no orphan document;
--   - the document id is the subtype id and its primary key, so one document
--     cannot belong to two subtypes;
--   - deleting the subtype row deletes the document, and that cascades to the
--     content;
--   - the subtype's foreign key to the document is deferred: the RI trigger of
--     a row fires before ours (triggers fire in name order), so an immediate
--     check would not see the document yet.
--
-- Locks: the page mutex of 010d stays FOR NO KEY UPDATE on the cms_pages row.
-- Foreign key checks of the content tables now take FOR KEY SHARE on the
-- cms_documents row instead, which nobody locks for update: the lock order
-- (page row, lock row, draft row) does not change.

create table public.cms_documents (
  id uuid primary key,
  kind text not null check (kind in ('page', 'entry')),
  created_at timestamptz not null default now()
);

comment on table public.cms_documents is
  'Identity of a document with content (a static page or an entry). Rows are created and deleted by triggers of the subtype tables.';

insert into public.cms_documents (id, kind, created_at)
  select p.id, 'page', p.created_at from public.cms_pages p;

-- Subtype triggers -----------------------------------------------------------------

-- TG_ARGV[0] is the kind of the subtype table.
create function public.cms_document_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.cms_documents (id, kind) values (new.id, tg_argv[0]);
  return null;
end;
$$;

create function public.cms_document_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.cms_documents d where d.id = old.id;
  return null;
end;
$$;

create function public.cms_document_keep_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.id is distinct from old.id then
    raise exception 'The id of a document cannot change'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.cms_document_insert() from public, anon, authenticated;
revoke all on function public.cms_document_delete() from public, anon, authenticated;
revoke all on function public.cms_document_keep_id() from public, anon, authenticated;

create trigger cms_pages_document_insert
  after insert on public.cms_pages
  for each row execute function public.cms_document_insert('page');

create trigger cms_pages_document_delete
  after delete on public.cms_pages
  for each row execute function public.cms_document_delete();

create trigger cms_pages_keep_id
  before update of id on public.cms_pages
  for each row execute function public.cms_document_keep_id();

alter table public.cms_pages
  add constraint cms_pages_document_fkey
    foreign key (id) references public.cms_documents (id) on delete cascade
    deferrable initially deferred;

-- Content points at the document ----------------------------------------------------

alter table public.cms_page_published
  drop constraint cms_page_published_page_id_fkey,
  add constraint cms_page_published_page_id_fkey
    foreign key (page_id) references public.cms_documents (id) on delete cascade;

alter table public.cms_page_draft
  drop constraint cms_page_draft_page_id_fkey,
  add constraint cms_page_draft_page_id_fkey
    foreign key (page_id) references public.cms_documents (id) on delete cascade;

alter table public.cms_page_revisions
  drop constraint cms_page_revisions_page_id_fkey,
  add constraint cms_page_revisions_page_id_fkey
    foreign key (page_id) references public.cms_documents (id) on delete cascade;

alter table public.cms_page_locks
  drop constraint cms_page_locks_page_id_fkey,
  add constraint cms_page_locks_page_id_fkey
    foreign key (page_id) references public.cms_documents (id) on delete cascade;

alter table public.cms_page_fields
  drop constraint cms_page_fields_page_id_fkey,
  add constraint cms_page_fields_page_id_fkey
    foreign key (page_id) references public.cms_documents (id) on delete cascade;

-- Access ---------------------------------------------------------------------------

-- Read only to join content to its page in the admin (the PostgREST embed
-- revisions → document → page); the public never needs it, so anon does not
-- see which ids exist.
alter table public.cms_documents enable row level security;

create policy cms_documents_select_editors
  on public.cms_documents
  for select
  to authenticated
  using (public.cms_can('pages.edit'));

revoke all on table public.cms_documents from anon, authenticated;
grant select on table public.cms_documents to authenticated;
