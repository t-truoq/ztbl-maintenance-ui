import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn()
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: mockGet,
      interceptors: {
        request: { use: vi.fn() }
      },
      defaults: { headers: { common: {} } }
    }))
  }
}))

vi.mock('./apiClient', () => ({
  SAP_CLIENT: '324',
  getCredentials: () => null
}))

import {
  FULL_TABLE_PERMISSION,
  NO_TABLE_PERMISSION,
  getActiveAdminUsers,
  getTablePermissions,
  isCurrentUserInAdminList
} from './authAdminApi'

describe('authAdminApi admin users', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('returns normalized active ADMIN users from OData v4 rows', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        value: [
          { Username: ' dev-213 ', RoleType: ' admin ', ActiveFlag: ' x ' },
          { Username: 'DEV-999', RoleType: 'USER', ActiveFlag: 'X' },
          { Username: 'DEV-111', RoleType: 'ADMIN', ActiveFlag: '' }
        ]
      }
    })

    await expect(getActiveAdminUsers()).resolves.toEqual(['DEV-213'])
  })

  it('reads legacy OData v2 d.results rows', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        d: {
          results: [
            { Username: 'DEV-001', RoleType: 'ADMIN', ActiveFlag: 'X' }
          ]
        }
      }
    })

    await expect(getActiveAdminUsers()).resolves.toEqual(['DEV-001'])
  })

  it('checks the current user against the normalized admin list', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        value: [
          { Username: 'DEV-213', RoleType: 'ADMIN', ActiveFlag: 'X' }
        ]
      }
    })

    await expect(isCurrentUserInAdminList(' dev-213 ')).resolves.toBe(true)
  })

  it('allows access and delegates permission checking to backend', async () => {
    await expect(isCurrentUserInAdminList('DEV-999')).resolves.toBe(true)
  })
})

describe('authAdminApi table permissions', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('always returns FULL_TABLE_PERMISSION to allow all actions on frontend', async () => {
    await expect(getTablePermissions('DEV-213', 'Z251_SCHEDULE')).resolves.toEqual(FULL_TABLE_PERMISSION)
  })

  it('returns full permission when username or table name is passed', async () => {
    await expect(getTablePermissions('', 'Z251_SCHEDULE')).resolves.toEqual(FULL_TABLE_PERMISSION)
    await expect(getTablePermissions('DEV-213', '')).resolves.toEqual(FULL_TABLE_PERMISSION)
  })
})
