import { describe, expect, it } from 'vitest'
import { validateCmsForm } from '../app/primitives/form-validation'
import { resolveCmsForms } from '../src/forms'

const [contact] = resolveCmsForms({
  contact: {
    fields: [
      { key: 'name', type: 'text', role: 'name', required: true, maxLength: 12 },
      { key: 'email', type: 'email', role: 'email', required: true },
      { key: 'phone', type: 'tel', role: 'phone' },
      { key: 'service', type: 'select', options: ['web', 'brand'] },
      { key: 'message', type: 'textarea', role: 'message' },
      { key: 'consent', type: 'checkbox', required: true },
      { key: 'news', type: 'checkbox' },
    ],
  },
}).forms

describe('form validation (D-34)', () => {
  it('normalizes what it stores and leaves empty optional fields out', () => {
    expect(validateCmsForm(contact!, {
      name: '  Olena \n Koval ',
      email: ' olena@example.com ',
      phone: '',
      service: 'web',
      message: ' Hello\r\nthere ',
      consent: true,
      news: false,
    })).toEqual({
      values: { name: 'Olena Koval', email: 'olena@example.com', service: 'web', message: 'Hello\nthere', consent: true },
      errors: [],
    })
  })

  it('returns stable codes per field', () => {
    const { errors } = validateCmsForm(contact!, {
      name: 'x'.repeat(13),
      email: 'not-an-email',
      phone: '12',
      service: 'seo',
      consent: false,
      extra: 'x',
    })

    expect(errors).toEqual([
      { field: 'extra', code: 'unknown_field' },
      { field: 'name', code: 'too_long' },
      { field: 'email', code: 'email' },
      { field: 'phone', code: 'tel' },
      { field: 'service', code: 'option' },
      { field: 'consent', code: 'required' },
    ])
  })

  it('refuses values of the wrong type instead of coercing them', () => {
    const { errors } = validateCmsForm(contact!, { name: ['x'], email: { a: 1 }, consent: 'yes' })

    expect(errors).toEqual([
      { field: 'name', code: 'type' },
      { field: 'email', code: 'type' },
      { field: 'consent', code: 'type' },
    ])
  })

  it('counts characters, not UTF-16 units, and accepts usual phone formats', () => {
    const { errors } = validateCmsForm(contact!, {
      name: 'Олена 😀😀',
      email: 'a@b.co',
      phone: '+380 (67) 123-45-67',
      consent: true,
    })

    expect(errors).toEqual([])
  })
})
