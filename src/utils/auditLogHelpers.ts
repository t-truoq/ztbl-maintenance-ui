import { AuditItemEntry, AuditLogEntry } from '../types'

const TECHNICAL_KEY_FIELDS = new Set(['CLIENT', 'MANDT', '__SNAPSHOT__', '__BATCH__'])

export function getRawRecordKey(entry: AuditLogEntry | AuditItemEntry): string {
  const anyEntry = entry as any
  return (
    anyEntry.RecordKey ||
    anyEntry.record_key ||
    anyEntry.RecordId ||
    anyEntry.KeyValue ||
    anyEntry.ObjectKey ||
    anyEntry.AuditId ||
    '-'
  )
}

export function isBulkAuditEntry(entry: AuditLogEntry | AuditItemEntry): boolean {
  return getRawRecordKey(entry).toUpperCase() === 'BULK'
}

export function hasAuditItemSummary(entry: AuditLogEntry | AuditItemEntry): boolean {
  const rawItems = (entry as any)._Items?.value || (entry as any)._Items
  if (Array.isArray(rawItems) && rawItems.length > 0) return true
  if (isBulkAuditEntry(entry)) return true

  const actionType = String((entry as any).ActionType || '').toUpperCase()
  if (actionType !== 'B' && actionType !== 'R') return false
  const summaryText = `${(entry as any).NewValue || ''} ${(entry as any).OldValue || ''}`
  return /bulk audit\s*:/i.test(summaryText) || /\d+\s*item\(s\)/i.test(summaryText)
}

export function getRecordKey(entry: AuditLogEntry | AuditItemEntry): string {
  const rawKey = getRawRecordKey(entry)
  if (!rawKey || rawKey === '-') return '-'
  if (rawKey.toUpperCase() === 'BULK') return 'BULK'

  try {
    const parsed = JSON.parse(rawKey)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return rawKey

    const visibleParts = Object.entries(parsed)
      .filter(([key]) => !TECHNICAL_KEY_FIELDS.has(key.toUpperCase()))
      .map(([key, value]) => `${key}: ${String(value)}`)

    return visibleParts.length > 0 ? visibleParts.join(', ') : '-'
  } catch {
    return rawKey
  }
}

export function extractBulkCount(entry: AuditLogEntry): string {
  const raw = String(entry.NewValue || entry.OldValue || '')
  const match = raw.match(/(\d+)\s*item/i) || raw.match(/Bulk audit:\s*(\d+)/i)
  if (match) {
    const count = parseInt(match[1], 10)
    return `${count} item(s)`
  }
  return 'Bulk CRUD Operation'
}

export function findBulkChildren(bulkEntry: AuditLogEntry, allEntries: AuditLogEntry[]): AuditItemEntry[] {
  const rawItems = (bulkEntry as any)._Items?.value || (bulkEntry as any)._Items
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    return rawItems
  }

  const bulkTime = new Date(bulkEntry.ChangedAt || '').getTime()
  const prefix20 = (bulkEntry.AuditId || '').slice(0, 20)

  const matched = allEntries.filter(e => {
    if (e.AuditId === bulkEntry.AuditId) return false
    if (hasAuditItemSummary(e)) return false
    if (e.TableName !== bulkEntry.TableName) return false

    const samePrefix = prefix20 && e.AuditId.startsWith(prefix20)
    const timeDiff = Math.abs(new Date(e.ChangedAt || '').getTime() - bulkTime)
    const sameUser = e.ChangedBy === bulkEntry.ChangedBy

    if (samePrefix && sameUser) return true
    if (sameUser && !Number.isNaN(timeDiff) && timeDiff <= 5000) return true

    return false
  })

  return matched.map((e, idx) => ({
    AuditId: e.AuditId,
    ItemNo: idx + 1,
    TableName: e.TableName,
    RecordKey: e.RecordKey,
    FieldName: e.FieldName,
    OldValue: e.OldValue,
    NewValue: e.NewValue,
    ActionType: e.ActionType
  }))
}

export function getBulkActionType(entry: AuditLogEntry, childItems: AuditItemEntry[]): string {
  if (childItems && childItems.length > 0) {
    const actions = new Set(childItems.map(item => item.ActionType || entry.ActionType).filter(Boolean))
    if (actions.size === 1) {
      return Array.from(actions)[0]
    }
    return 'B'
  }
  return entry.ActionType || 'B'
}

export function paginateAuditEntries<T>(
  entries: T[],
  pageIndex: number,
  pageSize: number
): { pageItems: T[]; totalPages: number; safePageIndex: number; start: number; end: number } {
  const normalizedPageSize = Math.max(1, pageSize)
  const totalPages = Math.max(1, Math.ceil(entries.length / normalizedPageSize))
  const safePageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1)
  const start = entries.length === 0 ? 0 : safePageIndex * normalizedPageSize + 1
  const end = Math.min(entries.length, (safePageIndex + 1) * normalizedPageSize)

  return {
    pageItems: entries.slice(safePageIndex * normalizedPageSize, (safePageIndex + 1) * normalizedPageSize),
    totalPages,
    safePageIndex,
    start,
    end
  }
}
