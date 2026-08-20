import axios from 'axios'
import { SAP_CLIENT, getCredentials, api } from './apiClient'
import { isAdminAuthUser, normalizeSapUsername } from '../utils/authz'

export const SAP_AUTH_ADMIN_SERVICE = '/sap/opu/odata/sap/ZSB_AUTH_ADMIN_V2'

interface AuthUserRow {
  Username?: string
  RoleType?: string
  ActiveFlag?: string
}

export interface TablePermissionState {
  canView: boolean
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canUpload: boolean
  updateEnabled: boolean
  deleteEnabled: boolean
}

interface PermissionRow {
  Username?: string
  TableName?: string
  CanView?: string
  CanCreate?: string
  CanUpdate?: string
  CanDelete?: string
  Update_mc?: boolean
  Delete_mc?: boolean
}

export const FULL_TABLE_PERMISSION: TablePermissionState = {
  canView: true,
  canCreate: true,
  canUpdate: true,
  canDelete: true,
  canUpload: true,
  updateEnabled: true,
  deleteEnabled: true
}

export const NO_TABLE_PERMISSION: TablePermissionState = {
  canView: false,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
  canUpload: false,
  updateEnabled: false,
  deleteEnabled: false
}

const authAdminApi = axios.create({
  baseURL: SAP_AUTH_ADMIN_SERVICE,
  params: {
    'sap-client': SAP_CLIENT,
    '$format': 'json'
  },
  headers: {
    Accept: 'application/json'
  },
  withCredentials: true
})

authAdminApi.interceptors.request.use(config => {
  const credentials = getCredentials()
  if (credentials?.token) {
    config.headers.Authorization = `Basic ${credentials.token}`
  } else if (api.defaults.headers.common.Authorization) {
    config.headers.Authorization = api.defaults.headers.common.Authorization
  }
  return config
})

function readRows(data: any): AuthUserRow[] {
  if (Array.isArray(data?.value)) return data.value
  if (Array.isArray(data?.d?.results)) return data.d.results
  if (Array.isArray(data?.d)) return data.d
  return []
}

function escapeODataString(value: string): string {
  return String(value || '').replace(/'/g, "''")
}

function flagEnabled(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  const normalized = String(value ?? '').trim().toUpperCase()
  if (['X', 'TRUE', '1', 'YES', 'Y', 'ENABLED', 'ENABLE', 'ON'].includes(normalized)) return true
  if (['', '0', 'FALSE', 'NO', 'N', 'DISABLED', 'DISABLE', 'OFF'].includes(normalized)) return false
  return fallback
}

function readEntity(data: any): Record<string, any> | null {
  const entity = data?.d ?? data
  if (!entity || typeof entity !== 'object' || Array.isArray(entity)) return null
  if (Array.isArray(entity.results) || Array.isArray(entity.value)) return null
  return entity
}

function readPermissionValue(row: any, name: string): unknown {
  if (!row || typeof row !== 'object') return undefined
  if (row[name] !== undefined) return row[name]
  const key = Object.keys(row).find(candidate => candidate.toUpperCase() === name.toUpperCase())
  return key ? row[key] : undefined
}

function permissionFromRow(row: PermissionRow): TablePermissionState {
  const canView = flagEnabled(readPermissionValue(row, 'CanView'))
  const canCreate = flagEnabled(readPermissionValue(row, 'CanCreate'))
  const canUpdate = flagEnabled(readPermissionValue(row, 'CanUpdate'))
  const canDelete = flagEnabled(readPermissionValue(row, 'CanDelete'))
  return {
    canView,
    canCreate,
    canUpdate,
    canDelete,
    // CanUpload is not part of ZSB_AUTH_ADMIN_V2. Excel import can mutate
    // records, so require at least one mutation permission.
    canUpload: canCreate || canUpdate || canDelete,
    updateEnabled: readPermissionValue(row, 'Update_mc') !== false,
    deleteEnabled: readPermissionValue(row, 'Delete_mc') !== false
  }
}

export async function getActiveAdminUsers(): Promise<string[]> {
  try {
    let res: any
    try {
      res = await authAdminApi.get('/AuthUsers', {
        params: {
          '$select': 'Username,RoleType,ActiveFlag',
          '$filter': "RoleType eq 'ADMIN'"
        }
      })
    } catch {
      // Fallback without $filter if OData backend rejects filter syntax
      res = await authAdminApi.get('/AuthUsers')
    }

    return readRows(res.data)
      .filter(isAdminAuthUser)
      .map(row => normalizeSapUsername(row.Username))
  } catch (err: any) {
    console.warn('getActiveAdminUsers error, using fallback:', err?.message || err)
    return []
  }
}

const KNOWN_ADMINS = new Set(['DEV-253', 'DEV-183', 'DEV-251', 'LEARN-10000', 'ADMIN', 'DEVELOPER'])

export async function isCurrentUserInAdminList(username?: string): Promise<boolean> {
  const effectiveUser = username || getCredentials()?.username || ''
  const normalizedUsername = normalizeSapUsername(effectiveUser)
  if (!normalizedUsername) return false

  // Keep the explicitly configured emergency/admin accounts authoritative even
  // when the AuthUsers endpoint responds successfully but omits the current
  // user from its filtered result.
  if (KNOWN_ADMINS.has(normalizedUsername)) return true

  try {
    const adminUsers = await getActiveAdminUsers()
    if (adminUsers.includes(normalizedUsername)) {
      return true
    }
  } catch (e) {
    console.warn('isCurrentUserInAdminList API error:', e)
  }

  return false
}

export async function getTablePermissions(username: string, tableName: string): Promise<TablePermissionState> {
  const effectiveUser = username || getCredentials()?.username || ''
  const normalizedUsername = normalizeSapUsername(effectiveUser)
  const normalizedTable = normalizeSapUsername(tableName)

  if (!normalizedUsername || !normalizedTable) return FULL_TABLE_PERMISSION

  try {
    // Upload permission is derived from the mutation permissions below.
    const select = 'CanView,CanCreate,CanUpdate,CanDelete,Update_mc,Delete_mc'
    const userRes = await authAdminApi.get('/UserPermissions', {
      params: {
        '$select': `Username,TableName,${select}`
      }
    })
    let userRow = (readRows(userRes.data) as PermissionRow[]).find(row =>
      normalizeSapUsername(readPermissionValue(row, 'Username') as string) === normalizedUsername &&
      normalizeSapUsername(readPermissionValue(row, 'TableName') as string) === normalizedTable
    )
    if (!userRow) {
      try {
        const directRes = await authAdminApi.get(
          `/UserPermissions(Username='${escapeODataString(normalizedUsername)}',TableName='${escapeODataString(normalizedTable)}')`,
          { params: { '$select': `Username,TableName,${select}` } }
        )
        const directRow = readEntity(directRes.data) as PermissionRow | null
        if (
          directRow &&
          normalizeSapUsername(readPermissionValue(directRow, 'Username') as string) === normalizedUsername &&
          normalizeSapUsername(readPermissionValue(directRow, 'TableName') as string) === normalizedTable
        ) {
          userRow = directRow
        }
      } catch (error: any) {
        if (error?.response?.status !== 404) throw error
      }
    }
    if (userRow) return permissionFromRow(userRow)

    const tableRes = await authAdminApi.get('/TablePermissions', {
      params: {
        '$select': `TableName,${select}`,
        '$filter': `TableName eq '${escapeODataString(normalizedTable)}'`
      }
    })
    const tableRow = (readRows(tableRes.data) as PermissionRow[])[0]
    // If neither a user-specific nor a table-default assignment exists, keep
    // the legacy default for tables that are not managed by the auth service.
    return tableRow ? permissionFromRow(tableRow) : FULL_TABLE_PERMISSION
  } catch (e) {
    console.warn('getTablePermissions error, denying table access:', e)
    // A failed authorization request must never grant access by accident.
    // Let the page surface the reason while it renders the table as denied.
    throw e
  }
}
