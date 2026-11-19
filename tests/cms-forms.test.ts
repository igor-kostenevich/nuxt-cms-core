import { describe, expect, it } from 'vitest'
import { resolveCmsForms } from '../src/forms'

describe('cms.forms.ts', () => {
  it('resolves fields with defaults by type, sorted by form key', () => {
    const { forms, ignored } = resolveCmsForms({
      quote: { fields: [{ key: 'budget', type: 'select', options: ['small', 'large'] }] },
      contact: {
        fields: [
          { key: 'name', type: 'text', role: 'name', required: true },
          { key: 'email', type: 'email', role: 'email', required: true },
          { key: 'phone', type: 'tel', role: 'phone' },
          { key: 'message', type: 'textarea', role: 'message', maxLength: 2000 },
          { key: 'consent', type: 'checkbox', required: true },
        ],
      },
    })

    expect(ignored).toEqual([])
    expect(forms.map(form => form.key)).toEqual(['contact', 'quote'])
    expect(forms[0]!.fields).toEqual([
      { key: 'name', type: 'text', required: true, maxLength: 500, role: 'name' },
      { key: 'email', type: 'email', required: true, maxLength: 254, role: 'email' },
      { key: 'phone', type: 'tel', required: false, maxLength: 32, role: 'phone' },
      { key: 'message', type: 'textarea', required: false, maxLength: 2000, role: 'message' },
      { key: 'consent', type: 'checkbox', required: true, maxLength: 0 },
    ])
    expect(forms[1]!.fields[0]).toEqual({ key: 'budget', type: 'select', required: false, maxLength: 0, options: ['small', 'large'] })
  })

  it('drops bad fields and forms with a reason instead of failing the build', () => {
    const { forms, ignored } = resolveCmsForms({
      'bad key': { fields: [{ key: 'a', type: 'text' }] },
      'shape': { fields: 'x' },
      'empty': { fields: [] },
      'contact': {
        fields: [
          { key: '1st', type: 'text' },
          { key: 'name', type: 'text', role: 'name' },
          { key: 'name', type: 'text' },
          { key: 'nick', type: 'text', role: 'name' },
          { key: 'kind', type: 'select', options: [] },
          { key: 'size', type: 'select', options: ['a', 'a'] },
          { key: 'mail', type: 'text', role: 'email' },
          { key: 'age', type: 'number' },
          { key: 'bio', type: 'textarea', maxLength: 0 },
        ],
      },
    })

    expect(forms.map(form => [form.key, form.fields.map(field => [field.key, field.role])])).toEqual([
      ['contact', [['name', 'name'], ['nick', undefined]]],
    ])
    expect(ignored).toEqual([
      { form: 'bad key', reason: 'form-key' },
      { form: 'shape', reason: 'form-shape' },
      { form: 'empty', reason: 'no-fields' },
      { form: 'contact', field: '1st', reason: 'field-key' },
      { form: 'contact', field: 'name', reason: 'field-duplicate' },
      { form: 'contact', field: 'nick', reason: 'role-duplicate' },
      { form: 'contact', field: 'kind', reason: 'field-options' },
      { form: 'contact', field: 'size', reason: 'field-options' },
      { form: 'contact', field: 'mail', reason: 'field-role' },
      { form: 'contact', field: 'age', reason: 'field-type' },
      { form: 'contact', field: 'bio', reason: 'field-length' },
    ])
  })

  it('treats a missing or odd file as no forms', () => {
    expect(resolveCmsForms(undefined).forms).toEqual([])
    expect(resolveCmsForms(['a']).forms).toEqual([])
  })
})
