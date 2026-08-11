import { FieldMeta } from '../types'

export function formatCellValue(field?: FieldMeta | null, value?: any): string {
  if (value === undefined || value === null || value === '') return ''

  const str = String(value)
  if (!field) return str

  const feType = field.fe_type || field.FeType || ''
  const fieldName = field.field_name || field.FieldName || ''
  const fieldType = field.FieldType || ''
  const timestampField = isTimestampFieldName(fieldName) || fieldType === 'TIMESTAMP'

  if (timestampField && str.trim() === '0') {
    return ''
  }

  if (feType === 'boolean' || fieldType === 'CHECK') {
    return str === 'X' ? 'Yes' : ''
  }

  const hex = str.replace(/-/g, '')
  if (feType === 'uuid' || fieldType === 'UUID' || /^[0-9A-F]{32}$/i.test(hex)) {
    return str
  }

  const formattedTimestamp = formatTimestampValue(str, fieldName)
  if (formattedTimestamp) {
    return formattedTimestamp
  }

  if (looksLikeTimestamp(str)) {
    return str.length > 19 ? str.substring(0, 19) : str
  }

  return str
}

export function formatTimestampValue(value: any, fieldName = ''): string {
  if (value === undefined || value === null || value === '') return ''

  const raw = String(value).trim()
  if (!raw || raw === '0') return ''

  const isTimestampField = isTimestampFieldName(fieldName)

  const abapMatch = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\.(\d+))?$/)
  if (abapMatch && (isTimestampField || raw.length >= 14)) {
    const [, year, month, day, hour, minute, second, fraction = ''] = abapMatch
    const date = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second)
    )
    if (!Number.isNaN(date.getTime())) {
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

  const shortTsMatch = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})$/)
  if (shortTsMatch && (isTimestampField || raw.length === 10)) {
    const [, year, month, day, hour] = shortTsMatch
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), 0, 0)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString(undefined, {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    }
  }

  const isoLikeMatch = raw.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?/)
  if (isoLikeMatch && isTimestampField) {
    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
    const date = new Date(normalized)
    if (!Number.isNaN(date.getTime())) {
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

export function isTimestampFieldName(fieldName?: string | null): boolean {
  if (!fieldName) return false
  const normalizedField = String(fieldName).trim().toUpperCase()
  return (
    normalizedField.includes('CHANGED_AT') ||
    normalizedField.includes('CHANGE_AT') ||
    normalizedField.includes('CREATED_AT') ||
    normalizedField.includes('CREATED_ON') ||
    normalizedField.includes('TIMESTAMP')
  )
}

function looksLikeTimestamp(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(str)
}

export function formatDateForSap(value: any): string {
  if (!value) return ''
  const match = String(value).match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : String(value).substring(0, 10)
}
