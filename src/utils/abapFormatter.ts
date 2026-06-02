/**
 * ABAP-compatible value formatting for zsd_tbl_config CRUD actions.
 * FE normalizes record_data / etag_value before JSON.stringify; BE deserializes as-is.
 */

import { TableRowData } from '../types'

const ABAP_DATE_EMPTY = '00000000'
const ABAP_TIME_EMPTY = '000000'
const ABAP_UTCLONG_RE =
  /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?$/

/** @param {unknown} value */
export function toAbapDate(value: any): string {
  if (value === undefined || value === null || value === '') return ABAP_DATE_EMPTY

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}${m}${d}`
  }

  const s = String(value).trim()
  if (!s) return ABAP_DATE_EMPTY
  if (/^\d{8}$/.test(s)) return s

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[1]}${iso[2]}${iso[3]}`

  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}${m}${d}`
  }

  return ABAP_DATE_EMPTY
}

/** ISO YYYY-MM-DD for UI DatePicker from ABAP YYYYMMDD */
export function fromAbapDate(value: any): string {
  if (!value) return ''
  const s = String(value).trim()
  if (s === ABAP_DATE_EMPTY || s === '0') return ''
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : s.substring(0, 10)
}

/** @param {unknown} value */
export function toAbapTime(value: any): string {
  if (value === undefined || value === null || value === '') return ABAP_TIME_EMPTY

  const s = String(value).trim()
  if (!s) return ABAP_TIME_EMPTY
  if (/^\d{6}$/.test(s)) return s

  const parts = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/)
  if (parts) {
    const h = parts[1].padStart(2, '0')
    const m = parts[2]
    const sec = parts[3] ?? '00'
    return `${h}${m}${sec}`
  }

  return ABAP_TIME_EMPTY
}

function padFractional(frac?: string): string {
  if (!frac) return '.0000000'
  const digits = frac.replace(/\D/g, '')
  return `.${digits.padEnd(7, '0').slice(0, 7)}`
}

/** @param {unknown} value */
export function toAbapUtclong(value: any): string | null {
  if (value === undefined || value === null || value === '') return null
  if (value === 0 || value === '0') return null

  if (typeof value === 'number') {
    const s = String(value)
    if (/^\d{14}$/.test(s)) {
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}.0000000`
    }
    return null
  }

  let s = String(value).trim()
  if (!s || s === '0') return null

  const wMatch = s.match(/W\/"([^"]+)"/i)
  if (wMatch) s = wMatch[1]

  const abap = s.match(ABAP_UTCLONG_RE)
  if (abap) {
    return `${abap[1]}-${abap[2]}-${abap[3]} ${abap[4]}:${abap[5]}:${abap[6]}${padFractional(abap[7])}`
  }

  const iso = s.match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(?:Z)?/i
  )
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]} ${iso[4]}:${iso[5]}:${iso[6]}${padFractional(iso[7])}`
  }

  const compact = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?$/)
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]} ${compact[4]}:${compact[5]}:${compact[6]}${padFractional(compact[7])}`
  }

  const sapDec = s.match(/^(\d{14})(\.\d+)?$/)
  if (sapDec) {
    const d = sapDec[1]
    const frac = sapDec[2] ? sapDec[2].slice(1) : ''
    return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${d.slice(8, 10)}:${d.slice(10, 12)}:${d.slice(12, 14)}${padFractional(frac)}`
  }

  return null
}

/** @param {string} b64 */
export function base64ToHex(b64: string): string {
  if (!b64) return ''
  const binary = atob(String(b64).trim())
  return Array.from(binary)
    .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/** @param {string} hex */
export function hexToBase64(hex: string): string {
  if (!hex) return ''
  const clean = String(hex).replace(/[^a-fA-F0-9]/g, '')
  if (clean.length !== 32) return ''
  const matches = clean.match(/.{2}/g)
  if (!matches) return ''
  const bytes = matches.map(h => String.fromCharCode(parseInt(h, 16)))
  return btoa(bytes.join(''))
}

function looksLikeBase64Uuid(value: any): boolean {
  const s = String(value).trim()
  if (!s || s.length < 20) return false
  if (/^[0-9A-F]{32}$/i.test(s.replace(/-/g, ''))) return false
  return /^[A-Za-z0-9+/]+=*$/.test(s)
}

const EMPTY_UUID_B64 = 'AAAAAAAAAAAAAAAAAAAAAA=='

/** SAP initial / empty sysuuid_x16 sentinels */
export function isEmptyUuidValue(value: any): boolean {
  if (value === undefined || value === null || value === '') return true
  const s = String(value).trim()
  if (!s) return true

  const hexOnly = s.replace(/-/g, '')
  if (/^0{32}$/i.test(hexOnly)) return true

  if (s === EMPTY_UUID_B64) return true
  if (looksLikeBase64Uuid(s)) {
    try {
      return /^0{32}$/i.test(base64ToHex(s))
    } catch {
      return false
    }
  }

  return false
}

function isUuidLikeValue(value: any): boolean {
  const s = String(value ?? '').trim()
  if (!s) return false
  if (looksLikeBase64Uuid(s)) return true
  return /^[0-9A-F]{32}$/i.test(s.replace(/-/g, ''))
}

/** @param {unknown} value — BE contract: 32-char uppercase hex (empty → '') */
export function toAbapUuid(value: any): string {
  if (isEmptyUuidValue(value)) return ''
  const s = String(value).trim()

  if (looksLikeBase64Uuid(s)) {
    try {
      return base64ToHex(s)
    } catch {
      return ''
    }
  }

  const hexOnly = s.replace(/-/g, '')
  if (/^[0-9A-F]{32}$/i.test(hexOnly)) return hexOnly.toUpperCase()

  return s.toUpperCase()
}

/**
 * Map FieldConfig row → metadata entry type for normalizeRecordForAbap.
 * @param {{ FieldName?: string, FieldType?: string, IsKeyField?: string }} field
 */
export function resolveAbapFieldType(field: { FieldName?: string; FieldType?: string; IsKeyField?: string }): string {
  const t = (field.FieldType || '').toUpperCase()
  if (t === 'DATE') return 'DATE'
  if (t === 'TIME') return 'TIME'
  if (t === 'TIMESTAMP' || t === 'UTCLONG') return 'UTCLONG'
  if (t === 'UUID' || t === 'RAW16' || t === 'RAW') return 'UUID'

  const name = (field.FieldName || '').toUpperCase()
  if (name.includes('UUID') || name === 'GUID' || name.includes('ENTITY_ID')) {
    return 'UUID'
  }
  if (field.IsKeyField === 'X' && /_ID$/i.test(name)) {
    return 'UUID'
  }
  if (/_AT$/i.test(name)) return 'UTCLONG'
  if (/_TIME$/i.test(name)) return 'TIME'
  if (/_DATE$/i.test(name) || name.endsWith('_ON')) return 'DATE'

  return 'TEXT'
}

/**
 * @param {Array<{ FieldName?: string, FieldType?: string }>} allFields
 * @returns {Record<string, { type: string }>}
 */
export function buildFieldMetadata(allFields: Array<{ FieldName?: string; FieldType?: string }>): Record<string, { type: string }> {
  const meta: Record<string, { type: string }> = {}
  if (!allFields?.length) return meta
  for (const f of allFields) {
    if (f.FieldName) {
      meta[f.FieldName] = { type: resolveAbapFieldType(f) }
    }
  }
  return meta
}

/**
 * @param {Record<string, unknown>} record
 * @param {Record<string, { type: string }>} fieldMetadata
 */
export function normalizeRecordForAbap(record: TableRowData, fieldMetadata: Record<string, { type: string }>): TableRowData {
  if (!record) return {}
  const result = { ...record }

  for (const [fieldName, meta] of Object.entries(fieldMetadata)) {
    if (!Object.hasOwn(result, fieldName)) continue
    const value = result[fieldName]
    switch (meta.type) {
      case 'DATE':
        result[fieldName] = toAbapDate(value)
        break
      case 'TIME':
        result[fieldName] = toAbapTime(value)
        break
      case 'UTCLONG': {
        const normalized = toAbapUtclong(value)
        result[fieldName] = normalized === null ? null : normalized
        break
      }
      case 'UUID':
        result[fieldName] = toAbapUuid(value)
        break
      default:
        break
    }
  }

  for (const [fieldName, value] of Object.entries(result)) {
    const meta = fieldMetadata[fieldName]
    if (meta && meta.type !== 'TEXT') continue
    if (!isUuidLikeValue(value)) continue
    result[fieldName] = toAbapUuid(value)
  }

  return result
}

/**
 * Normalize a single field value for ABAP (used by buildKeyRecord, etag, etc.).
 * @param {{ FieldName?: string, FieldType?: string }} field
 * @param {unknown} value
 */
export function normalizeFieldValueForAbap(field: { FieldName?: string; FieldType?: string }, value: any): any {
  const type = resolveAbapFieldType(field)
  switch (type) {
    case 'DATE':
      return toAbapDate(value)
    case 'TIME':
      return toAbapTime(value)
    case 'UTCLONG':
      return toAbapUtclong(value)
    case 'UUID':
      return toAbapUuid(value)
    default:
      return value ?? ''
  }
}

/** Etag / optimistic-lock value as ABAP UTCLONG string, or '' to skip lock */
export function formatEtagValueForAbap(rawValue: any): string {
  if (rawValue === undefined || rawValue === null) return ''
  if (rawValue === 0 || rawValue === '0') return ''

  const normalized = toAbapUtclong(rawValue)
  if (normalized) return normalized

  const s = String(rawValue).trim()
  if (!s || s === '0') return ''

  const abap = s.match(ABAP_UTCLONG_RE)
  if (abap) {
    return `${abap[1]}-${abap[2]}-${abap[3]} ${abap[4]}:${abap[5]}:${abap[6]}${padFractional(abap[7])}`
  }

  return ''
}

export function isJsonFormatError(message: string): boolean {
  return /invalid format in json/i.test(String(message || ''))
}

export function enhanceJsonFormatError(message: string): string {
  const base = String(message || 'Invalid format in JSON')
  return `${base}. Please verify date (YYYYMMDD), time (HHMMSS), boolean (X or empty), and UUID (32-char uppercase hex) values.`
}
