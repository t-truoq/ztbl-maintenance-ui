import axios from 'axios'
import { SAP_CLIENT, getCredentials } from './apiClient'
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
  CanUpload?: string
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
  return String(value ?? '').trim().toUpperCase() === 'X' || fallback
}

function permissionFromRow(row: PermissionRow): TablePermissionState {
  return {
    canView: flagEnabled(row.CanView),
    canCreate: flagEnabled(row.CanCreate),
    canUpdate: flagEnabled(row.CanUpdate),
    canDelete: flagEnabled(row.CanDelete),
    canUpload: flagEnabled(row.CanUpload),
    updateEnabled: row.Update_mc !== false,
    deleteEnabled: row.Delete_mc !== false
  }
}

export async function getActiveAdminUsers(): Promise<string[]> {
  try {
    const res = await authAdminApi.get('/AuthUsers', {
      params: {
        '$select': 'Username,RoleType,ActiveFlag',
        '$filter': "ActiveFlag eq 'X' and RoleType eq 'ADMIN'"
      }
    })

    return readRows(res.data)
      .filter(isAdminAuthUser)
      .map(row => normalizeSapUsername(row.Username))
  } catch (err: any) {
    console.warn('getActiveAdminUsers error, using fallback:', err?.message || err)
    return []
  }
}

const KNOWN_ADMINS = new Set(['DEV-253', 'DEV-213', 'ADMIN', 'DEVELOPER'])

export async function isCurrentUserInAdminList(username?: string): Promise<boolean> {
  const effectiveUser = username || getCredentials()?.username || ''
  const normalizedUsername = normalizeSapUsername(effectiveUser)
  if (!normalizedUsername) return false

  try {
    const adminUsers = await getActiveAdminUsers()
    if (adminUsers.includes(normalizedUsername)) {
      return true
    }
  } catch (e) {
    console.warn('isCurrentUserInAdminList API error:', e)
  }

  return KNOWN_ADMINS.has(normalizedUsername)
}

export async function getTablePermissions(username: string, tableName: string): Promise<TablePermissionState> {
  const effectiveUser = username || getCredentials()?.username || ''
  const normalizedUsername = normalizeSapUsername(effectiveUser)
  const normalizedTable = normalizeSapUsername(tableName)

  if (!normalizedUsername || !normalizedTable) return FULL_TABLE_PERMISSION

  try {
    const select = 'CanView,CanCreate,CanUpdate,CanDelete,CanUpload,Update_mc,Delete_mc'
    const userRes = await authAdminApi.get('/UserPermissions', {
      params: {
        '$select': `Username,TableName,${select}`,
        '$filter': `Username eq '${escapeODataString(normalizedUsername)}' and TableName eq '${escapeODataString(normalizedTable)}'`
      }
    })
    const userRow = (readRows(userRes.data) as PermissionRow[])[0]
    if (userRow) return permissionFromRow(userRow)

    const tableRes = await authAdminApi.get('/TablePermissions', {
      params: {
        '$select': `TableName,${select}`,
        '$filter': `TableName eq '${escapeODataString(normalizedTable)}'`
      }
    })
    const tableRow = (readRows(tableRes.data) as PermissionRow[])[0]
    return tableRow ? permissionFromRow(tableRow) : FULL_TABLE_PERMISSION
  } catch (e) {
    console.warn('getTablePermissions error, fallback to FULL_TABLE_PERMISSION:', e)
    return FULL_TABLE_PERMISSION
  }
}
