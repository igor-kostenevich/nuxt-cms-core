import { describe, expect, it } from 'vitest'
import { resolveCmsContent } from '../src/content'
import { findTypeRoutes, reservedSlugs, routePattern } from '../src/content-route'

const TITLE = { title: { type: 'text', label: 'Title' } }

describe('resolveCmsContent', () => {
  it('splits types into Pages (route) and Content (fields)', () => {
    const { content, ignored } = resolveCmsContent({
      pages: { home: { label: 'Home', path: '/' } },
      types: {
        post: { label: { en: 'Posts', uk: 'Статті' }, route: '/blog/[slug]' },
        vacancy: { label: 'Vacancies', text: { newButton: 'Add vacancy', editTitle: { en: 'Edit — {title}', uk: '«{title}»' } }, fields: TITLE },
      },
    })

    expect(ignored).toEqual([])
    expect(content.types).toEqual([
      { key: 'post', label: { en: 'Posts', uk: 'Статті' }, text: {}, fields: null, section: 'pages', order: 'newest', route: '/blog/[slug]' },
      {
        key: 'vacancy',
        label: 'Vacancies',
        text: { newButton: 'Add vacancy', editTitle: { en: 'Edit — {title}', uk: '«{title}»' } },
        fields: { title: { type: 'text', label: 'Title', required: true } },
        section: 'content',
        order: 'manual',
        route: null,
      },
    ])
  })

  it('drops what is invalid, with a reason', () => {
    const { content, ignored } = resolveCmsContent({
      pages: { Bad: { label: 'x', path: '/x' }, a: { label: 'A', path: '/a' }, b: { label: 'B', path: '/a' } },
      types: {
        'Bad_Key': { label: 'x', fields: TITLE },
        both: { label: 'x', route: '/x/[slug]', fields: TITLE },
        none: { label: 'x' },
        deep: { label: 'x', route: '/blog/[slug]/comments' },
        order: { label: 'x', fields: TITLE, order: 'random' },
        nolabel: { label: '', fields: TITLE },
        emptytext: { label: 'x', text: { newTitle: { en: '' } }, fields: TITLE },
        unknowntext: { label: 'x', text: { save: 'Keep' }, fields: TITLE },
      },
    })

    expect(content.types).toEqual([])
    expect(content.pages.map(page => page.key)).toEqual(['a'])
    expect(ignored.map(item => `${item.key}:${item.reason}`)).toEqual([
      'Bad:page-key', 'b:page-duplicate-path',
      'Bad_Key:type-key', 'both:route-and-fields', 'none:no-route-or-fields', 'deep:route-format',
      'order:order', 'nolabel:type-label', 'emptytext:type-text', 'unknowntext:type-text',
    ])
  })

  it('refuses the removed `editor`, unknown keys (a typo, a removed key) and a manual type of Pages', () => {
    const { content, ignored } = resolveCmsContent({
      type: {},
      pages: { home: { label: 'Home', path: '/', title: 'x' } },
      types: {
        custom: { label: 'x', editor: '~/cms/Editor.vue' },
        typo: { label: 'x', rout: '/x/[slug]', fields: TITLE },
        old: { label: 'x', singular: 'X', fields: TITLE },
        posts: { label: 'x', route: '/blog/[slug]', order: 'manual' },
        titled: { label: 'x', route: '/news/[slug]', order: 'title' },
      },
    })

    expect(content.types.map(type => `${type.key}:${type.order}`)).toEqual(['titled:title'])
    expect(content.pages).toEqual([])
    expect(ignored.map(item => `${item.kind}:${item.key}:${item.reason}`)).toEqual([
      'root:type:unknown-key',
      'page:home:unknown-key',
      'type:custom:editor-removed',
      'type:typo:unknown-key',
      'type:old:unknown-key',
      'type:posts:route-manual',
    ])
  })
})

describe('content routes', () => {
  const routes = [
    { path: '/:locale?', name: 'locale' },
    { path: '/:locale?/blog', name: 'locale-blog' },
    { path: '/:locale?/blog/:slug()', name: 'locale-blog-slug' },
    { path: '/:locale?/blog/archive', name: 'locale-blog-archive' },
    { path: '/:locale?/:rest(.*)*', name: 'locale-rest' },
  ]

  it('brings router paths to the declared form, without the language prefix', () => {
    expect(routePattern('/:locale?/blog/:slug()')).toBe('/blog/[slug]')
    expect(routePattern('/blog/:slug')).toBe('/blog/[slug]')
    expect(routePattern('/:locale?')).toBe('/')
    expect(routePattern('/:locale?/:rest(.*)*')).toBeNull()
  })

  it('finds the route of a type and the slugs its static neighbours take', () => {
    expect(findTypeRoutes(routes, '/blog/[slug]').map(route => route.name)).toEqual(['locale-blog-slug'])
    expect(reservedSlugs(routes, '/blog/[slug]')).toEqual(['archive'])
  })
})
