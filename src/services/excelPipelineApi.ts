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
  withCredentials: true
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
  status: 'NEW' | 'CHANGED' | 'UNCHANGED' | 'ERROR' | 'INFO' | string
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

  if (Array.isArray(result)) return result
  if (Array.isArray(result?.value)) return result.value
  return result ? [result] : []
}

export async function confirmImport(
  tableName: string,
  diffRows: ExcelDiffRow[]
): Promise<ExcelConfirmResult> {
  const payload = filterDiffForCommit(diffRows).map(({ id: _id, ...row }) => row)

  return postExcelAction<ExcelConfirmResult>(actionUrl('confirmImport'), {
    id: STUB_ID,
    table_name: tableName,
    diff_json: JSON.stringify(payload)
  })
}

export function filterDiffForCommit(rows: ExcelDiffRow[]): ExcelDiffRow[] {
  return rows.filter(row =>
    row.row_no !== 0 &&
    row.status !== 'INFO' &&
    row.status !== 'UNCHANGED' &&
    row.status !== 'ERROR'
  )
}

export function getInfoRows(rows: ExcelDiffRow[]): ExcelDiffRow[] {
  return rows.filter(row => row.row_no === 0 || row.status === 'INFO')
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result || '')
      resolve(dataUrl.split(',')[1] || '')
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
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
  const data = error?.response?.data
  const sapMessage = data?.error?.message
  if (typeof sapMessage === 'string' && sapMessage.trim()) return sapMessage
  if (sapMessage?.value) return sapMessage.value
  if (typeof data?.message === 'string' && data.message.trim()) return data.message
  if (typeof data === 'string' && data.trim()) return data
  return getFriendlyErrorMessage(error)
}
