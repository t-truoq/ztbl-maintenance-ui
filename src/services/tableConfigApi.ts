import {
  api,
  apiPostWithCsrf,
  SAP_CLIENT,
  getFriendlyErrorMessage
} from './apiClient'
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
import { TableConfig, FieldMeta, AuditLogEntry, TableRowData } from '../types'

export function isOptimisticLockError(message: string): boolean {
  return /optimistic lock/i.test(String(message || ''))
}

export function isFKReferenceError(message: string): boolean {
  return /referenced by table/i.test(String(message || ''))
}

export function parseFKErrorMessage(message: string): string {
  if (!message) return 'Cannot delete this record due to related data in another table.'
  const match = String(message).match(/referenced by table\s+(\w+)/i)
  if (match) {
    return `This record is referenced by table ${match[1]}. Please delete the related records first.`
  }
  return message
}

export function formatActionErrorMessage(message: string): string {
  const msg = String(message || '')
  if (isJsonFormatError(msg)) {
    console.error('[ABAP JSON format]', msg)
    return enhanceJsonFormatError(msg)
  }
  return msg
}

/** Fix unquoted timestamps before JSON.parse */
export function fixJson(jsonStr: string): string {
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

export function parseTableDataJson(dataJson: string, fieldMeta: FieldMeta[] | null = null): TableRowData[] {
  if (!dataJson || dataJson.trim() === '[]') return []
  const fixed = fixJson(dataJson)
  if (fieldMeta?.length) {
    return parseTableData(fixed, fieldMeta)
  }
  const rows = JSON.parse(fixed)
  return Array.isArray(rows) ? rows : [rows]
}

export function normalizeConfigUuid(configUuid: string): string {
  if (!configUuid) return ''
  const s = String(configUuid).trim()
  if (s.includes('-')) return s
  const hex = s.replace(/[^a-fA-F0-9]/g, '')
  if (hex.length === 32) {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
  }
  return s
}

function actionUrl(configUuid: string, action: string): string {
  const uuid = normalizeConfigUuid(configUuid)
  return `/TableConfig(ConfigUuid=${uuid},IsActiveEntity=true)/com.sap.gateway.srvd.zsd_tbl_config.v0001.${action}`
}

function parseDomainValuesJson(valuesJson: string): Array<{ value: string; description: string }> {
  if (!valuesJson) return []
  try {
    const fixed = fixJson(valuesJson)
    const parsed = JSON.parse(fixed)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    return arr.map(item => ({
      value: String(item.value ?? item.Value ?? item.VALUE ?? item.domvalue_l ?? ''),
      description: String(
        item.description ?? item.Description ?? item.DESCRIPTION ?? item.ddtext ?? item.value ?? item.VALUE ?? ''
      )
    }))
  } catch (e: any) {
    console.error('parseDomainValuesJson error:', e.message)
    return []
  }
}

export async function getTables(): Promise<TableConfig[]> {
  const res = await api.get('/TableConfig', {
    params: {
      'sap-client': SAP_CLIENT,
      '$select': 'TableName,Description,ConfigUuid,ActiveFlag,ApprovalRequired'
    }
  })
  return res.data.value
}

function extractActionResponseBody(data: any): any {
  if (!data) return {}
  if (data.meta_json != null || data.MetaJson != null || data.data_json != null) {
    return data
  }
  if (Array.isArray(data.value) && data.value.length > 0) {
    return data.value[0]
  }
  return data
}

export async function getFieldMeta(configUuid: string, tableName: string): Promise<FieldMeta[]> {
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

export async function getFieldConfig(tableName: string): Promise<FieldMeta[]> {
  const res = await api.get('/FieldConfig', {
    params: {
      'sap-client': SAP_CLIENT,
      '$filter': `TableName eq '${tableName}'`,
      '$orderby': 'DisplayOrder'
    }
  })
  const rows = res.data.value || []
  return rows.map((row: any) =>
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
      is_hidden: row.HiddenFlag === 'X' || row.Hidden === 'X',
      readonly_flag: row.ReadonlyFlag === 'X' || row.Readonly === 'X'
    })
  )
}

export async function loadFieldMetaForTable(configUuid: string, tableName: string): Promise<FieldMeta[]> {
  let dbMeta: FieldMeta[] = []
  try {
    dbMeta = await getFieldMeta(configUuid, tableName)
  } catch (e: any) {
    console.warn('[loadFieldMetaForTable] getFieldMeta:', e.message)
    if (e.response?.status === 423) {
      throw e
    }
  }

  let customConfigs: FieldMeta[] = []
  try {
    customConfigs = await getFieldConfig(tableName)
  } catch (e: any) {
    console.warn('[loadFieldMetaForTable] getFieldConfig:', e.message)
    if (e.response?.status === 423) {
      throw e
    }
  }

  if (dbMeta.length === 0) {
    return customConfigs
  }

  return dbMeta.map(dbField => {
    const custom = customConfigs.find(
      c => c.field_name.toUpperCase() === dbField.field_name.toUpperCase()
    )
    if (!custom) return dbField

    return {
      ...dbField,
      label: custom.label || dbField.label,
      LabelText: custom.LabelText || dbField.LabelText,
      display_order: custom.display_order ?? dbField.display_order,
      DisplayOrder: custom.DisplayOrder ?? dbField.DisplayOrder,
      is_hidden: custom.is_hidden,
      HiddenFlag: custom.HiddenFlag,
      ReadonlyFlag: custom.ReadonlyFlag,
      fe_type: custom.fe_type || dbField.fe_type,
      FeType: custom.FeType || dbField.FeType
    }
  }).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
}

export interface TableContext {
  fieldMeta: FieldMeta[];
  tableData: any;
  rows: TableRowData[];
}

export async function loadTableContext(configUuid: string, tableName: string, maxRows = 100): Promise<TableContext> {
  const fieldMetaResult = await loadFieldMetaForTable(configUuid, tableName)
  const tableData = await getTableData(configUuid, tableName, maxRows)
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

export async function getDomainValues(configUuid: string, domainName: string, searchString = ''): Promise<Array<{ value: string; description: string }>> {
  const uuid = normalizeConfigUuid(configUuid)
  const search = (searchString || '').trim()
  const cached = getCachedDomainValues(domainName, search)
  if (cached) return cached

  const body: Record<string, any> = { domain_name: domainName }
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
  } catch (e: any) {
    console.error('getDomainValues error:', e.response?.data ?? e.message)
    return []
  }
}

export async function getTableData(configUuid: string, tableName: string, maxRows = 100): Promise<any> {
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

function asRecordDataJson(recordData: any): string {
  return typeof recordData === 'string' ? recordData : JSON.stringify(recordData)
}

function asRecordKeyJson(recordKey: any): string {
  return typeof recordKey === 'string' ? recordKey : JSON.stringify(recordKey)
}

export async function createRecord(configUuid: string, tableName: string, recordData: any): Promise<any> {
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
  configUuid: string,
  tableName: string,
  recordKey: any,
  recordData: any,
  etagField = '',
  etagValue = ''
): Promise<any> {
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

export async function deleteRecord(configUuid: string, tableName: string, recordKey: any): Promise<any> {
  console.log('[deleteRecord] configUuid:', configUuid, 'tableName:', tableName, 'recordKey:', recordKey)
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

export async function getAuditLog(tableName: string): Promise<AuditLogEntry[]> {
  const res = await api.get('/AuditLog', {
    params: {
      'sap-client': SAP_CLIENT,
      '$filter': `TableName eq '${tableName}'`,
      '$orderby': 'ChangedAt desc'
    }
  })
  return res.data.value || []
}

// Re-export friendly error formatters for easier access from pages
export { getFriendlyErrorMessage }
