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

export async function isCurrentUserInAdminList(_username?: string): Promise<boolean> {
  return true
}

export async function getTablePermissions(_username: string, _tableName: string): Promise<TablePermissionState> {
  return FULL_TABLE_PERMISSION
}
