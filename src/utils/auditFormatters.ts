import { fixJson } from '../services/sapApi'
import { AuditLogEntry } from '../types'

/** Format audit JSON as "KEY: value | KEY: value", skip empty values */
export function formatAuditValue(value: any): string {
  if (value === undefined || value === null) return ''
  const str = String(value).trim()
  if (!str) return ''

  try {
    const toParse = str.startsWith('{') || str.startsWith('[') ? fixJson(str) : str
    const parsed = JSON.parse(toParse)

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const parts = Object.entries(parsed)
        .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
        .map(([k, v]) => `${k}: ${v}`)
      return parts.length > 0 ? parts.join(' | ') : ''
    }

    if (Array.isArray(parsed)) {
      return parsed
        .map(item =>
          typeof item === 'object' && item !== null
            ? formatAuditValue(JSON.stringify(item))
            : String(item)
        )
        .filter(Boolean)
        .join(' | ')
    }
  } catch {
    // not JSON — show raw
  }

  return str
}

/** Per ActionType: which columns to populate */
export function getAuditDisplayCells(entry: AuditLogEntry): { fieldName: string; oldValue: string; newValue: string } {
  const action = entry.ActionType
  const formattedOld = formatAuditValue(entry.OldValue)
  const formattedNew = formatAuditValue(entry.NewValue)
  const fieldName = entry.FieldName || '—'

  switch (action) {
    case 'C':
      return { fieldName, oldValue: '', newValue: formattedNew }
    case 'D':
      return { fieldName, oldValue: formattedOld, newValue: '' }
    case 'U':
      return { fieldName, oldValue: formattedOld, newValue: formattedNew }
    default:
      return {
        fieldName: entry.FieldName || '',
        oldValue: formattedOld,
        newValue: formattedNew
      }
  }
}
