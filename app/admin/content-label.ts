import type { CmsContentLabel, CmsContentTypeText } from '../../src/content'

/** A label of cms.content.ts in the admin's language: `{ en, uk }`, else English, else the first one. */
export function contentLabel(label: CmsContentLabel | undefined, locale: string): string {
  if (!label) {
    return ''
  }

  if (typeof label === 'string') {
    return label
  }

  return label[locale] ?? label.en ?? Object.values(label)[0] ?? ''
}

/**
 * A text of a type from cms.content.ts (`text.newTitle`…) in the admin's
 * language, with `{title}` filled in; null when the Client gave none.
 */
export function contentText(
  text: CmsContentTypeText | undefined,
  key: keyof CmsContentTypeText,
  locale: string,
  title = '',
): string | null {
  const value = contentLabel(text?.[key], locale)
  return value ? value.split('{title}').join(title) : null
}

type Translate = (key: string, params?: Record<string, string | number>) => string

/**
 * The heading of the dialog of an entry of a Content type: the Client's own
 * words (`text.newTitle`, `text.editTitle` with `{title}`), else Core's.
 */
export function entryDialogTitle(
  type: { label: CmsContentLabel, text: CmsContentTypeText },
  entry: { isNew: boolean, title: string },
  locale: string,
  t: Translate,
): string {
  const name = contentLabel(type.label, locale)

  if (entry.isNew) {
    return contentText(type.text, 'newTitle', locale) ?? t('cms.content.dialog.newDefault', { type: name })
  }

  return contentText(type.text, 'editTitle', locale, entry.title) ?? t('cms.content.dialog.editDefault', { type: name, title: entry.title })
}

