import { FieldMeta } from '../types'

/**
 * Returns a human-readable label for a column header.
 * Prefers explicit label/LabelText, falls back to formatting the technical name.
 */
export function formatHeaderLabel(f: FieldMeta): string {
  const rawLabel = f.label || f.LabelText
  if (rawLabel) return rawLabel

  const technicalName = f.field_name || f.FieldName || ''
  return formatTechnicalFieldName(technicalName)
}

function formatTechnicalFieldName(technicalName: string): string {
  return technicalName
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

/**
 * Extracts an approval request ID/code from a backend action response.
 * Scans well-known property names and message text patterns.
 */
export function extractApprovalCode(response: any): string | null {
  if (!response) return null

  const keysToCheck = [
    'approval_request_id', 'approval_req_id', 'approvalreqid',
    'approvalrequest', 'approvalid', 'req_id', 'reqid',
    'approval_code', 'approvalcode', 'approvalrequestid'
  ]

  const findValue = (obj: any): string | null => {
    if (!obj || typeof obj !== 'object') return null

    // 1. Direct search in the object keys
    for (const k of Object.keys(obj)) {
      const normalizedK = k.toLowerCase().replace(/_/g, '')
      for (const target of keysToCheck) {
        const normalizedTarget = target.replace(/_/g, '')
        if (normalizedK === normalizedTarget && obj[k]) {
          return String(obj[k])
        }
      }
    }

    // 2. Search inside common wrappers: 'value' or 'data'
    if (obj.value && typeof obj.value === 'object') {
      const val = findValue(obj.value)
      if (val) return val
    }
    if (obj.data && typeof obj.data === 'object') {
      const val = findValue(obj.data)
      if (val) return val
    }

    return null
  }

  // Find explicit property
  const directVal = findValue(response)
  if (directVal) return directVal

  // Scan response messages/descriptions
  const findMessage = (obj: any): string => {
    if (!obj || typeof obj !== 'object') return ''
    
    // Check direct keys case-insensitively
    for (const k of Object.keys(obj)) {
      const lower = k.toLowerCase()
      if ((lower === 'message' || lower === 'errormsg' || lower === 'error_msg' || lower === 'msg') && obj[k]) {
        return String(obj[k])
      }
    }

    if (obj.value && typeof obj.value === 'object') {
      const msg = findMessage(obj.value)
      if (msg) return msg
    }
    if (obj.data && typeof obj.data === 'object') {
      const msg = findMessage(obj.data)
      if (msg) return msg
    }
    return ''
  }

  const message = findMessage(response)
  if (message) {
    // 1. Match any isolated 4-12 digit numbers (e.g. 1000000306)
    const numMatch = message.match(/\b\d{4,12}\b/)
    if (numMatch) {
      return numMatch[0]
    }
    // 2. Match common patterns: "Approval request 1000201", "Request #100201", "mã yêu cầu: 1000201"
    const match = message.match(/(?:approval\s+request|request|chứng\s+từ|mã\s+yêu\s+cầu|yêu\s+cầu)\s*[:#\s]*([a-zA-Z0-9_-]+)/i)
    if (match && match[1] && isNaN(Number(match[1])) === false) {
      return match[1]
    }
  }

  return null
}

