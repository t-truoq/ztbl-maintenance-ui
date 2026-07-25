import axios from 'axios'
import {
  SAP_CLIENT,
  getCredentials,
  getFriendlyErrorMessage,
  isCsrfError
} from './apiClient'

export const EXCEL_SERVICE =
  '/sap/opu/odata4/sap/zsb_excel_pl/srvd/sap/zsd_excel_pipeline/0001'

const STUB_ID = 'X'
const ACTION_NS = 'com.sap.gateway.srvd.zsd_excel_pipeline.v0001'
const ENTITY_PATH = `/ExcelPipeline(StubId='${STUB_ID}')`

const excelApi = axios.create({
  baseURL: EXCEL_SERVICE,
  params: { 'sap-client': SAP_CLIENT },
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
  timeout: 180000
})

let csrfToken = ''

export interface ExcelDownloadResult {
  id: string
  file_base64: string
  message: string
}

export interface ExcelDiffRow {
  id?: string
  row_no: number
  table_name: string
  record_key: string
  field_name: string
  old_value: string
  new_value: string
  status: 'NEW' | 'CHANGED' | 'DELETE' | 'DELETED' | 'UNCHANGED' | 'WARNING' | 'ERROR' | 'INFO' | string
  message: string
}

export interface ExcelConfirmResult {
  id: string
  inserted_count: number
  updated_count: number
  unchanged_count: number
  skipped_count: number
  error_count: number
  message: string
}

function debugExcel(step: string, payload?: unknown): void {
  if (payload === undefined) {
    console.debug(`[ExcelPipeline] ${step}`)
    return
  }
  console.debug(`[ExcelPipeline] ${step}`, payload)
}

function applyAuthHeader(): void {
  const credentials = getCredentials()
  if (credentials?.token) {
    excelApi.defaults.headers.common.Authorization = `Basic ${credentials.token}`
  } else {
    delete excelApi.defaults.headers.common.Authorization
  }
}

function actionUrl(action: string): string {
  return `${ENTITY_PATH}/${ACTION_NS}.${action}`
}

function readCsrfHeader(headers: any): string {
  if (!headers) return ''
  return (
    headers['x-csrf-token'] ||
    headers['X-CSRF-Token'] ||
    headers.get?.('x-csrf-token') ||
    ''
  )
}

async function fetchExcelCsrfToken(): Promise<string> {
  applyAuthHeader()
  debugExcel('fetch csrf token')
  const res = await excelApi.get('/', {
    headers: { 'X-CSRF-Token': 'Fetch' },
    params: { 'sap-client': SAP_CLIENT }
  })
  csrfToken = readCsrfHeader(res.headers)
  debugExcel('csrf token fetched', { hasToken: !!csrfToken })
  return csrfToken
}

async function postExcelAction<T>(url: string, body: any): Promise<T> {
  applyAuthHeader()

  if (!csrfToken) {
    await fetchExcelCsrfToken()
  }

  debugExcel('post action', {
    url,
    body: summarizeBodyForDebug(body)
  })

  try {
    const res = await excelApi.post(url, body, {
      params: { 'sap-client': SAP_CLIENT },
      headers: {
        'X-CSRF-Token': csrfToken,
        'Content-Type': 'application/json'
      }
    })
    debugExcel('post action success', { url, status: res.status })
    return res.data as T
  } catch (error) {
    if (!isCsrfError(error)) {
      debugExcel('post action failed', {
        url,
        message: getExcelErrorMessage(error),
        status: (error as any)?.response?.status,
        data: (error as any)?.response?.data
      })
      throw error
    }

    debugExcel('csrf retry required', { url })
    await fetchExcelCsrfToken()

    const retryRes = await excelApi.post(url, body, {
      params: { 'sap-client': SAP_CLIENT },
      headers: {
        'X-CSRF-Token': csrfToken,
        'Content-Type': 'application/json'
      }
    })
    debugExcel('post action retry success', { url, status: retryRes.status })
    return retryRes.data as T
  }
}

function summarizeBodyForDebug(body: any): any {
  if (!body) return body
  return {
    ...body,
    file_base64: body.file_base64
      ? `<base64 length=${String(body.file_base64).length}>`
      : undefined,
    diff_json: body.diff_json
      ? `<json length=${String(body.diff_json).length}>`
      : undefined
  }
}

export async function downloadExcel(
  tableName: string,
  templateOnly: boolean
): Promise<ExcelDownloadResult> {
  return postExcelAction<ExcelDownloadResult>(actionUrl('downloadExcel'), {
    id: STUB_ID,
    table_name: tableName,
    template_only: templateOnly
  })
}

export async function uploadExcel(
  tableName: string,
  fileBase64: string
): Promise<ExcelDiffRow[]> {
  const result = await postExcelAction<any>(actionUrl('uploadExcel'), {
    id: STUB_ID,
    table_name: tableName,
    file_base64: fileBase64
  })

  const rows = Array.isArray(result) ? result : Array.isArray(result?.value) ? result.value : result ? [result] : []
  return normalizeExcelDiffRows(rows, tableName)
}

export async function confirmImport(
  tableName: string,
  diffRows: ExcelDiffRow[]
): Promise<ExcelConfirmResult> {
  const payload = filterDiffForCommit(diffRows, tableName).map(({ id: _id, ...row }) => ({
    ...row,
    table_name: tableName
  }))

  const result = await postExcelAction<ExcelConfirmResult>(actionUrl('confirmImport'), {
    id: STUB_ID,
    table_name: tableName,
    diff_json: JSON.stringify(payload)
  })

  return normalizeExcelConfirmResult(result)
}

export function filterDiffForCommit(rows: ExcelDiffRow[], tableName?: string): ExcelDiffRow[] {
  return rows.filter(row =>
    rowBelongsToTable(row, tableName) &&
    row.row_no !== 0 &&
    normalizeStatus(row.status) !== 'INFO' &&
    normalizeStatus(row.status) !== 'UNCHANGED' &&
    normalizeStatus(row.status) !== 'WARNING' &&
    normalizeStatus(row.status) !== 'ERROR'
  )
}

export function getInfoRows(rows: ExcelDiffRow[]): ExcelDiffRow[] {
  return rows.filter(row => row.row_no === 0 || normalizeStatus(row.status) === 'INFO')
}

export function normalizeExcelDiffRows(rows: ExcelDiffRow[], tableName?: string): ExcelDiffRow[] {
  return rows
    .filter(row => rowBelongsToTable(row, tableName))
    .map(row => ({
      ...row,
      table_name: row.table_name || tableName || '',
      status: normalizeStatus(row.status),
      message: translateExcelMessage(row.message)
    }))
}

export function normalizeExcelConfirmResult(result: ExcelConfirmResult): ExcelConfirmResult {
  return {
    ...result,
    message: translateExcelMessage(result?.message || '')
  }
}

export function isExcelConfirmFailure(result: ExcelConfirmResult | null | undefined): boolean {
  if (!result) return false

  const inserted = result.inserted_count ?? 0
  const updated = result.updated_count ?? 0
  const unchanged = result.unchanged_count ?? 0
  const skipped = result.skipped_count ?? 0
  const errors = result.error_count ?? 0
  const message = String(result.message || '')

  return errors > 0 ||
    /no valid excel row/i.test(message) ||
    /cannot create a new request/i.test(message) ||
    (skipped > 0 && inserted + updated + unchanged === 0)
}

export function normalizeExcelFileName(fileName: string): string {
  return String(fileName || '')
    .trim()
    .replace(/\.xlsx$/i, '')
    .replace(/\s*\(\d+\)$/i, '')
    .replace(/_TEMPLATE$/i, '')
    .trim()
    .toUpperCase()
}

export function isExcelFilenameAllowed(fileName: string, tableName: string): boolean {
  return /\.xlsx$/i.test(String(fileName || '').trim()) &&
    normalizeExcelFileName(fileName) === normalizeTableName(tableName)
}

function rowBelongsToTable(row: ExcelDiffRow, tableName?: string): boolean {
  if (!tableName) return true
  const rowTable = normalizeTableName(row.table_name)
  return !rowTable || rowTable === normalizeTableName(tableName)
}

function normalizeTableName(value: string): string {
  return String(value || '').trim().toUpperCase()
}

function normalizeStatus(status: string): string {
  return String(status || '').trim().toUpperCase()
}

export function translateExcelMessage(message: string): string {
  const text = String(message || '').trim()
  if (!text) return ''

  const approvalMessageMatch = text.match(/^Row\s+(\d+):\s*Request submitted for approval\s*\(ID:\s*([^)]+)\)/i)
  if (approvalMessageMatch) {
    const [, rowNo, approvalId] = approvalMessageMatch
    const counts = text.match(/C=(\d+),\s*U(?:\/D)?=(\d+),\s*E=(\d+)/i)
    const created = counts?.[1] ?? '0'
    const updated = counts?.[2] ?? '0'
    const errors = counts?.[3] ?? '0'
    return `Row ${rowNo}: Approval request submitted (ID: ${approvalId}). Submitted for approval: created ${created}, updated ${updated}, errors ${errors}. Waiting for approval in the UI.`
  }

  const segments = text.split(';').map(segment => translateExcelMessageSegment(segment)).filter(Boolean)
  return segments.length > 1 ? segments.join('; ') : segments[0] || text
}

function translateExcelMessageSegment(message: string): string {
  const text = String(message || '').trim()
  const normalized = normalizeVietnameseText(text)

  const pendingApprovalMatch = normalized.match(/^row\s+(\d+)\s+skipped:\s+record\s+dang\s+cho\s+duyet\s+boi\s+(.+?)\.?\s+khong\s+the\s+tao\s+request\s+moi\.?$/i)
  if (pendingApprovalMatch) {
    const [, rowNo, user] = pendingApprovalMatch
    return `Row ${rowNo} skipped: Record is pending approval by ${user.toUpperCase()}. Cannot create a new request.`
  }

  const approvalSummaryMatch = text.match(/C=(\d+),\s*U(?:\/D)?=(\d+),\s*E=(\d+)/i)
  if (/^da gui duyet\b/i.test(normalized) && approvalSummaryMatch) {
    const [, created, updated, errors] = approvalSummaryMatch
    return `Submitted for approval: created ${created}, updated/deleted ${updated}, errors ${errors}. Waiting for approval in the UI.`
  }

  const permissionMatch = normalized.match(/^user\s+(.+?)\s+khong\s+co\s+quyen\s+(.+?)\s+tren\s+(.+)$/i)
  if (permissionMatch) {
    const [, user, action, table] = permissionMatch
    return `User ${user.toUpperCase()} does not have permission to ${action.toUpperCase()} on ${table.toUpperCase()}.`
  }

  if (/^khong thay doi/.test(normalized)) return 'No changes'
  if (/^khong co thay doi/.test(normalized)) return 'No changes'
  if (/^du lieu khong thay doi/.test(normalized)) return 'No changes'
  if (/^gia tri thay doi/.test(normalized)) return 'Value changed'
  if (/^dong moi/.test(normalized) || /^ban ghi moi/.test(normalized)) return 'New record'
  if (/^loi/.test(normalized)) return `Error: ${text.replace(/^.*?[:\s-]+/, '') || 'Import failed.'}`

  return text
}

function normalizeVietnameseText(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/\u0111/g, 'd')
    .replace(/\u0110/g, 'D')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function fileToBase64(file: File): Promise<string> {
  return file.arrayBuffer().then(buffer => arrayBufferToBase64(buffer))
}

async function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize)
    binary += String.fromCharCode(...chunk)

    if (offset % (chunkSize * 32) === 0) {
      await new Promise<void>(resolve => window.setTimeout(resolve, 0))
    }
  }

  return btoa(binary)
}

export function downloadBase64AsXlsx(base64: string, fileName: string): void {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }

  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
  link.click()
  URL.revokeObjectURL(url)
}

export function getExcelErrorMessage(error: any): string {
  if (error?.response?.status === 403 && !isCsrfError(error)) {
    return 'You do not have permission to perform this Excel action. Please contact an administrator or request the required SAP authorization.'
  }

  const data = error?.response?.data
  const sapMessage = data?.error?.message
  if (typeof sapMessage === 'string' && sapMessage.trim()) return sapMessage
  if (sapMessage?.value) return sapMessage.value
  if (typeof data?.message === 'string' && data.message.trim()) return data.message
  if (typeof data === 'string' && data.trim()) return data
  return getFriendlyErrorMessage(error)
}
