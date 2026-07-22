import {
  api,
  apiPostWithCsrf,
  SAP_CLIENT,
  getFriendlyErrorMessage
} from './apiClient'
import { getCachedDomainValues, setCachedDomainValues } from './domainCache'
import { FkValueOption, getCachedFkValues, setCachedFkValues } from './fkValueCache'
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
import { TableConfig, FieldMeta, AuditLogEntry, AuditItemEntry, TableRowData, AiFieldDescription } from '../types'
import { normalizeAiDescriptions } from '../utils/aiDescriptions'

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
      '$filter': "IsActiveEntity eq true and ActiveFlag eq 'X'",
      '$select': 'TableName,Description,ConfigUuid,ActiveFlag,ApprovalRequired,IsActiveEntity'
    }
  })
  const rows: TableConfig[] = res.data.value || []
  const activeRows = rows.filter(row => row.IsActiveEntity !== false && row.ActiveFlag === 'X')
  return Array.from(
    new Map(activeRows.map(row => [normalizeConfigUuid(row.ConfigUuid), {
      ...row,
      ConfigUuid: normalizeConfigUuid(row.ConfigUuid)
    }])).values()
  )
}

function extractActionResponseBody(data: any): any {
  if (!data) return {}
  if (
    data.meta_json != null ||
    data.MetaJson != null ||
    data.META_JSON != null ||
    data.data_json != null ||
    data.DATA_JSON != null ||
    data.result_json != null ||
    data.RESULT_JSON != null
  ) {
    return data
  }
  if (Array.isArray(data.value) && data.value.length > 0) {
    return data.value[0]
  }
  return data
}

function parseAiDescriptionJson(resultJson: string): AiFieldDescription[] {
  if (!resultJson) return []
  try {
    const parsed = JSON.parse(fixJson(resultJson))
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    return normalizeAiDescriptions(rows)
  } catch (e: any) {
    console.error('parseAiDescriptionJson error:', e.message)
    return []
  }
}

export async function getAiDescription(
  configUuid: string,
  tableName: string
): Promise<AiFieldDescription[]> {
  const res = await apiPostWithCsrf(
    actionUrl(configUuid, 'getAiDescription'),
    {
      TABLE_NAME: tableName,
      RESULT_JSON: '',
      ERROR_MSG: ''
    },
    { params: { 'sap-client': SAP_CLIENT } }
  )

  const body = extractActionResponseBody(res.data)
  const errorMsg = readActionField(body, 'error_msg') || ''
  if (errorMsg) {
    throw new Error(String(errorMsg))
  }

  const resultJson = readActionField(body, 'result_json') || '[]'
  return parseAiDescriptionJson(String(resultJson))
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

    const mergedFeType =
      dbField.fe_type === 'uuid' || dbField.fe_type === 'fk_select'
        ? dbField.fe_type
        : custom.fe_type || dbField.fe_type

    return {
      ...dbField,
      label: custom.label || dbField.label,
      LabelText: custom.LabelText || dbField.LabelText,
      display_order: custom.display_order ?? dbField.display_order,
      DisplayOrder: custom.DisplayOrder ?? dbField.DisplayOrder,
      is_hidden: custom.is_hidden,
      HiddenFlag: custom.HiddenFlag,
      ReadonlyFlag: custom.ReadonlyFlag,
      fe_type: mergedFeType,
      FeType: mergedFeType
    }
  }).sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
}

function parseFkValuesJson(
  dataJson: string,
  keyField: string,
  displayField: string
): FkValueOption[] {
  if (!dataJson) return []
  try {
    const fixed = fixJson(dataJson)
    const parsed = JSON.parse(fixed)
    const arr = Array.isArray(parsed) ? parsed : [parsed]
    const getValue = (row: Record<string, any>, key: string): any => {
      if (!row || !key) return undefined
      if (row[key] !== undefined) return row[key]
      const exact = Object.keys(row).find(k => k.toUpperCase() === key.toUpperCase())
      return exact ? row[exact] : undefined
    }
    const getUsableKeys = (row: Record<string, any>): string[] =>
      Object.keys(row || {}).filter(key => !isClientFieldName(key))
    const getFallbackKey = (row: Record<string, any>): string =>
      getUsableKeys(row).find(key => /(^|_)ID$/i.test(key) || /UUID/i.test(key)) ??
      getUsableKeys(row)[0] ??
      ''
    const getFallbackDisplay = (row: Record<string, any>, resolvedKey: string): any => {
      const usableKeys = getUsableKeys(row)
      const displayKey =
        usableKeys.find(key => /NAME|TEXT|DESC|DESCRIPTION|TITLE/i.test(key) && key !== resolvedKey) ??
        usableKeys.find(key => key !== resolvedKey) ??
        resolvedKey
      return displayKey ? row[displayKey] : undefined
    }
    return arr.map(row => {
      const resolvedKey = getValue(row, keyField) === undefined ? getFallbackKey(row) : keyField
      const value = String(getValue(row, resolvedKey) ?? row?.value ?? row?.VALUE ?? '')
      const labelValue =
        getValue(row, displayField) ??
        row?.label ??
        row?.LABEL ??
        getFallbackDisplay(row, resolvedKey) ??
        getValue(row, resolvedKey) ??
        row?.value ??
        row?.VALUE ??
        ''
      return {
        value,
        label: String(labelValue),
        row
      }
    }).filter(option => option.value)
  } catch (e: any) {
    console.error('parseFkValuesJson error:', e.message)
    return []
  }
}

function isClientFieldName(fieldName: string): boolean {
  const name = String(fieldName || '').trim().toUpperCase()
  return name === 'MANDT' || name === 'CLIENT'
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

export async function getFkValues(
  configUuid: string,
  tableName: string,
  fieldName: string
): Promise<FkValueOption[]> {
  const uuid = normalizeConfigUuid(configUuid)
  const cached = getCachedFkValues(uuid, tableName, fieldName)
  if (cached) return cached

  try {
    const res = await apiPostWithCsrf(
      actionUrl(uuid, 'getFkValues'),
      {
        TABLE_NAME: tableName,
        FIELD_NAME: fieldName,
        REF_TABLE: '',
        DATA_JSON: '',
        DISPLAY_FIELD: '',
        KEY_FIELD: '',
        ERROR_MSG: ''
      },
      { params: { 'sap-client': SAP_CLIENT } }
    )

    const body = extractActionResponseBody(res.data)
    const errorMsg = body.error_msg ?? body.ErrorMsg ?? body.ERROR_MSG ?? ''
    if (errorMsg) {
      console.error('getFkValues error_msg:', errorMsg)
      throw new Error(errorMsg)
    }

    const responseKeyField = String(body.key_field ?? body.KeyField ?? body.KEY_FIELD ?? fieldName)
    const keyField = isClientFieldName(responseKeyField) ? fieldName : responseKeyField
    const responseDisplayField = String(body.display_field ?? body.DisplayField ?? body.DISPLAY_FIELD ?? keyField)
    const displayField = isClientFieldName(responseDisplayField) ? keyField : responseDisplayField
    const dataJson =
      body.data_json ??
      body.DataJson ??
      body.DATA_JSON ??
      body.values_json ??
      body.ValuesJson ??
      body.VALUES_JSON ??
      '[]'
    const options = parseFkValuesJson(dataJson, keyField, displayField)
    if (options.length > 0) {
      setCachedFkValues(uuid, tableName, fieldName, options)
    }
    return options
  } catch (e: any) {
    console.error('getFkValues error:', e.response?.data ?? e.message)
    throw e
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

const REPOSITORY_JSON_PARSE_LIMIT = 500_000
const REPOSITORY_ROWS_LIMIT = 300

function parseJsonArray(value: any, label = 'Repository field'): any[] {
  if (!value) return []
  if (Array.isArray(value)) return value
  const raw = String(value)
  if (raw.length > REPOSITORY_JSON_PARSE_LIMIT) {
    return [{
      __repoNotice: `${label} is too large to parse safely in the browser (${Math.round(raw.length / 1024)} KB). Ask BE to page or summarize this section.`
    }]
  }
  try {
    const parsed = JSON.parse(raw)
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    if (rows.length > REPOSITORY_ROWS_LIMIT) {
      return [
        ...rows.slice(0, REPOSITORY_ROWS_LIMIT),
        {
          __repoNotice: `Showing first ${REPOSITORY_ROWS_LIMIT} rows. BE returned ${rows.length} rows for ${label}.`
        }
      ]
    }
    return rows
  } catch (e: any) {
    console.warn('[getRepositoryInfo] failed to parse JSON field:', e.message)
    return [{
      __repoNotice: `${label} could not be parsed as JSON.`
    }]
  }
}

export interface RepositoryInfo {
  tableName: string;
  errorMsg: string;
  dataElements: any[];
  searchHelps: any[];
  functionModules: any[];
  cdsViews: any[];
  foreignKeys: any[];
}

export async function getRepositoryInfo(configUuid: string, signal?: AbortSignal): Promise<RepositoryInfo> {
  const res = await apiPostWithCsrf(
    actionUrl(configUuid, 'getRepositoryInfo'),
    {},
    {
      params: { 'sap-client': SAP_CLIENT },
      signal,
      timeout: 12000
    }
  )

  const body = extractActionResponseBody(res.data)

  return {
    tableName: body.table_name ?? body.TableName ?? '',
    errorMsg: body.error_msg ?? body.ErrorMsg ?? '',
    dataElements: parseJsonArray(body.data_elements_json ?? body.DataElementsJson, 'Data Elements'),
    searchHelps: parseJsonArray(body.search_helps_json ?? body.SearchHelpsJson, 'Search Helps'),
    functionModules: parseJsonArray(body.function_modules_json ?? body.FunctionModulesJson, 'Function Modules'),
    cdsViews: parseJsonArray(body.cds_views_json ?? body.CdsViewsJson, 'Repository Objects'),
    foreignKeys: parseJsonArray(body.foreign_keys_json ?? body.ForeignKeysJson, 'Relationships')
  }
}

function stripClientFields(record: any): any {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return record
  const cleaned = { ...record }
  for (const key of Object.keys(cleaned)) {
    const normalized = key.toUpperCase()
    if (normalized === 'CLIENT' || normalized === 'MANDT') {
      delete cleaned[key]
    }
  }
  return cleaned
}

function asClientSafeJson(value: any): string {
  if (typeof value === 'string') {
    try {
      return JSON.stringify(stripClientFields(JSON.parse(value)))
    } catch {
      return value
    }
  }
  return JSON.stringify(stripClientFields(value))
}

function asRecordDataJson(recordData: any): string {
  return asClientSafeJson(recordData)
}

function asRecordKeyJson(recordKey: any): string {
  return asClientSafeJson(recordKey)
}

function asRecordsDataJson(records: any[]): string {
  return JSON.stringify(records.map(record => stripClientFields(record)))
}

export interface BulkActionResult {
  record_index: number
  success: boolean
  message: string
}

function readActionField(response: any, field: string): any {
  if (!response) return undefined
  const variants = [
    field,
    field.toUpperCase(),
    field.replace(/_([a-z])/g, (_, c) => String(c).toUpperCase()),
  ]
  for (const key of variants) {
    if (Object.hasOwn(response, key)) return response[key]
  }
  return undefined
}

export function getActionMessage(response: any): string {
  return (
    readActionField(response, 'message') ||
    response?.value?.message ||
    response?.data?.message ||
    response?.data?.value?.message ||
    ''
  )
}

export function parseBulkActionResults(response: any): BulkActionResult[] {
  const raw = readActionField(response, 'results_json')
  if (!raw || typeof raw !== 'string') return []

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(item => ({
      record_index: Number(readActionField(item, 'record_index') ?? 0),
      success: readActionField(item, 'success') === true || readActionField(item, 'success') === 'X',
      message: String(readActionField(item, 'message') ?? ''),
    }))
  } catch {
    return []
  }
}

export async function createRecord(configUuid: string, tableName: string, recordData: any): Promise<any> {
  const res = await apiPostWithCsrf(
    actionUrl(configUuid, 'createRecord'),
    {
      table_name: tableName,
      record_key: '',
      record_data: asRecordDataJson(recordData),
      records_data: '',
      etag_field: '',
      etag_value: ''
    },
    { params: { 'sap-client': SAP_CLIENT } }
  )
  return res.data
}

export async function bulkUpdateRecords(
  configUuid: string,
  tableName: string,
  records: any[]
): Promise<any> {
  const res = await apiPostWithCsrf(
    actionUrl(configUuid, 'updateRecord'),
    {
      table_name: tableName,
      record_key: '',
      record_data: '',
      records_data: asRecordsDataJson(records),
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
      records_data: '',
      etag_field: etagField,
      etag_value: etagValue
        ? formatEtagValueForAbap(etagValue) || String(etagValue)
        : ''
    },
    { params: { 'sap-client': SAP_CLIENT } }
  )
  return res.data
}

export async function bulkDeleteRecords(configUuid: string, tableName: string, recordKeys: any[]): Promise<any> {
  const res = await apiPostWithCsrf(
    actionUrl(configUuid, 'deleteRecord'),
    {
      table_name: tableName,
      record_key: '',
      record_data: '',
      records_data: asRecordsDataJson(recordKeys),
      etag_field: '',
      etag_value: ''
    },
    { params: { 'sap-client': SAP_CLIENT } }
  )
  return res.data
}

export async function deleteRecord(configUuid: string, tableName: string, recordKey: any): Promise<any> {
  const res = await apiPostWithCsrf(
    actionUrl(configUuid, 'deleteRecord'),
    {
      table_name: tableName,
      record_key: asRecordKeyJson(recordKey),
      record_data: '',
      records_data: '',
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

export async function getAuditItems(auditId: string): Promise<AuditItemEntry[]> {
  try {
    const res = await api.get('/AuditItem', {
      params: {
        'sap-client': SAP_CLIENT,
        '$filter': `AuditId eq '${auditId}'`,
        '$orderby': 'ItemNo'
      }
    })
    return res.data.value || []
  } catch {
    try {
      const res = await api.get(`/AuditLog(AuditId='${encodeURIComponent(auditId)}')`, {
        params: {
          'sap-client': SAP_CLIENT,
          '$expand': '_Items'
        }
      })
      const items = res.data._Items?.value || res.data._Items || []
      return Array.isArray(items) ? items : []
    } catch {
      return []
    }
  }
}

export async function rollbackAudit(auditId: string): Promise<{ success: boolean; message: string }> {
  const url = `/AuditLog(AuditId='${encodeURIComponent(auditId)}')/com.sap.gateway.srvd.zsd_tbl_config.v0001.rollback`
  const res = await apiPostWithCsrf(url, {}, { params: { 'sap-client': SAP_CLIENT } })
  const data = res.data
  const message =
    data?.message ||
    data?.value?.message ||
    data?.data?.message ||
    (Array.isArray(data?.SAP__Messages)
      ? data.SAP__Messages.map((x: any) => x.message).join('; ')
      : '') ||
    'Rollback completed'

  return {
    success: data?.success !== false,
    message
  }
}

// Re-export friendly error formatters for easier access from pages
export { getFriendlyErrorMessage }
