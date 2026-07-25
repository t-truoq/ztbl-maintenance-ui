import { AuditLogEntry, AuditItemEntry } from '../types'
import { normalizeAuditActionType } from './auditLogHelpers'
import { formatTimestampValue, isTimestampFieldName } from './displayHelpers'

export type AuditValuePart = {
  key: string
  value: string
}

const CLIENT_FIELDS = new Set(['CLIENT', 'MANDT', '__SNAPSHOT__', '__BATCH__'])

function isClientField(key: string): boolean {
  return CLIENT_FIELDS.has(key.trim().toUpperCase())
}

function isEmptyValue(value: any): boolean {
  return value === null || value === undefined || String(value).trim() === ''
}

function valueToText(value: any): string {
  if (isEmptyValue(value)) return ''

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

function formatAuditPartValue(key: string, value: any): string {
  const text = valueToText(value)
  if (!text) return ''
  if (isTimestampFieldName(key) && text.trim() === '0') return ''
  return formatTimestampValue(text, key) || text
}

function fixAuditJson(jsonStr: string): string {
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

function parseJsonLike(str: string): any | null {
  if (!str.startsWith('{') && !str.startsWith('[')) return null

  try {
    return JSON.parse(str)
  } catch {
    try {
      return JSON.parse(fixAuditJson(str))
    } catch {
      return null
    }
  }
}

function objectToParts(obj: Record<string, any>): AuditValuePart[] {
  return Object.entries(obj)
    .filter(([key, value]) => !isClientField(key) && !isEmptyValue(value))
    .map(([key, value]) => ({ key, value: formatAuditPartValue(key, value) }))
    .filter(part => part.value)
}

function splitLegacyAuditText(str: string): AuditValuePart[] {
  return str
    .split(/\s+\|\s+/)
    .map(part => {
      const separator = part.indexOf(':')
      if (separator === -1) return { key: '', value: part.trim() }

      return {
        key: part.slice(0, separator).trim(),
        value: formatAuditPartValue(part.slice(0, separator).trim(), part.slice(separator + 1).trim())
      }
    })
    .filter(part => !part.key || !isClientField(part.key))
    .filter(part => part.key || part.value)
}

function cleanObjectLikeValue(value: string): string {
  let cleaned = value.trim().replace(/,$/, '').trim()
  if (cleaned === 'null' || cleaned === 'undefined') return ''

  if (cleaned.startsWith('"')) cleaned = cleaned.slice(1)
  if (cleaned.endsWith('"')) cleaned = cleaned.slice(0, -1)

  return cleaned.replace(/\\"/g, '"').trim()
}

function extractObjectLikeParts(str: string): AuditValuePart[] {
  const matches = Array.from(str.matchAll(/"([^"]+)"\s*:\s*/g))
  if (matches.length === 0) return []

  return matches
    .map((match, index) => {
      const key = match[1]
      const valueStart = (match.index || 0) + match[0].length
      const valueEnd = matches[index + 1]?.index ?? str.length
      const value = formatAuditPartValue(key, cleanObjectLikeValue(str.slice(valueStart, valueEnd)))
      return { key, value }
    })
    .filter(part => !isClientField(part.key) && !isEmptyValue(part.value))
}

export function getAuditValueParts(value: any): AuditValuePart[] {
  if (value === undefined || value === null) return []

  const str = String(value).trim()
  if (!str) return []

  const parsed = parseJsonLike(str)

  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return objectToParts(parsed)
  }

  if (Array.isArray(parsed)) {
    return parsed
      .flatMap((item, index) => {
        if (item && typeof item === 'object' && !Array.isArray(item)) {
          return objectToParts(item).map(part => ({
            key: `${index + 1}.${part.key}`,
            value: part.value
          }))
        }

        const text = valueToText(item)
        return text ? [{ key: '', value: text }] : []
      })
      .filter(part => part.key || part.value)
  }

  // Malformed JSON should stay as a raw scalar instead of becoming fake fields
  // such as {"CLIENT".
  if (str.startsWith('{') || str.startsWith('[')) {
    const extractedParts = str.startsWith('{') ? extractObjectLikeParts(str) : []
    return extractedParts.length > 0 ? extractedParts : [{ key: '', value: str }]
  }

  return splitLegacyAuditText(str)
}

/** Format audit JSON as "KEY: value | KEY: value", skip empty values. */
export function formatAuditValue(value: any): string {
  return getAuditValueParts(value)
    .map(part => (part.key ? `${part.key}: ${part.value}` : part.value))
    .filter(Boolean)
    .join(' | ')
}

/** Per ActionType: which columns to populate. */
export function getAuditDisplayCells(entry: AuditLogEntry | AuditItemEntry, actionTypeOverride?: string): { fieldName: string; oldValue: string; newValue: string } {
  const action = normalizeAuditActionType(actionTypeOverride || entry.ActionType)
  const formattedOld = formatAuditValue(entry.OldValue)
  const formattedNew = formatAuditValue(entry.NewValue)
  const fieldName = entry.FieldName || '-'

  switch (action) {
    case 'C':
      return { fieldName, oldValue: '', newValue: formattedNew }
    case 'D':
      return { fieldName, oldValue: formattedOld, newValue: '' }
    case 'U':
      return { fieldName, oldValue: formattedOld, newValue: formattedNew }
    case 'R':
      return { fieldName, oldValue: formattedOld, newValue: formattedNew }
    default:
      return {
        fieldName: entry.FieldName || '',
        oldValue: formattedOld,
        newValue: formattedNew
      }
  }
}
