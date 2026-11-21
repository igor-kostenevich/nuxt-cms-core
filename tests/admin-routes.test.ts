import { describe, expect, it } from 'vitest'
import { findAdminRouteViolations, isAdminRoutePath, type AdminRouteInput } from '../src/admin-routes'

const CORE = '/pkg/app/pages'
const CLIENT = '/site/app/pages'
const isCoreFile = (file: string) => file.startsWith(`${CORE}/`)
const gate = { middleware: ['cms-auth'] }

function check(routes: AdminRouteInput[]) {
  return findAdminRouteViolations(routes, isCoreFile).map(({ reason, path }) => `${reason} ${path}`)
}

describe('isAdminRoutePath', () => {
  it('matches the namespace on a segment boundary, as vue-router does', () => {
    expect(isAdminRoutePath('/admin')).toBe(true)
    expect(isAdminRoutePath('/admin/')).toBe(true)
    expect(isAdminRoutePath('/Admin/Settings')).toBe(true)
    expect(isAdminRoutePath('//admin/x')).toBe(true)
    expect(isAdminRoutePath('/administer')).toBe(false)
    expect(isAdminRoutePath('/about')).toBe(false)
  })

  it('sees through leading optional segments, which can be empty', () => {
    expect(isAdminRoutePath('/:locale?/admin/x')).toBe(true)
    expect(isAdminRoutePath('/:locale(en|uk)?/admin')).toBe(true)
    expect(isAdminRoutePath('/:locale/admin')).toBe(false)
    expect(isAdminRoutePath('/:locale?')).toBe(false)
  })
})

describe('findAdminRouteViolations', () => {
  it('passes gated Core pages and the public login', () => {
    expect(check([
      { path: '/admin', file: `${CORE}/admin/index.vue`, meta: gate },
      { path: '/admin/edit/:path(.*)*', file: `${CORE}/admin/edit/[...path].vue`, meta: { middleware: 'cms-auth' } },
      { path: '/admin/login', file: `${CORE}/admin/login.vue`, meta: {} },
      { path: '/:locale?/about', file: `${CLIENT}/[[locale]]/about.vue` },
    ])).toEqual([])
  })

  it('rejects a Core admin page without the gate', () => {
    expect(check([
      { path: '/admin/reports', file: `${CORE}/admin/reports.vue`, meta: { middleware: ['other'] } },
    ])).toEqual(['missing-gate /admin/reports'])
  })

  it('rejects Client routes that answer under /admin, however they get there', () => {
    expect(check([
      { path: '/admin/settings', file: `${CLIENT}/admin/settings/index.vue`, meta: gate },
      { path: '/ADMIN/x', file: `${CLIENT}/ADMIN/x.vue` },
      { path: '/:locale?/admin/y', file: `${CLIENT}/[[locale]]/admin/y.vue` },
      { path: '/promo', file: `${CLIENT}/promo.vue`, alias: ['/admin/promo'] },
      { path: '/admin/old', meta: {} },
    ])).toEqual([
      'client-route /admin/settings',
      'client-route /ADMIN/x',
      'client-route /:locale?/admin/y',
      'client-route /promo',
      'client-route /admin/old',
    ])
  })

  it('builds the full path of nested routes and inherits the gate from a parent', () => {
    expect(check([
      {
        path: '/admin',
        file: `${CORE}/admin.vue`,
        meta: gate,
        children: [
          { path: '', file: `${CORE}/admin/index.vue` },
          { path: 'reports', file: `${CORE}/admin/reports.vue` },
        ],
      },
      {
        path: '/area',
        file: `${CLIENT}/area.vue`,
        children: [{ path: '/admin/nested', file: `${CLIENT}/area/nested.vue` }],
      },
    ])).toEqual(['client-route /admin/nested'])
  })
})
