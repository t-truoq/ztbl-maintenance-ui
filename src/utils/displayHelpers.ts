import { FieldMeta } from '../types'

/* ============================================================================
 * PHAN 1: HAM DINH DANG GIA TRI TONG HOP CHO CAC O CELL (formatCellValue)
 * ============================================================================ */

export function formatCellValue(field?: FieldMeta | null, value?: any): string {
  if (value === undefined || value === null || value === '') return ''

  const str = String(value)
  if (!field) return str

  const feType = field.fe_type || field.FeType || ''
  const fieldName = field.field_name || field.FieldName || ''
  const fieldType = field.FieldType || ''
  const timestampField = isTimestampFieldName(fieldName) || fieldType === 'TIMESTAMP'

  // Truong hop timestamp la '0' -> khong hien thi
  if (timestampField && str.trim() === '0') {
    return ''
  }

  // Truong hop Boolean / Checkbox: 'X' -> 'Yes'
  if (feType === 'boolean' || fieldType === 'CHECK') {
    return str === 'X' ? 'Yes' : ''
  }

  // Truong hop UUID: Giu nguyen de hien thi day du
  const hex = str.replace(/-/g, '')
  if (feType === 'uuid' || fieldType === 'UUID' || /^[0-9A-F]{32}$/i.test(hex)) {
    return str
  }

  // Truong hop Timestamp: Dinh dang gio phut giay than thien
  const formattedTimestamp = formatTimestampValue(str, fieldName)
  if (formattedTimestamp) {
    return formattedTimestamp
  }

  if (looksLikeTimestamp(str)) {
    return str.length > 19 ? str.substring(0, 19) : str
  }

  return str
}

/* ============================================================================
 * PHAN 2: HAM DINH DANG CHUOI THOI GIAN TIMESTAMP (formatTimestampValue)
 * ============================================================================ */

export const SYSTEM_TIMESTAMP_OFFSET_MS = 7 * 60 * 60 * 1000 // Cong them 5 tieng de dong bo mui gio UTC+7 VN

export function formatTimestampValue(value: any, fieldName = ''): string {
  if (value === undefined || value === null || value === '') return ''

  const raw = String(value).trim()
  if (!raw || raw === '0') return ''

  const isTimestampField = isTimestampFieldName(fieldName)

  // Mau 1: ABAP Timestamp 14 chu so (YYYYMMDDhhmmss) kem phan le fraction tuy chon
  const abapMatch = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?$/)
  if (abapMatch && (isTimestampField || raw.length >= 14)) {
    const [, year, month, day, hour, minute, second] = abapMatch
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
    if (!Number.isNaN(date.getTime())) {
      if (isTimestampField) {
        date.setTime(date.getTime() + SYSTEM_TIMESTAMP_OFFSET_MS)
      }
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }
  }

  // Mau 2: ABAP Timestamp rut gon 10 chu so (YYYYMMDDhh)
  const shortTsMatch = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})$/)
  if (shortTsMatch && (isTimestampField || raw.length === 10)) {
    const [, year, month, day, hour] = shortTsMatch
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), 0, 0)
    if (!Number.isNaN(date.getTime())) {
      if (isTimestampField) {
        date.setTime(date.getTime() + SYSTEM_TIMESTAMP_OFFSET_MS)
      }
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  // Mau 3: Dinh dang ISO Date Time (YYYY-MM-DD HH:MM:SS)
  const isoLikeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?/)
  if (isoLikeMatch && isTimestampField) {
    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
    const date = new Date(normalized)
    if (!Number.isNaN(date.getTime())) {
      date.setTime(date.getTime() + SYSTEM_TIMESTAMP_OFFSET_MS)
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    }
  }

  return ''
}

/* ============================================================================
 * PHAN 3: CAC HAM TIEN ICH KIEM TRA VA CHUAN HOA NGAY THANG
 * ============================================================================ */

/** Kiem tra ten cot co phai la truong Timestamp he thong hay khong */
export function isTimestampFieldName(fieldName?: string | null): boolean {
  if (!fieldName) return false
  const normalizedField = String(fieldName).trim().toUpperCase()
  return (
    normalizedField.includes('CHANGED_AT') ||
    normalizedField.includes('CHANGE_AT') ||
    normalizedField.includes('CREATED_AT') ||
    normalizedField.includes('CREATED_ON') ||
    normalizedField.includes('TIMESTAMP') ||
    normalizedField.includes('LAST_CHANGED') ||
    normalizedField.includes('MODIFIED_AT') ||
    normalizedField.includes('TIMESTAMPL') ||
    normalizedField === 'ERDAT' ||
    normalizedField === 'AEDAT' ||
    normalizedField === 'LAEDA'
  )
}

/** Kiem tra chuoi co cau truc giong Timestamp ISO */
function looksLikeTimestamp(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(str)
}

/** Chuan hoa gia tri ngay ve dang YYYY-MM-DD cho SAP */
export function formatDateForSap(value: any): string {
  if (!value) return ''
  const match = String(value).match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : String(value).substring(0, 10)
}
