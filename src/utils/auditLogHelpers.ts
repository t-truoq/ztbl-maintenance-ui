import { AuditItemEntry, AuditLogEntry } from '../types'

const TECHNICAL_KEY_FIELDS = new Set(['CLIENT', 'MANDT', '__SNAPSHOT__', '__BATCH__'])

export function normalizeAuditActionType(actionType?: string): string {
  const normalized = String(actionType || '').trim().toUpperCase()
  const token = normalized.split(/\s+/)[0]

  if (normalized.includes(',')) return 'B'
  if (normalized === 'ROLLED BACK') return 'R'
  if (normalized === 'BULK CRUD OPERATION') return 'B'
  if (['C', 'CREATE', 'CREATED', '01'].includes(token)) return 'C'
  if (['U', 'UPDATE', 'UPDATED', '02'].includes(token)) return 'U'
  if (['D', 'DELETE', 'DELETED', '03'].includes(token)) return 'D'
  if (['R', 'ROLLBACK'].includes(token)) return 'R'
  if (['B', 'BULK'].includes(token)) return 'B'
  return normalized
}

const AUDIT_OPERATION_LABELS: Record<string, string> = {
  C: 'Create',
  U: 'Update',
  D: 'Delete',
  R: 'Rollback',
  B: 'Bulk'
}

const AUDIT_ACTION_LABELS: Record<string, string> = {
  C: 'Created',
  U: 'Updated',
  D: 'Deleted',
  R: 'Rolled back',
  B: 'Bulk'
}

export function getAuditOperationLabel(actionType?: string): string {
  const action = normalizeAuditActionType(actionType)
  return AUDIT_OPERATION_LABELS[action] || action || 'Unknown'
}

export function getAuditActionLabel(actionType?: string): string {
  const action = normalizeAuditActionType(actionType)
  return AUDIT_ACTION_LABELS[action] || action || 'Unknown'
}

export function isRollbackAuditAction(actionType?: string): boolean {
  return normalizeAuditActionType(actionType) === 'R'
}

export function isRolledBackAuditEntry(entry: AuditLogEntry | AuditItemEntry): boolean {
  const anyEntry = entry as any
  return Boolean(String(anyEntry.RollbackAuditId ?? anyEntry.rollbackAuditId ?? '').trim())
}

function isTruthyRollbackStatus(value: unknown): boolean {
  return value === true || ['true', 'x', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase())
}

/**
 * The backend exposes rollback eligibility per audit entry.  RollbackAuditId
 * is populated after an entry has already been rolled back, while
 * _OperationControl.rollback is the current eligibility flag.
 */
export function canRollbackAuditEntry(entry: AuditLogEntry | AuditItemEntry): boolean {
  const anyEntry = entry as any
  const rollbackAuditId = String(anyEntry.RollbackAuditId ?? anyEntry.rollbackAuditId ?? '').trim()
  if (rollbackAuditId) return false

  const operationControl =
    anyEntry._OperationControl ??
    anyEntry.OperationControl ??
    anyEntry.__OperationControl
  const rollbackStatus = operationControl?.rollback ?? operationControl?.Rollback

  // Fail closed when the backend supplies the control object but says that
  // rollback is disabled. This prevents a request that the backend will reject.
  if (operationControl && !isTruthyRollbackStatus(rollbackStatus)) return false

  // Keep compatibility with older responses that did not include the control
  // annotation; RollbackAuditId still prevents a second rollback.
  return true
}

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

  const actionType = normalizeAuditActionType((entry as any).ActionType)
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

export function findBulkChildren(bulkEntry: AuditLogEntry, _allEntries: AuditLogEntry[]): AuditItemEntry[] {
  const rawItems = (bulkEntry as any)._Items?.value || (bulkEntry as any)._Items
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    return rawItems
  }

  return []
}

export function getBulkActionType(entry: AuditLogEntry, childItems: AuditItemEntry[]): string {
  if (isRollbackAuditAction(entry.ActionType)) return 'R'

  // More than two child actions are represented as a bulk operation even
  // when every child has the same action. This keeps the overview operation
  // aligned with the size of the grouped audit.
  const summaryText = String(entry.NewValue || entry.OldValue || '')
  const summaryCount = Number(summaryText.match(/(\d+)\s*item/i)?.[1] || 0)
  const actionCount = childItems.length > 0 ? childItems.length : summaryCount
  if (actionCount >= 2) return 'B'

  const childActions = new Set(
    childItems
      .map(item => normalizeAuditActionType(item.ActionType))
      .filter(action => action && action !== 'B' && action !== 'R')
  )
  if (childActions.size === 1) return Array.from(childActions)[0]
  if (isBulkAuditEntry(entry) || hasAuditItemSummary(entry) || childItems.length > 0) return 'B'
  return normalizeAuditActionType(entry.ActionType) || 'B'
}

function getEmbeddedAuditItems(entry: AuditLogEntry): AuditItemEntry[] {
  const rawItems = (entry as any)._Items?.value || (entry as any)._Items
  return Array.isArray(rawItems) ? rawItems : []
}

export function findRollbackSourceEntry(
  rollbackEntry: AuditLogEntry,
  allEntries: AuditLogEntry[]
): AuditLogEntry | undefined {
  if (!isRollbackAuditAction(rollbackEntry.ActionType)) return undefined

  return allEntries.find(candidate => {
    const rollbackAuditId = String(
      (candidate as any).RollbackAuditId ?? (candidate as any).rollbackAuditId ?? ''
    ).trim()
    return rollbackAuditId === rollbackEntry.AuditId
  })
}

export function getAuditItemDisplayActionType(
  parentEntry: AuditLogEntry,
  item: AuditItemEntry,
  allEntries: AuditLogEntry[] = []
): string {
  const itemAction = normalizeAuditActionType(item.ActionType)
  const fallbackAction = itemAction || normalizeAuditActionType(parentEntry.ActionType)
  if (!isRollbackAuditAction(parentEntry.ActionType)) return fallbackAction

  // Rollback AuditItems already describe the action that was actually executed.
  // Do not replace a concrete child action with the original audit action:
  // rolling back Create executes Delete, and rolling back Delete executes Create.
  if (itemAction === 'C' || itemAction === 'U' || itemAction === 'D') return itemAction

  const sourceEntry = findRollbackSourceEntry(parentEntry, allEntries)
  if (!sourceEntry) return fallbackAction

  const sourceItems = getEmbeddedAuditItems(sourceEntry)
  const itemRecordKey = getRawRecordKey(item)
  const normalizedRecordKey = getRecordKey(item)
  const matchingSourceItem = sourceItems.find(sourceItem =>
    itemRecordKey && (
      getRawRecordKey(sourceItem) === itemRecordKey ||
      getRecordKey(sourceItem) === normalizedRecordKey
    )
  ) || sourceItems.find(sourceItem => item.ItemNo != null && sourceItem.ItemNo === item.ItemNo)
  const sourceAction = normalizeAuditActionType(matchingSourceItem?.ActionType || sourceEntry.ActionType)

  if (sourceAction === 'C') return 'D'
  if (sourceAction === 'D') return 'C'
  if (sourceAction === 'U') return 'U'

  return fallbackAction
}

export function getAuditDetailFieldSummary(
  recordFieldNames: string[],
  changeFieldNames: string[]
): { detailFields: string[]; changedFieldCount: number } {
  const uniqueFields = (fields: string[]) => {
    const seen = new Set<string>()
    return fields.reduce<string[]>((result, field) => {
      const normalizedField = String(field || '').trim()
      const comparisonKey = normalizedField.toUpperCase()
      if (!normalizedField || seen.has(comparisonKey)) return result
      seen.add(comparisonKey)
      result.push(normalizedField)
      return result
    }, [])
  }

  const normalizedRecordFields = uniqueFields(recordFieldNames)
  const recordFieldKeys = new Set(normalizedRecordFields.map(field => field.toUpperCase()))
  const normalizedChangeFields = uniqueFields(changeFieldNames)
  const changedBusinessFields = normalizedChangeFields.filter(
    field => !recordFieldKeys.has(field.toUpperCase())
  )

  return {
    detailFields: uniqueFields([...normalizedRecordFields, ...normalizedChangeFields]),
    // Record keys such as ENTITY_ID are displayed as columns, but they are not
    // business fields changed by the operation.
    changedFieldCount: changedBusinessFields.length
  }
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
