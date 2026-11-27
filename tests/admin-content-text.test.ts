import { describe, expect, it } from 'vitest'
import { contentText } from '../app/admin/content-label'

describe('contentText', () => {
  const text = {
    newButton: 'Add vacancy',
    editTitle: { en: 'Edit vacancy — {title}', uk: 'Вакансія «{title}»' },
  }

  it('gives the Client text in the admin language, with the title filled in', () => {
    expect(contentText(text, 'editTitle', 'uk', 'QA-інженер')).toBe('Вакансія «QA-інженер»')
    expect(contentText(text, 'editTitle', 'de', 'QA')).toBe('Edit vacancy — QA')
    expect(contentText(text, 'newButton', 'uk')).toBe('Add vacancy')
  })

  it('is null without a text: the admin uses its own words', () => {
    expect(contentText(text, 'newTitle', 'en')).toBeNull()
    expect(contentText(undefined, 'newButton', 'en')).toBeNull()
  })

  it('fills every {title} and nothing else', () => {
    expect(contentText({ editTitle: '{title} / {title} {type}' }, 'editTitle', 'en', 'A')).toBe('A / A {type}')
  })
})
