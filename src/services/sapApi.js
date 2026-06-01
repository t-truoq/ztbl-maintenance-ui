import axios from 'axios'
import { getCachedDomainValues, setCachedDomainValues } from './domainCache'
import {
  formatEtagValueForAbap,
  isJsonFormatError,
  enhanceJsonFormatError
} from '../utils/abapFormatter'
import {
  parseFieldMetaJson,
  parseTableData,
  normalizeFieldMetaRow,
  buildFieldMetaFromFieldList
} from '../utils/fieldMeta'

export const SAP_SERVICE = '/sap/opu/odata4/sap/zsb_tbl_config/srvd/sap/zsd_tbl_config/0001'
export const SAP_CLIENT = '324'

const api = axios.create({
  baseURL: SAP_SERVICE,
  params: { 'sap-client': SAP_CLIENT },
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true
})

let csrfToken = ''
let credentials = null

function encodeBasicAuth(username, password) {
  const raw = `${username}:${password}`
  const bytes = new TextEncoder().encode(raw)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary)
}

/** Remove SAP session cookies stored on localhost by the dev proxy */
export function clearSapCookies() {
  const names = document.cookie.split(';').map(c => c.split('=')[0].trim()).filter(Boolean)
  for (const name of names) {
    const lower = name.toLowerCase()
    if (
      lower.startsWith('sap') ||
      lower.includes('mysapsso') ||
      lower.includes('session')
    ) {
      document.cookie = `${name}=; path=/; max-age=0`
      document.cookie = `${name}=; path=/sap; max-age=0`
    }
  }
}

export function setCredentials(username, password) {
  const token = encodeBasicAuth(username, password)
  credentials = { username, password, token }
  api.defaults.headers.common.Authorization = `Basic ${token}`
}

export function clearCredentials() {
  credentials = null
  delete api.defaults.headers.common.Authorization
  csrfToken = ''
  clearSapCookies()
}

api.interceptors.request.use(config => {
  if (!credentials?.token) {
    return Promise.reject(new Error('Not authenticated'))
  }
  return config
})

export function getCredentials() {
  return credentials
}

function readCsrfHeader(headers) {
  if (!headers) return ''
  return (
    headers['x-csrf-token'] ||
    headers['X-CSRF-Token'] ||
    headers.get?.('x-csrf-token') ||
    ''
  )
}

export function isCsrfError(error) {
  const data = error?.response?.data?.error
  const category = data?.['@SAP__common.ExceptionCategory'] || data?.ExceptionCategory
  if (category === 'CSRF_Token_Missing') return true
  const msg = String(data?.message || '')
  return /csrf/i.test(msg)
}

api.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status
    if (credentials && (status === 401 || (status === 403 && !isCsrfError(error)))) {
      window.dispatchEvent(new CustomEvent('sap-session-expired'))
    }
    return Promise.reject(error)
  }
)

export async function testLogin(username, password) {
  clearCredentials()

  const token = encodeBasicAuth(username, password)
  const url =
    `${SAP_SERVICE}/TableConfig` +
    `?$top=1&$select=TableName&sap-client=${encodeURIComponent(SAP_CLIENT)}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      headers: {
        Authorization: `Basic ${token}`,
        Accept: 'application/json',
        'sap-client': SAP_CLIENT,
        'X-CSRF-Token': 'Fetch'
      }
    })

    const contentType = res.headers.get('content-type') || ''

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        return { success: false, message: 'Invalid username or password' }
      }
      return { success: false, message: 'Cannot connect to SAP system' }
    }

    if (!contentType.includes('json')) {
      return { success: false, message: 'Invalid username or password' }
    }

    const data = await res.json()
    if (!Array.isArray(data?.value)) {
      return { success: false, message: 'Invalid username or password' }
    }

    setCredentials(username, password)
    // CSRF must be fetched via axios (same session/cookies as later POST requests)
    await fetchCsrfToken()
    return { success: true, username }
  } catch {
    return { success: false, message: 'Cannot connect to SAP system' }
  }
}

export function getSapErrorMessage(error) {
  const data = error?.response?.data
  const sapMsg = data?.error?.message
  if (typeof sapMsg === 'string') return sapMsg
  if (sapMsg?.value) return sapMsg.value
  if (typeof data?.message === 'string') return data.message
  return error?.message || 'Unknown error'
}

export function formatActionErrorMessage(message) {
  const msg = String(message || '')
  if (isJsonFormatError(msg)) {
    console.error('[ABAP JSON format]', msg)
    return enhanceJsonFormatError(msg)
  }
  return msg
}

export function getFriendlyErrorMessage(error) {
  if (!error?.response) {
    return 'Cannot connect to SAP system. Please check your connection.'
  }
  const status = error.response.status
  if (status === 401) {
    return 'Session expired. Please login again.'
  }
  if (status === 403 && isCsrfError(error)) {
    return 'Security token expired. Please try again.'
  }
  if (status === 403) {
    return 'Session expired. Please login again.'
  }
  if (status >= 500) {
    return 'Server error. Please contact administrator.'
  }
  return formatActionErrorMessage(getSapErrorMessage(error))
}

export function parseFKErrorMessage(message) {
  if (!message) return 'Cannot delete this record due to related data in another table.'
  const match = String(message).match(/referenced by table\s+(\w+)/i)
  if (match) {
    return `This record is referenced by table ${match[1]}. Please delete the related records first.`
  }
  return message
}

export function isOptimisticLockError(message) {
  return /optimistic lock/i.test(String(message || ''))
}

export function isFKReferenceError(message) {
  return /referenced by table/i.test(String(message || ''))
}

export async function fetchCsrfToken() {
  const res = await api.get('/', {
    headers: { 'X-CSRF-Token': 'Fetch' },
    params: { 'sap-client': SAP_CLIENT }
  })
  csrfToken = readCsrfHeader(res.headers)
  return csrfToken
}

async function apiPostWithCsrf(url, body, config = {}) {
  if (!csrfToken) {
    await fetchCsrfToken()
  }
  const headers = {
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json',
    ...config.headers
  }
  try {
    return await api.post(url, body, { ...config, headers })
  } catch (error) {
    if (!isCsrfError(error)) throw error
    await fetchCsrfToken()
    return await api.post(url, body, {
      ...config,
      headers: { ...headers, 'X-CSRF-Token': csrfToken }
    })
  }
}

/** Fix unquoted timestamps before JSON.parse */
export function fixJson(jsonStr) {
  if (!jsonStr) return jsonStr
  let fixed = jsonStr
  fixed = fixed.replace(
    /:\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d+)/g,
    ':"$1"'
  )
  fixed = fixed.replace(
    /:\s*(\d{14}\.\d+)/g,
    ':"$1"'
  )
  // Quote bare 14-digit timestamps (e.g. CHANGED_AT:20260320084745)
  fixed = fixed.replace(
    /:\s*(\d{14})(\s*[,}\]])/g,
    ':"$1.0000000"$2'
  )
  fixed = fixed.replace(
    /"(CHANGED_AT|CREATED_AT|CHANGE_AT|LAST_CHANGED_AT)"\s*:\s*0(\s*[,}\]])/gi,
    '"$1":"0"$2'
  )
  return fixed
}

export function parseTableDataJson(dataJson, fieldMeta = null) {
  if (!dataJson || dataJson.trim() === '[]') return []
  const fixed = fixJson(dataJson)
  if (fieldMeta?.length) {
    return parseTableData(fixed, fieldMeta)
  }
  const rows = JSON.parse(fixed)
  return Array.isArray(rows) ? rows : [rows]
}

/** Ensure UUID has dashes: 8b95f36a-4f27-1fe1-9582-026ba9aed02e */
export function normalizeConfigUuid(configUuid) {
  if (!configUuid) return ''
  const s = String(configUuid).trim()
  if (s.includes('-')) return s
  const hex = s.replace(/[^a-fA-F0-9]/g, '')
  if (hex.length === 32) {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return s
}

function actionUrl(configUuid, action) {
  const uuid = normalizeConfigUuid(configUuid)
  return `/TableConfig(ConfigUuid=${uuid},IsActiveEntity=true)/com.sap.gateway.srvd.zsd_tbl_config.v0001.${action}`
}

function parseDomainValuesJson(valuesJson) {
  if (!valuesJson) return []
  try {
    const fixed = fixJson(valuesJson)
    const parsed = JSON.parse(fixed)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr.map(item => ({
      value: String(item.value ?? item.Value ?? item.VALUE ?? item.domvalue_l ?? ''),
      description: String(
        item.description ?? item.Description ?? item.ddtext ?? item.value ?? item.VALUE ?? ''
      )
    }))
  } catch (e) {
    console.error('parseDomainValuesJson error:', e.message)
    return []
  }
}

export async function getTables() {
  const res = await api.get('/TableConfig', {
    params: {
      'sap-client': SAP_CLIENT,
      '$select': 'TableName,Description,ConfigUuid,ActiveFlag,ApprovalRequired'
    }
  })
  return res.data.value
}

function extractActionResponseBody(data) {
  if (!data) return {}
  if (data.meta_json != null || data.MetaJson != null || data.data_json != null) {
    return data
  }
  if (Array.isArray(data.value) && data.value.length > 0) {
    return data.value[0]
  }
  return data
}

/** SM30-style metadata from getFieldMeta action (meta_json) */
export async function getFieldMeta(configUuid, tableName) {
  const res = await apiPostWithCsrf(
    actionUrl(configUuid, 'getFieldMeta'),
    {
      table_name: tableName,
      where_clause: '',
      max_rows: 100
    },
    { params: { 'sap-client': SAP_CLIENT } }
  )
  const body = extractActionResponseBody(res.data)
  const errorMsg = body.error_msg ?? body.ErrorMsg ?? ''
  if (errorMsg) {
    throw new Error(errorMsg)
  }
  const metaJson = body.meta_json ?? body.MetaJson ?? '[]'
  return parseFieldMetaJson(metaJson)
}

/** getFieldMeta → fallback FieldConfig OData */
export async function loadFieldMetaForTable(configUuid, tableName) {
  try {
    const meta = await getFieldMeta(configUuid, tableName)
    if (meta.length > 0) return meta
  } catch (e) {
    console.warn('[loadFieldMetaForTable] getFieldMeta:', e.message)
  }

  try {
    const legacy = await getFieldConfig(tableName)
    if (legacy.length > 0) return legacy
  } catch (e) {
    console.warn('[loadFieldMetaForTable] getFieldConfig:', e.message)
  }

  return []
}

/**
 * Load field metadata + table rows (SM30 flow).
 * Enriches metadata from getTableData.field_list when getFieldMeta is empty.
 */
export async function loadTableContext(configUuid, tableName, maxRows = 100) {
  const [fieldMetaResult, tableData] = await Promise.all([
    loadFieldMetaForTable(configUuid, tableName),
    getTableData(configUuid, tableName, maxRows)
  ])
  let fieldMeta = fieldMetaResult

  if (!fieldMeta.length && tableData.field_list) {
    fieldMeta = buildFieldMetaFromFieldList(
      tableData.field_list,
      tableData.data_json || '',
      fixJson
    )
  }

  const dataJson = tableData.data_json || ''
  const rows = dataJson ? parseTableDataJson(dataJson, fieldMeta) : []

  return { fieldMeta, tableData, rows }
}

/** @deprecated Use getFieldMeta — kept for fallback */
export async function getFieldConfig(tableName) {
  const res = await api.get('/FieldConfig', {
    params: {
      'sap-client': SAP_CLIENT,
      '$filter': `TableName eq '${tableName}'`,
      '$orderby': 'DisplayOrder'
    }
  })
  const rows = res.data.value || []
  return rows.map(row =>
    normalizeFieldMetaRow({
      field_name: row.FieldName,
      fe_type: row.FieldType,
      length: row.Length,
      decimals: row.Decimals,
      is_key: row.IsKeyField === 'X',
      is_mandatory: row.MandatoryFlag === 'X',
      label: row.LabelText,
      domain_name: row.DomainName,
      display_order: row.DisplayOrder,
      is_hidden: row.HiddenFlag === 'X'
    })
  )
}

export async function getDomainValues(configUuid, domainName, searchString = '') {
  const uuid = normalizeConfigUuid(configUuid)
  const search = (searchString || '').trim()
  const cached = getCachedDomainValues(domainName, search)
  if (cached) return cached

  const body = { domain_name: domainName }
  if (search) {
    body.search_string = search
    body.search_text = search
  }

  const url =
    `/TableConfig(ConfigUuid=${uuid},IsActiveEntity=true)` +
    `/com.sap.gateway.srvd.zsd_tbl_config.v0001.getDomainValues`

  try {
    const res = await apiPostWithCsrf(url, body, {
      params: { 'sap-client': SAP_CLIENT }
    })

    if (res.data?.error_msg) {
      console.error('getDomainValues error_msg:', res.data.error_msg)
      return []
    }

    const options = res.data?.values_json
      ? parseDomainValuesJson(res.data.values_json)
      : []

    setCachedDomainValues(domainName, search, options)
    return options
  } catch (e) {
    console.error('getDomainValues error:', e.response?.data ?? e.message)
    return []
  }
}

export async function getTableData(configUuid, tableName, maxRows = 100) {
  const res = await apiPostWithCsrf(
    actionUrl(configUuid, 'getTableData'),
    {
      table_name: tableName,
      where_clause: '',
      max_rows: maxRows
    },
    { params: { 'sap-client': SAP_CLIENT } }
  )
  return res.data
}

function asRecordDataJson(recordData) {
  return typeof recordData === 'string' ? recordData : JSON.stringify(recordData)
}

function asRecordKeyJson(recordKey) {
  return typeof recordKey === 'string' ? recordKey : JSON.stringify(recordKey)
}

export async function createRecord(configUuid, tableName, recordData) {
  const res = await apiPostWithCsrf(
    actionUrl(configUuid, 'createRecord'),
    {
      table_name: tableName,
      record_key: '',
      record_data: asRecordDataJson(recordData),
      etag_field: '',
      etag_value: ''
    },
    { params: { 'sap-client': SAP_CLIENT } }
  )
  return res.data
}

export async function updateRecord(
  configUuid,
  tableName,
  recordKey,
  recordData,
  etagField = '',
  etagValue = ''
) {
  const res = await apiPostWithCsrf(
    actionUrl(configUuid, 'updateRecord'),
    {
      table_name: tableName,
      record_key: asRecordKeyJson(recordKey),
      record_data: asRecordDataJson(recordData),
      etag_field: etagField,
      etag_value: etagValue
        ? formatEtagValueForAbap(etagValue) || String(etagValue)
        : ''
    },
    { params: { 'sap-client': SAP_CLIENT } }
  )
  return res.data
}

export async function deleteRecord(configUuid, tableName, recordKey) {
  const res = await apiPostWithCsrf(
    actionUrl(configUuid, 'deleteRecord'),
    {
      table_name: tableName,
      record_key: asRecordKeyJson(recordKey),
      record_data: '',
      etag_field: '',
      etag_value: ''
    },
    { params: { 'sap-client': SAP_CLIENT } }
  )
  return res.data
}

export async function getAuditLog(tableName) {
  const res = await api.get('/AuditLog', {
    params: {
      'sap-client': SAP_CLIENT,
      '$filter': `TableName eq '${tableName}'`,
      '$orderby': 'ChangedAt desc'
    }
  })
  return res.data.value || []
}
