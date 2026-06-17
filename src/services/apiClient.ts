import axios from 'axios'
import { Credentials } from '../types'

export const SAP_SERVICE = '/sap/opu/odata4/sap/zsb_tbl_config/srvd/sap/zsd_tbl_config/0001'
export const SAP_CLIENT = '324'

export const api = axios.create({
  baseURL: SAP_SERVICE,
  params: { 'sap-client': SAP_CLIENT },
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true
})

let csrfToken = ''
let credentials: Credentials | null = null

try {
  const stored = sessionStorage.getItem('sap_credentials')
  if (stored) {
    credentials = JSON.parse(stored)
    if (credentials?.token) {
      api.defaults.headers.common.Authorization = `Basic ${credentials.token}`
    }
  }
} catch (e) {
  console.warn('Failed to load credentials from sessionStorage:', e)
}

function encodeBasicAuth(username: string, password: string): string {
  const raw = `${username}:${password}`
  const bytes = new TextEncoder().encode(raw)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary)
}

/** Remove SAP session cookies stored on localhost by the dev proxy */
export function clearSapCookies(): void {
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

export function setCredentials(username: string, password: string): void {
  const token = encodeBasicAuth(username, password)
  credentials = { username, token }
  api.defaults.headers.common.Authorization = `Basic ${token}`
  try {
    sessionStorage.setItem('sap_credentials', JSON.stringify(credentials))
  } catch (e) {
    console.warn('Failed to save credentials to sessionStorage:', e)
  }
}

export function clearCredentials(): void {
  credentials = null
  delete api.defaults.headers.common.Authorization
  csrfToken = ''
  clearSapCookies()
  try {
    sessionStorage.removeItem('sap_credentials')
  } catch (e) {
    console.warn('Failed to remove credentials from sessionStorage:', e)
  }
}

export function isDeployedOnSAP(): boolean {
  const host = window.location.hostname
  return host !== 'localhost' && host !== '127.0.0.1'
}

api.interceptors.request.use(config => {
  return config
})

api.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status
    if ((credentials || isDeployedOnSAP()) && (status === 401 || (status === 403 && !isCsrfError(error)))) {
      window.dispatchEvent(new CustomEvent('sap-session-expired'))
    }
    return Promise.reject(error)
  }
)

function readCsrfHeader(headers: any): string {
  if (!headers) return ''
  return (
    headers['x-csrf-token'] ||
    headers['X-CSRF-Token'] ||
    headers.get?.('x-csrf-token') ||
    ''
  )
}

export function isCsrfError(error: any): boolean {
  const data = error?.response?.data?.error
  const category = data?.['@SAP__common.ExceptionCategory'] || data?.ExceptionCategory
  if (category === 'CSRF_Token_Missing') return true
  const msg = String(data?.message || '')
  return /csrf/i.test(msg)
}

export async function fetchCsrfToken(): Promise<string> {
  const res = await api.get('/', {
    headers: { 'X-CSRF-Token': 'Fetch' },
    params: { 'sap-client': SAP_CLIENT }
  })
  csrfToken = readCsrfHeader(res.headers)
  return csrfToken
}

export async function apiPostWithCsrf(url: string, body: any, config: any = {}): Promise<any> {
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

export function getCredentials(): Credentials | null {
  return credentials
}

export async function testLogin(username: string, password: string): Promise<{ success: boolean; username?: string; message?: string }> {
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
    await fetchCsrfToken()
    return { success: true, username }
  } catch {
    return { success: false, message: 'Cannot connect to SAP system' }
  }
}

export function getSapErrorMessage(error: any): string {
  const data = error?.response?.data
  const sapMsg = data?.error?.message
  if (typeof sapMsg === 'string') return sapMsg
  if (sapMsg?.value) return sapMsg.value
  if (typeof data?.message === 'string') return data.message
  return error?.message || 'Unknown error'
}

export function formatActionErrorMessage(message: string): string {
  const msg = String(message || '')
  if (isJsonFormatError(msg)) {
    console.error('[ABAP JSON format]', msg)
    return enhanceJsonFormatError(msg)
  }
  return msg
}

function isJsonFormatError(message: string): boolean {
  return /invalid format in json/i.test(String(message || ''))
}

function enhanceJsonFormatError(message: string): string {
  const base = String(message || 'Invalid format in JSON')
  return `${base}. Please verify date (YYYYMMDD), time (HHMMSS), boolean (X or empty), and UUID (32-char uppercase hex) values.`
}

export function getFriendlyErrorMessage(error: any): string {
  if (!axios.isAxiosError(error)) {
    return error?.message || String(error)
  }
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
  if (status === 423) {
    return 'The table configuration is locked. The resource might be in use or open in another session (e.g., SAP GUI). Please close other sessions and try again.'
  }
  if (status >= 500) {
    return 'Server error. Please contact administrator.'
  }
  return formatActionErrorMessage(getSapErrorMessage(error))
}
