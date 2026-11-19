import { describe, expect, it } from 'vitest'
import {
  csvCell,
  humanize,
  pageName,
  pageNames,
  submissionContacts,
  submissionFields,
  submissionPreview,
  submissionsCsv,
  type TextLookup,
} from '../app/admin/forms-view'
import type { CmsFormSubmission } from '../app/types/forms'
import { resolveCmsForms } from '../src/forms'

const [contact, quote] = resolveCmsForms({
  contact: {
    fields: [
      { key: 'name', type: 'text', role: 'name' },
      { key: 'email', type: 'email', role: 'email' },
      { key: 'phone', type: 'tel', role: 'phone' },
      { key: 'service', type: 'select', options: ['web', 'seo'] },
      { key: 'message', type: 'textarea', role: 'message' },
      { key: 'consent', type: 'checkbox' },
    ],
  },
  quote: { fields: [{ key: 'budget', type: 'text' }] },
}).forms

const texts: Record<string, string> = {
  'forms.contact.name.label': 'Ім’я',
  'forms.contact.service.label': 'Послуга',
  'forms.contact.service.options.web': 'Сайт',
  'forms.contact.title': 'Зв’язатися',
}
const text: TextLookup = key => texts[key]
const words = { yes: 'Так', no: 'Ні' }

function submission(payload: Record<string, unknown>, extra: Partial<CmsFormSubmission> = {}): CmsFormSubmission {
  return {
    id: '1',
    formKey: 'contact',
    payload,
    location: 'inbox',
    readAt: null,
    pagePath: '/contact',
    locale: 'uk',
    createdAt: '2026-11-19T10:05:00+00:00',
    ...extra,
  }
}

describe('submissions in the admin (011)', () => {
  it('previews who and what by the roles of the fields', () => {
    expect(submissionPreview(submission({ name: 'Олена', message: 'Привіт\n\nсвіт' }), contact)).toEqual({ title: 'Олена', excerpt: 'Привіт світ' })
    // No name: the email; a form without roles: the first texts.
    expect(submissionPreview(submission({ email: 'a@b.co', message: 'Hi' }), contact).title).toBe('a@b.co')
    expect(submissionPreview(submission({ budget: '1000', note: 'soon' }, { formKey: 'quote' }), quote)).toEqual({ title: '1000', excerpt: 'soon' })
  })

  it('builds contact links only from checked values with fixed schemes', () => {
    expect(submissionContacts(submission({ email: 'olena@example.com', phone: '+380 (67) 123-45-67' }), contact)).toEqual({
      email: { value: 'olena@example.com', mailto: 'mailto:olena@example.com' },
      phone: {
        value: '+380 (67) 123-45-67',
        tel: 'tel:+380671234567',
        whatsapp: 'https://wa.me/380671234567',
        viber: 'viber://chat?number=%2B380671234567',
      },
    })
    expect(submissionContacts(submission({ email: 'javascript:alert(1)', phone: 'call me' }), contact)).toEqual({})
    // Header injection into mailto: not an email, so no link at all.
    expect(submissionContacts(submission({ email: 'a@b.co?bcc=x@y.z' }), contact).email).toBeUndefined()
    expect(submissionContacts(submission({ email: 'o+tag@example.com' }), contact).email?.mailto).toBe('mailto:o%2Btag@example.com')
  })

  it('lists answers in form order, then fields no longer in the form', () => {
    const rows = submissionFields(submission({ consent: true, old_field: 'kept', name: 'Олена', service: 'web', email: '' }), contact, text, words)

    expect(rows).toEqual([
      { key: 'name', label: 'Ім’я', value: 'Олена', role: 'name', historical: false },
      { key: 'service', label: 'Послуга', value: 'Сайт', role: undefined, historical: false },
      { key: 'consent', label: 'Consent', value: 'Так', role: undefined, historical: false },
      { key: 'old_field', label: 'old_field', value: 'kept', historical: true },
    ])
    // A form gone from the code: everything is shown by its key.
    expect(submissionFields(submission({ a: 'x' }, { formKey: 'gone' }), undefined, text, words)).toEqual([
      { key: 'a', label: 'a', value: 'x', historical: true },
    ])
  })

  it('neutralizes spreadsheet formulas and quotes every CSV cell', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"')
    expect(csvCell('\uFF1DHYPERLINK("x")')).toBe('"\'\uFF1DHYPERLINK(""x"")"')
    expect(csvCell('\n=1+1')).toBe('"\'\n=1+1"')
    expect(csvCell('+1')).toBe('"\'+1"')
    expect(csvCell('@SUM')).toBe('"\'@SUM"')
    expect(csvCell('Олена, "Кава"')).toBe('"Олена, ""Кава"""')
  })

  it('exports one form with a column per field, and all forms with a JSON column', () => {
    const labels = {
      date: 'Дата', form: 'Форма', status: 'Папка', read: 'Прочитано', page: 'Сторінка', language: 'Мова', fields: 'Поля',
      locations: { inbox: 'Вхідні', archived: 'Архів', spam: 'Спам' },
      words,
    }
    const forms = new Map([['contact', contact!], ['quote', quote!]])
    const one = submissionsCsv([submission({ name: 'Олена', service: 'web', old: '1' })], forms, contact!, text, labels)

    expect(one.startsWith('﻿"Дата","Форма","Папка","Прочитано","Сторінка","Мова","Ім’я","Email","Phone","Послуга","Message","Consent","old"\r\n')).toBe(true)
    expect(one).toContain('"Зв’язатися","Вхідні","Ні","/contact","uk","Олена","","","Сайт","","","1"')

    const all = submissionsCsv([submission({ name: '=1+1' }), submission({ budget: '5' }, { formKey: 'quote' })], forms, null, text, labels)
    expect(all.split('\r\n')[0]).toBe('﻿"Дата","Форма","Папка","Прочитано","Сторінка","Мова","Поля"')
    expect(all).toContain('"{""name"":""=1+1""}"')
    expect(all).toContain('"Quote"')
  })

  it('names a page like a person would, without the language prefix', () => {
    const languages = ['en', 'uk']

    expect(pageName('/', languages, 'Home page')).toBe('Home page')
    expect(pageName('/uk', languages, 'Home page')).toBe('Home page')
    expect(pageName('/uk/about', languages, 'Home page')).toBe('About')
    expect(pageName('/services/web-design', languages, 'Home page')).toBe('Web design')
    expect(pageName('/%D0%BF%D1%80%D0%BE', languages, 'Home page')).toBe('Про')
    expect(pageName('/bad%E0', languages, 'Home page')).toBe('Bad%e0')
    expect(pageName(null, languages, 'Home page')).toBe('')
    expect(pageNames(['/about', '/uk/about', '/', '/uk'], languages, 'Home page')).toEqual(['About', 'Home page'])
  })

  it('makes a readable name of a key', () => {
    expect(humanize('contact_form')).toBe('Contact form')
    expect(humanize('bookCall')).toBe('Book call')
  })
})
