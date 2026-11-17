import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CmsDataError } from '../app/data/errors'
import { createSettingsRepository } from '../app/data/repositories/settings.repository'
import { toCmsDataError } from '../app/data/supabase'
import type { SiteSettingsForm } from '../app/types/settings'

vi.mock('#imports', () => ({ useRuntimeConfig: vi.fn() }))

const calls: { method: string, args: unknown[] }[] = []
let response: { data: unknown, error: unknown }

// Records the PostgREST chain and resolves `.single()` with `response`.
const builder = new Proxy({}, {
  get(_target, method: string) {
    return (...args: unknown[]) => {
      calls.push({ method, args })
      return method === 'single' ? Promise.resolve(response) : builder
    }
  },
})

vi.mock('../app/data/supabase-auth', () => ({
  getSupabaseAuthClient: () => builder,
}))

const form: SiteSettingsForm = {
  siteName: ' Site ',
  contactEmail: '',
  contactPhone: null,
  maintenanceMode: true,
}

function postgrestError(code: string) {
  return { code, message: 'rejected', details: '', hint: '' }
}

async function updateError(): Promise<CmsDataError> {
  const error = await createSettingsRepository().update(form).catch((cause: unknown) => cause)
  expect(error).toBeInstanceOf(CmsDataError)
  return error as CmsDataError
}

beforeEach(() => {
  calls.length = 0
})

describe('SettingsRepository.update', () => {
  it('writes only form columns to the single row and returns domain settings', async () => {
    response = {
      data: { site_name: 'Site', contact_email: null, contact_phone: null, maintenance_mode: true },
      error: null,
    }

    await expect(createSettingsRepository().update(form)).resolves.toEqual({
      siteName: 'Site',
      contactEmail: null,
      contactPhone: null,
      maintenanceMode: true,
      logo: null,
      favicon: null,
    })

    expect(calls.find(call => call.method === 'from')?.args).toEqual(['cms_site_settings'])
    // updated_at belongs to the database trigger.
    expect(calls.find(call => call.method === 'update')?.args).toEqual([{
      site_name: 'Site',
      contact_email: null,
      contact_phone: null,
      maintenance_mode: true,
    }])
    expect(calls.find(call => call.method === 'eq')?.args).toEqual(['id', 1])
  })

  // RLS does not raise on update: a rejected write just matches zero rows.
  it('reports zero updated rows as permission_denied', async () => {
    response = { data: null, error: postgrestError('PGRST116') }
    expect((await updateError()).code).toBe('permission_denied')
  })

  it('maps other backend errors through the adapter', async () => {
    response = { data: null, error: postgrestError('42501') }
    expect((await updateError()).code).toBe('permission_denied')

    response = { data: null, error: postgrestError('23514') }
    expect((await updateError()).code).toBe('validation')

    response = { data: null, error: postgrestError('08006') }
    expect((await updateError()).code).toBe('unknown')
  })
})

describe('SettingsRepository.updateBrand', () => {
  const row = { site_name: 'Site', contact_email: null, contact_phone: null, maintenance_mode: false, logo: null, favicon: null }

  // A slot left out keeps its stored value: changing the logo cannot
  // overwrite a favicon another admin has just set.
  it('writes only the slot that changed', async () => {
    response = { data: row, error: null }

    await createSettingsRepository().updateBrand({ logoMediaId: 'logo-id' })

    expect(calls.find(call => call.method === 'update')?.args).toEqual([{ logo_media_id: 'logo-id' }])
  })

  it('clears a slot with null', async () => {
    response = { data: row, error: null }

    await createSettingsRepository().updateBrand({ faviconMediaId: null })

    expect(calls.find(call => call.method === 'update')?.args).toEqual([{ favicon_media_id: null }])
  })
})

describe('toCmsDataError', () => {
  it.each([
    ['PGRST116', 'not_found'],
    ['42501', 'permission_denied'],
    ['PGRST301', 'permission_denied'],
    ['P0002', 'not_found'],
    ['23514', 'validation'],
    ['23502', 'validation'],
    ['23503', 'validation'],
    ['CMSCF', 'conflict'],
    ['CMSLK', 'locked'],
    ['CMSLL', 'lock_lost'],
    ['08006', 'unknown'],
    ['constructor', 'unknown'],
  ])('maps %s to %s and keeps the backend error as cause', (code, expected) => {
    const backend = postgrestError(code)
    const error = toCmsDataError(backend, 'Context')

    expect(error.code).toBe(expected)
    expect(error.data).toEqual({ cmsCode: expected })
    expect(error.message).toBe('Context: rejected')
    expect(error.cause).toBe(backend)
  })
})
