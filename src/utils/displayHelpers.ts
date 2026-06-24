import { FieldMeta } from '../types'

export function formatCellValue(field: FieldMeta, value: any): string {
  if (value === undefined || value === null || value === '') return ''

  const str = String(value)
  const feType = field.fe_type || field.FeType

  if (feType === 'boolean' || field.FieldType === 'CHECK') {
    return str === 'X' ? 'Yes' : ''
  }

  const hex = str.replace(/-/g, '')
  if (feType === 'uuid' || field.FieldType === 'UUID' || /^[0-9A-F]{32}$/i.test(hex)) {
    if (hex.length >= 8) return `${hex.substring(0, 8)}...`
    return str
  }

  if (field.FieldType === 'TIMESTAMP') {
    return str.length > 19 ? str.substring(0, 19) : str
  }

  if (looksLikeTimestamp(str)) {
    return str.length > 19 ? str.substring(0, 19) : str
  }

  return str
}

function looksLikeTimestamp(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(str)
}

export function formatDateForSap(value: any): string {
  if (!value) return ''
  const match = String(value).match(/(\d{4}-\d{2}-\d{2})/)
  return match ? match[1] : String(value).substring(0, 10)
}
