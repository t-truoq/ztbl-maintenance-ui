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

  it('rejects an empty current username without calling the API', async () => {
    await expect(isCurrentUserInAdminList('   ')).resolves.toBe(false)
    expect(mockGet).not.toHaveBeenCalled()
  })
})

describe('authAdminApi table permissions', () => {
  beforeEach(() => {
    mockGet.mockReset()
  })

  it('uses a user-specific permission row before table defaults', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        value: [
          {
            Username: 'DEV-213',
            TableName: 'Z251_SCHEDULE',
            CanView: 'X',
            CanCreate: '',
            CanUpdate: 'X',
            CanDelete: '',
            CanUpload: 'X',
            Update_mc: true,
            Delete_mc: false
          }
        ]
      }
    })

    await expect(getTablePermissions(' dev-213 ', ' z251_schedule ')).resolves.toEqual({
      canView: true,
      canCreate: false,
      canUpdate: true,
      canDelete: false,
      canUpload: true,
      updateEnabled: true,
      deleteEnabled: false
    })
    expect(mockGet).toHaveBeenCalledTimes(1)
    expect(mockGet.mock.calls[0][1].params.$filter).toContain("Username eq 'DEV-213'")
    expect(mockGet.mock.calls[0][1].params.$filter).toContain("TableName eq 'Z251_SCHEDULE'")
  })

  it('falls back to table permissions when user permission is missing', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { value: [] } })
      .mockResolvedValueOnce({
        data: {
          value: [
            {
              TableName: 'Z251_SCHEDULE',
              CanView: 'X',
              CanCreate: 'X',
              CanUpdate: '',
              CanDelete: 'X',
              CanUpload: '',
              Update_mc: true,
              Delete_mc: true
            }
          ]
        }
      })

    await expect(getTablePermissions('DEV-213', 'Z251_SCHEDULE')).resolves.toEqual({
      canView: true,
      canCreate: true,
      canUpdate: false,
      canDelete: true,
      canUpload: false,
      updateEnabled: true,
      deleteEnabled: true
    })
  })

  it('returns full permission when no permission row exists', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { value: [] } })
      .mockResolvedValueOnce({ data: { value: [] } })

    await expect(getTablePermissions('DEV-213', 'UNKNOWN_TABLE')).resolves.toEqual(FULL_TABLE_PERMISSION)
  })

  it('returns full permission when username or table name is missing', async () => {
    await expect(getTablePermissions('', 'Z251_SCHEDULE')).resolves.toEqual(FULL_TABLE_PERMISSION)
    await expect(getTablePermissions('DEV-213', '')).resolves.toEqual(FULL_TABLE_PERMISSION)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('escapes single quotes in permission filters', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { value: [] } })
      .mockResolvedValueOnce({ data: { value: [] } })

    await getTablePermissions("DEV'213", "ZTAB'1")

    expect(mockGet.mock.calls[0][1].params.$filter).toContain("DEV''213")
    expect(mockGet.mock.calls[0][1].params.$filter).toContain("ZTAB''1")
  })
})
