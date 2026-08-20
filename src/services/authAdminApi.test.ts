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
    expect(mockGet.mock.calls[0][1].params.$filter).toBeUndefined()
  })

  it('falls back to table permissions when user permission is missing', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { value: [] } })
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({
        data: {
          value: [
            {
              TableName: 'Z251_SCHEDULE',
              CanView: 'X',
              CanCreate: 'X',
              CanUpdate: '',
              CanDelete: 'X',
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
      canUpload: true,
      updateEnabled: true,
      deleteEnabled: true
    })
  })

  it('accepts Enabled/Disabled permission values from the admin UI service', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        value: [{
          Username: 'DEV-213',
          TableName: 'ZTPC_HEADER',
          CanView: 'Enabled',
          CanCreate: 'Disabled',
          CanUpdate: 'Disabled',
          CanDelete: 'Disabled'
        }]
      }
    })

    await expect(getTablePermissions('DEV-213', 'ZTPC_HEADER')).resolves.toMatchObject({
      canView: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canUpload: false
    })
  })

  it('loads a user permission by composite key when the collection is empty', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { d: { results: [] } } })
      .mockResolvedValueOnce({
        data: {
          d: {
            Username: 'DEV-011',
            TableName: 'Z253_CAT',
            CanView: true,
            CanCreate: false,
            CanUpdate: false,
            CanDelete: false,
            Update_mc: true,
            Delete_mc: true
          }
        }
      })

    await expect(getTablePermissions('DEV-011', 'Z253_CAT')).resolves.toEqual({
      canView: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
      canUpload: false,
      updateEnabled: true,
      deleteEnabled: true
    })
    expect(mockGet.mock.calls[1][0]).toContain("Username='DEV-011'")
    expect(mockGet.mock.calls[1][0]).toContain("TableName='Z253_CAT'")
  })

  it('blocks Excel import when a permission row is view-only', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        value: [{
          Username: 'DEV-213',
          TableName: 'ZTPC_HEADER',
          CanView: 'X',
          CanCreate: '',
          CanUpdate: '',
          CanDelete: ''
        }]
      }
    })

    await expect(getTablePermissions('DEV-213', 'ZTPC_HEADER')).resolves.toMatchObject({
      canView: true,
      canUpload: false
    })
  })

  it('keeps default access when no permission row exists', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { value: [] } })
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({ data: { value: [] } })

    await expect(getTablePermissions('DEV-213', 'UNKNOWN_TABLE')).resolves.toEqual(FULL_TABLE_PERMISSION)
  })

  it('rejects when the authorization service fails', async () => {
    mockGet.mockRejectedValueOnce({
      response: { status: 403, data: {} },
      message: 'Forbidden'
    })

    await expect(getTablePermissions('DEV-213', 'Z251_SCHEDULE')).rejects.toMatchObject({
      response: { status: 403 }
    })
  })

  it('returns full permission when username or table name is missing', async () => {
    await expect(getTablePermissions('', 'Z251_SCHEDULE')).resolves.toEqual(FULL_TABLE_PERMISSION)
    await expect(getTablePermissions('DEV-213', '')).resolves.toEqual(FULL_TABLE_PERMISSION)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('escapes single quotes in permission filters', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { value: [] } })
      .mockRejectedValueOnce({ response: { status: 404 } })
      .mockResolvedValueOnce({ data: { value: [] } })

    await getTablePermissions("DEV'213", "ZTAB'1")

    expect(mockGet.mock.calls[1][0]).toContain("Username='DEV''213'")
    expect(mockGet.mock.calls[2][1].params.$filter).toContain("ZTAB''1")
  })
})
