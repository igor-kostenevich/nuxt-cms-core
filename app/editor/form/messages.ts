import type { CmsContentField } from '../../../src/content-fields'
import { adminDate } from '../../admin/dates'
import type { FieldIssueKind } from '../kinds'

type Translate = (key: string, params?: Record<string, string | number>) => string

/** `2026-11-25` → `25.11.2026`, as the admin shows days. */
function day(value: string | undefined): string {
  return value ? adminDate(`${value}T12:00:00`) : ''
}

function bounds(t: Translate, min: string | number | undefined, max: string | number | undefined) {
  if (min !== undefined && max !== undefined) {
    return t('cms.editor.form.rangeBoth', { min, max })
  }

  return min !== undefined ? t('cms.editor.form.rangeMin', { min }) : t('cms.editor.form.rangeMax', { max: max ?? '' })
}

/**
 * The message under a form field for its issue, in the field's own terms
 * (a count of choices, days, the format of an email…).
 */
export function issueMessage(
  kind: FieldIssueKind | null | undefined,
  t: Translate,
  field: CmsContentField | null,
  extra: { length?: number, value?: unknown } = {},
): string | undefined {
  switch (kind) {
    case 'required':
      return t('cms.editor.form.required')
    case 'maxLength':
      return t('cms.editor.form.maxLength', { count: extra.length ?? 0, max: field && 'maxLength' in field ? field.maxLength ?? 0 : 0 })
    case 'range':
      if (field?.type === 'multiselect') {
        return t('cms.editor.form.rangeCount', { min: field.min ?? 0, max: field.max ?? field.options.length })
      }

      if (field?.type === 'date' || field?.type === 'dateRange') {
        return bounds(t, field.min ? day(field.min) : undefined, field.max ? day(field.max) : undefined)
      }

      if (field?.type === 'datetime') {
        return t('cms.editor.form.rangeTime')
      }

      return bounds(t, field && 'min' in field ? field.min as number | undefined : undefined, field && 'max' in field ? field.max as number | undefined : undefined)
    case 'option': {
      const values = Array.isArray(extra.value) ? extra.value : [extra.value]
      const known = field && 'options' in field ? field.options.map(option => option.value) : []
      const missing = values.filter(item => typeof item === 'string' && !known.includes(item))
      return t('cms.editor.form.option', { value: missing.join(', ') })
    }
    case 'format':
      return t(`cms.editor.form.format.${field?.type ?? 'text'}`)
    default:
      return undefined
  }
}
