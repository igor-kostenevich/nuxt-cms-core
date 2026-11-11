import { describe, expect, it } from 'vitest'
import { toSettingsWrite } from '../app/data/settings-write'

describe('toSettingsWrite', () => {
  it('trims the site name and stores blank contact fields as null', () => {
    expect(toSettingsWrite({
      siteName: '  North  ',
      contactEmail: '  ',
      contactPhone: null,
      maintenanceMode: true,
    })).toEqual({
      site_name: 'North',
      contact_email: null,
      contact_phone: null,
      maintenance_mode: true,
    })
  })

  it('keeps a trimmed contact email and phone', () => {
    expect(toSettingsWrite({
      siteName: 'North',
      contactEmail: ' ada@example.com ',
      contactPhone: ' +380 67 123 45 67 ',
      maintenanceMode: false,
    })).toEqual({
      site_name: 'North',
      contact_email: 'ada@example.com',
      contact_phone: '+380 67 123 45 67',
      maintenance_mode: false,
    })
  })
})
