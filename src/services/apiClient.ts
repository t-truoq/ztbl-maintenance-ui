import axios from 'axios'
import { Credentials } from '../types'

/* ============================================================================
 * PHẦN 1: CẤU HÌNH ENDPOINT & INSTANCE AXIOS GỐC
 * ============================================================================ */

/** Đường dẫn gốc của OData V4 Service Binding trên SAP Gateway */
export const SAP_SERVICE = '/sap/opu/odata4/sap/zsb_tbl_config/srvd/sap/zsd_tbl_config/0001'

/** Mã SAP Client của hệ thống đích (Server TUM S/4HANA đang dùng client 324) */
export const SAP_CLIENT = '324'

/**
 * Instance Axios chính được sử dụng cho toàn bộ các request OData trong dự án.
 * - withCredentials: true -> Bắt buộc để trình duyệt gửi kèm Cookie session khi chạy trên Fiori Launchpad.
 */
export const api = axios.create({
  baseURL: SAP_SERVICE,
  params: { 'sap-client': SAP_CLIENT },
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true
})

/* ============================================================================
 * PHẦN 2: QUẢN LÝ XÁC THỰC (BASIC AUTH & SESSION STORAGE)
 * ============================================================================ */

/** Biến lưu tạm CSRF Token hiện tại của phiên */
let csrfToken = ''

/** Biến lưu tạm thông tin user/token đăng nhập */
let credentials: Credentials | null = null

// [Khôi phục phiên] Khi F5 lại trang, tự động đọc token cũ từ sessionStorage để duy trì đăng nhập
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

/**
 * Mã hóa username:password thành chuỗi Base64 chuẩn Header Authorization Basic
 * @param username Tên đăng nhập SAP (ví dụ: DEV-253)
 * @param password Mật khẩu SAP
 */
function encodeBasicAuth(username: string, password: string): string {
  const raw = `${username}:${password}`
  const bytes = new TextEncoder().encode(raw)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary)
}

/** Xóa sạch cookie SAP cũ trên localhost do proxy lưu lại để tránh xung đột user */
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

/**
 * Lưu thông tin đăng nhập mới vào bộ nhớ & gắn Header Authorization mặc định
 */
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

/**
 * Đăng xuất: Xóa toàn bộ token trong RAM, sessionStorage và Cookie
 */
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

/**
 * Kiểm tra xem ứng dụng đang chạy thật trên SAP Fiori Launchpad hay đang chạy ở Localhost
 */
export function isDeployedOnSAP(): boolean {
  const host = window.location.hostname
  return host !== 'localhost' && host !== '127.0.0.1'
}

/** Lấy thông tin user hiện tại đang đăng nhập */
export function getCredentials(): Credentials | null {
  return credentials
}

/* ============================================================================
 * PHẦN 3: INTERCEPTORS (LẮNG NGHE & BẮT LỖI TOÀN CỤC)
 * ============================================================================ */

api.interceptors.request.use(config => {
  return config
})

api.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status
    // Nếu SAP trả về 401 Unauthorized -> Bắn Event thông báo phiên làm việc đã hết hạn để UI mở popup login
    if ((credentials || isDeployedOnSAP()) && status === 401) {
      window.dispatchEvent(new CustomEvent('sap-session-expired'))
    }
    return Promise.reject(error)
  }
)

/* ============================================================================
 * PHẦN 4: CƠ CHẾ BẢO MẬT X-CSRF-TOKEN (LẤY & TỰ ĐỘNG REFRESH TOKEN)
 * ============================================================================ */

/** Hàm phụ trợ đọc giá trị Header CSRF Token từ response của SAP */
function readCsrfHeader(headers: any): string {
  if (!headers) return ''
  return (
    headers['x-csrf-token'] ||
    headers['X-CSRF-Token'] ||
    headers.get?.('x-csrf-token') ||
    ''
  )
}

/** Kiểm tra xem lỗi trả về có phải do thiếu hoặc hết hạn CSRF Token không */
export function isCsrfError(error: any): boolean {
  const data = error?.response?.data?.error
  const category = data?.['@SAP__common.ExceptionCategory'] || data?.ExceptionCategory
  if (category === 'CSRF_Token_Missing') return true
  const msg = String(data?.message || '')
  return /csrf/i.test(msg)
}

/**
 * [Bước 1 Xin Token]: Gửi request GET kèm 'X-CSRF-Token: Fetch' lên SAP để xin mã Token mới
 */
export async function fetchCsrfToken(config: any = {}): Promise<string> {
  const res = await api.get('/', {
    headers: { 'X-CSRF-Token': 'Fetch' },
    params: { 'sap-client': SAP_CLIENT },
    signal: config.signal,
    timeout: config.timeout
  })
  csrfToken = readCsrfHeader(res.headers)
  return csrfToken
}

/**
 * [Gọi POST kèm Token]: Tự động đính kèm X-CSRF-Token vào mọi request thay đổi dữ liệu (Action/CRUD).
 * - Nếu token bị hết hạn giữa chừng (lỗi CSRF), hàm tự động xin token mới và retry lại 1 lần nữa!
 */
export async function apiPostWithCsrf(url: string, body: any, config: any = {}): Promise<any> {
  if (!csrfToken) {
    await fetchCsrfToken({
      signal: config.signal,
      timeout: config.timeout
    })
  }
  const headers = {
    'X-CSRF-Token': csrfToken,
    'Content-Type': 'application/json',
    ...config.headers
  }
  try {
    return await api.post(url, body, { ...config, headers })
  } catch (error) {
    // Nếu lỗi do hết hạn CSRF Token -> Thử fetch lại token mới và retry lại lệnh POST
    if (!isCsrfError(error)) throw error
    await fetchCsrfToken({
      signal: config.signal,
      timeout: config.timeout
    })
    return await api.post(url, body, {
      ...config,
      headers: { ...headers, 'X-CSRF-Token': csrfToken }
    })
  }
}

/* ============================================================================
 * PHẦN 5: KIỂM TRA ĐĂNG NHẬP TRÊN LOCAL (LOGIN TEST)
 * ============================================================================ */

/**
 * Kiểm tra thử username/password có đúng không bằng cách gửi 1 request OData siêu nhẹ ($top=1)
 */
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

    // Đăng nhập thành công -> Lưu credentials & Lấy CSRF token sẵn sàng làm việc
    setCredentials(username, password)
    await fetchCsrfToken()
    return { success: true, username }
  } catch {
    return { success: false, message: 'Cannot connect to SAP system' }
  }
}

/* ============================================================================
 * PHẦN 6: BỘ XỬ LÝ & CHUẨN HÓA THÔNG BÁO LỖI THÂN THIỆN (ERROR HANDLERS)
 * ============================================================================ */

/** Trích xuất câu thông báo lỗi chi tiết từ JSON trả về của SAP */
export function getSapErrorMessage(error: any): string {
  const data = error?.response?.data
  const sapMsg = data?.error?.message
  if (typeof sapMsg === 'string') return sapMsg
  if (sapMsg?.value) return sapMsg.value
  if (typeof data?.message === 'string') return data.message
  return error?.message || 'Unknown error'
}

/** Chuẩn hóa các lỗi đặc thù của ABAP (Format JSON, Date/Time conversion) */
export function formatActionErrorMessage(message: string): string {
  const msg = String(message || '')
  if (isJsonFormatError(msg)) {
    console.error('[ABAP JSON format]', msg)
    return enhanceJsonFormatError(msg)
  }
  if (isDateTimeConversionError(msg)) {
    console.error('[ABAP date/time conversion]', msg)
    return 'Rollback failed because SAP could not convert a date/time value from the audit record. Please check the original audit payload for DATE/TIME/TIMESTAMP fields or contact the backend team to normalize rollback date/time values.'
  }
  return msg
}

function isJsonFormatError(message: string): boolean {
  return /invalid format in json/i.test(String(message || ''))
}

function isDateTimeConversionError(message: string): boolean {
  return /CX_SY_CONVERSION_NO_DATE_TIME|does not represent a valid date\/time|valid date\/time/i.test(String(message || ''))
}

function enhanceJsonFormatError(message: string): string {
  const base = String(message || 'Invalid format in JSON')
  return `${base}. Please verify date (YYYYMMDD), time (HHMMSS), boolean (X or empty), and UUID (32-char uppercase hex) values.`
}

/**
 * Hàm tổng quát chuyển đổi mã lỗi HTTP (401, 403, 423, 500) thành thông báo thân thiện cho người dùng trên UI
 */
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
    return 'You do not have permission to perform this action. Please contact an administrator or request the required SAP authorization.'
  }
  if (status === 423) {
    return 'The table configuration is locked. The resource might be in use or open in another session (e.g., SAP GUI). Please close other sessions and try again.'
  }
  if (status >= 500) {
    const sapMessage = getSapErrorMessage(error)
    if (sapMessage && sapMessage !== error?.message) {
      return formatActionErrorMessage(sapMessage)
    }
    return 'Server error. Please contact administrator.'
  }
  return formatActionErrorMessage(getSapErrorMessage(error))
}
