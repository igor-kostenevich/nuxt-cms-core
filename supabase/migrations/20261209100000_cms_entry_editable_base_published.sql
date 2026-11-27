-- 014 (review recheck S-4): in a translation the editor is told whether the
-- original is published (`base_published`). An entry whose original is on the
-- site is taken off it before it is deleted (C-108, `cms_entry_delete`); without
-- this the editor of a translation could not tell and offered Delete the server
-- refuses. In the original it is whether the original itself is published.

drop function public.cms_entry_get_editable(text, uuid, text, text);

create function public.cms_entry_get_editable(entry_type text, entry_id uuid, entry_locale text, bootstrap_locale text)
returns table (
  default_locale text,
  base jsonb,
  draft jsonb,
  draft_updated_at timestamptz,
  published jsonb,
  published_at timestamptz,
  media jsonb,
  off_site boolean,
  base_published boolean
)
language plpgsql
stable
set search_path = ''
as $$
declare
  lang text := public.cms_default_locale(bootstrap_locale);
  base_content jsonb;
  draft_content jsonb;
  draft_time timestamptz;
  published_content jsonb;
  published_time timestamptz;
  taken_off boolean;
begin
  select e.archived_at is not null into taken_off
    from public.cms_entries e
    where e.id = entry_id
      and e.type = entry_type;

  if taken_off is null then
    raise exception 'Entry not found'
      using errcode = 'P0002';
  end if;

  entry_locale := coalesce(entry_locale, lang);

  select d.content, d.updated_at
    into draft_content, draft_time
    from public.cms_page_draft d
    where d.page_id = entry_id
      and d.locale = entry_locale;

  select pub.content, pub.published_at
    into published_content, published_time
    from public.cms_page_published pub
    where pub.page_id = entry_id
      and pub.locale = entry_locale;

  if entry_locale is distinct from lang then
    base_content := coalesce(
      (select d.content from public.cms_page_draft d where d.page_id = entry_id and d.locale = lang),
      (select pub.content from public.cms_page_published pub where pub.page_id = entry_id and pub.locale = lang)
    );
  end if;

  return query select
    lang,
    base_content,
    draft_content,
    draft_time,
    published_content,
    published_time,
    public.cms_media_of(jsonb_build_array(base_content, draft_content, published_content)),
    taken_off,
    exists (
      select 1 from public.cms_page_published pub
        where pub.page_id = entry_id
          and pub.locale = lang
    );
end;
$$;

revoke all on function public.cms_entry_get_editable(text, uuid, text, text) from public, anon;
grant execute on function public.cms_entry_get_editable(text, uuid, text, text) to authenticated;
