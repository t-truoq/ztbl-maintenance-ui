import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  BusyIndicator,
  Button,
  DatePicker,
  Icon,
  Input,
  Label,
  MessageStrip,
  Option,
  Select,
  Text,
  Title
} from '@ui5/webcomponents-react'
import { getAuditLog, getAuditItems, rollbackAudit } from '../services/tableConfigApi'
import { getFriendlyErrorMessage } from '../services/apiClient'
import { getAuditDisplayCells, getAuditValueParts } from '../utils/auditFormatters'
import {
  extractBulkCount,
  findBulkChildren,
  getAuditItemDisplayActionType,
  getBulkActionType,
  getRawRecordKey,
  getRecordKey,
  hasAuditItemSummary,
  isRollbackAuditAction,
  canRollbackAuditEntry,
  isBulkAuditEntry,
  normalizeAuditActionType,
  paginateAuditEntries
} from '../utils/auditLogHelpers'
import { AuditLogEntry, AuditItemEntry } from '../types'

const ACTION_LABELS: Record<string, string> = {
  C: 'Created',
  U: 'Updated',
  D: 'Deleted',
  R: 'Rollback',
  B: 'Bulk Operation',
  BULK: 'Bulk Operation'
}

const ACTION_META: Record<string, { icon: string; color: string; background: string }> = {
  C: { icon: 'add', color: '#107e3e', background: '#e4f5e9' },
  U: { icon: 'edit', color: '#0a6ed1', background: '#eaf4ff' },
  D: { icon: 'delete', color: '#bb0000', background: '#ffebeb' },
  R: { icon: 'history', color: '#8e24aa', background: '#f3e5f5' },
  B: { icon: 'group-2', color: '#6f42c1', background: '#f3e8ff' },
  BULK: { icon: 'group-2', color: '#6f42c1', background: '#f3e8ff' }
}

interface AuditLogPanelProps {
  tableName: string
  canRollback?: boolean
}

type ActionFilter = 'ALL' | 'C' | 'U' | 'D' | 'R' | 'B'
const PAGE_SIZE_OPTIONS = [10, 25, 50]

function formatDateTime(value?: string): string {
  if (!value) return '-'
  const raw = String(value)
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return raw.substring(0, 19)
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function dateInputValue(value?: string): string {
  if (!value) return ''
  const raw = String(value)
  const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function splitAuditParts(value: string): Array<{ key: string; value: string }> {
  return getAuditValueParts(value)
}

function partsToMap(parts: Array<{ key: string; value: string }>): Map<string, string> {
  return new Map(parts.filter(part => part.key).map(part => [part.key, part.value]))
}

function normalizeDash(value?: string): string {
  const text = String(value || '').trim()
  if (!text || text === '-' || text === String.fromCharCode(8212)) return ''
  return text
}

function changedParts(oldValue: string, newValue: string, fieldName = ''): Array<{ key: string; oldValue: string; newValue: string }> {
  const oldParts = splitAuditParts(oldValue)
  const newParts = splitAuditParts(newValue)
  const oldMap = partsToMap(oldParts)
  const newMap = partsToMap(newParts)
  const keys = Array.from(new Set([...oldMap.keys(), ...newMap.keys()]))

  if (keys.length === 0) {
    const oldScalar = oldParts.find(part => !part.key)?.value || oldValue || ''
    const newScalar = newParts.find(part => !part.key)?.value || newValue || ''
    const key = normalizeDash(fieldName) || 'Value'
    return oldScalar !== newScalar
      ? [{ key, oldValue: oldScalar, newValue: newScalar }]
      : []
  }

  return keys
    .map(key => ({
      key,
      oldValue: oldMap.get(key) || '',
      newValue: newMap.get(key) || ''
    }))
    .filter(part => part.oldValue !== part.newValue)
}

function includesText(value: unknown, query: string): boolean {
  return String(value ?? '').toLowerCase().includes(query)
}

function actionLabel(actionType: string): string {
  const normalizedAction = normalizeAuditActionType(actionType)
  return ACTION_LABELS[normalizedAction] || normalizedAction || 'Unknown'
}

function auditFilterActionType(entry: AuditLogEntry, cachedChildItems?: AuditItemEntry[]): string {
  if (isRollbackAuditAction(entry.ActionType)) return 'R'
  if (isBulkAuditEntry(entry) || hasAuditItemSummary(entry)) {
    const count = cachedChildItems?.length ?? extractAuditItemCount(entry)
    if (count === 1 && cachedChildItems?.[0]) {
      return normalizeAuditActionType(cachedChildItems[0].ActionType || entry.ActionType)
    }
    return count === 1 ? normalizeAuditActionType(entry.ActionType) : 'B'
  }
  return normalizeAuditActionType(entry.ActionType)
}

function formatItemCount(count: number): string {
  return `${count} item(s)`
}

function extractAuditItemCount(entry: AuditLogEntry | AuditItemEntry): number | null {
  const rawItems = (entry as any)._Items?.value || (entry as any)._Items
  if (Array.isArray(rawItems)) return rawItems.length

  const raw = String((entry as any).NewValue || (entry as any).OldValue || '')
  const match = raw.match(/(\d+)\s*item/i) || raw.match(/Bulk audit:\s*(\d+)/i)
  return match ? parseInt(match[1], 10) : null
}

function ActionBadge({ actionType, label }: { actionType: string; label?: string }) {
  const normalizedAction = normalizeAuditActionType(actionType)
  const actionLabelText = label || actionLabel(normalizedAction)
  const meta = ACTION_META[normalizedAction] || { icon: 'question-mark', color: '#556b82', background: '#eef2f5' }

  return (
    <div
      className="audit-action-badge"
      style={{
        color: meta.color,
        background: meta.background,
        borderColor: meta.color
      }}
    >
      <Icon name={meta.icon} className="audit-action-icon" style={{ color: meta.color }} />
      <span>{actionLabelText}</span>
    </div>
  )
}

function ValueBlock({ title, value, emptyText }: { title: string; value: string; emptyText: string }) {
  const parts = splitAuditParts(value)

  return (
    <div className="audit-value-block">
      <div className="audit-value-header">
        <Label>{title}</Label>
      </div>
      <div className="audit-value-body">
        {parts.length === 0 ? (
          <Text className="audit-muted">{emptyText}</Text>
        ) : (
          <div className="audit-value-grid">
            {parts.map((part, index) => (
              <div
                key={`${part.key}-${index}`}
                className={part.key ? 'audit-value-row' : 'audit-value-row audit-value-row-single'}
              >
                {part.key && (
                  <Text className="audit-value-key">{part.key}</Text>
                )}
                <Text className="audit-value-text">{part.value || '-'}</Text>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function DiffBlock({ fieldName, oldValue, newValue }: { fieldName: string; oldValue: string; newValue: string }) {
  const changes = changedParts(oldValue, newValue, fieldName)

  return (
    <div className="audit-change-table">
      <div className="audit-change-header">
        <Label>Changed Fields</Label>
      </div>
      <div className="audit-change-body">
        {changes.length === 0 ? (
          <Text className="audit-muted">No changed fields detected.</Text>
        ) : (
          <div className="audit-change-grid">
            {changes.map(change => (
              <div key={change.key} className="audit-change-row">
                <Text className="audit-change-field">{change.key}</Text>
                <div className="audit-change-cell audit-old-value">
                  <Label>Old</Label>
                  <Text>{change.oldValue || '-'}</Text>
                </div>
                <div className="audit-change-cell audit-new-value">
                  <Label>New</Label>
                  <Text>{change.newValue || '-'}</Text>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function BulkAuditItemsDialog({
  auditEntry,
  allEntries,
  initialChildItems,
  onItemsLoaded,
  onClose
}: {
  auditEntry: AuditLogEntry | null
  allEntries: AuditLogEntry[]
  initialChildItems?: AuditItemEntry[]
  onItemsLoaded?: (auditId: string, items: AuditItemEntry[]) => void
  onClose: () => void
}) {
  const hasInitialChildItems = initialChildItems !== undefined
  const [items, setItems] = useState<AuditItemEntry[]>(initialChildItems || [])
  const [loading, setLoading] = useState(!hasInitialChildItems)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auditEntry) return
    let isCancelled = false

    // An empty cached item list is still a valid loaded state.
    if (initialChildItems !== undefined) {
      setItems(initialChildItems)
      setLoading(false)
      return
    }

    // First try matching from loaded dataset
    const matched = findBulkChildren(auditEntry, allEntries)
    if (matched.length > 0) {
      setItems(matched)
      setLoading(false)
      onItemsLoaded?.(auditEntry.AuditId, matched)
      return
    }

    // Fallback to calling remote API
    setLoading(true)
    setError('')
    getAuditItems(auditEntry.AuditId)
      .then(res => {
        if (!isCancelled) {
          const fetchedItems = res && res.length > 0 ? res : []
          setItems(fetchedItems)
          onItemsLoaded?.(auditEntry.AuditId, fetchedItems)
        }
      })
      .catch(err => {
        if (!isCancelled) setError(getFriendlyErrorMessage(err))
      })
      .finally(() => {
        if (!isCancelled) setLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [auditEntry, allEntries, initialChildItems, onItemsLoaded])

  if (!auditEntry) return null

  const summaryText = items.length > 0 ? formatItemCount(items.length) : extractBulkCount(auditEntry)
  const isRollbackSummary = isRollbackAuditAction(auditEntry.ActionType)
  const dialogTitle = isRollbackSummary ? 'Rollback Audit Items' : 'Bulk Audit Items'
  const summaryLabel = isRollbackSummary ? 'Rollback Summary' : 'Bulk Operation Summary'
  const displayActionType = isRollbackSummary ? 'R' : getBulkActionType(auditEntry, items)

  return (
    <AuditModernModal
      open
      title={`${dialogTitle} - ${summaryText}`}
      onClose={onClose}
      width="min(92vw, 900px)"
      footer={
        <Button design="Emphasized" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div style={{ padding: '0.5rem 0' }}>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1.5rem',
            padding: '0.75rem 1rem',
            background: '#f4f6f8',
            borderRadius: '6px',
            marginBottom: '1rem',
            alignItems: 'center'
          }}
        >
          <div>
            <Label style={{ display: 'block', fontSize: '0.75rem' }}>Audit ID</Label>
            <Text style={{ fontWeight: 600 }}>{auditEntry.AuditId}</Text>
          </div>
          <div>
            <Label style={{ display: 'block', fontSize: '0.75rem' }}>Changed By</Label>
            <Text>{auditEntry.ChangedBy || '-'}</Text>
          </div>
          <div>
            <Label style={{ display: 'block', fontSize: '0.75rem' }}>Changed At</Label>
            <Text>{formatDateTime(auditEntry.ChangedAt)}</Text>
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <ActionBadge actionType={displayActionType} />
          </div>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <BusyIndicator active size="M" />
            <Text style={{ display: 'block', marginTop: '0.5rem' }}>Loading audit items...</Text>
          </div>
        )}

        {error && (
          <MessageStrip design="Negative" hideCloseButton>
            {error}
          </MessageStrip>
        )}

        {!loading && !error && items.length === 0 && (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <MessageStrip design="Information" hideCloseButton>
              {summaryLabel}: {summaryText} executed by {auditEntry.ChangedBy || 'User'} at {formatDateTime(auditEntry.ChangedAt)}.
            </MessageStrip>
            {(auditEntry.NewValue || auditEntry.OldValue) && (
              <ValueBlock title="Summary Details" value={auditEntry.NewValue || auditEntry.OldValue || ''} emptyText="No summary details" />
            )}
          </div>
        )}

        {!loading && !error && items.length > 0 && (() => {
          const excel = getBulkExcelRows(items, auditEntry, isRollbackSummary)
          return (
            <div className="audit-bulk-excel-wrap">
              <div className="audit-bulk-excel" role="table" aria-label="Bulk audit spreadsheet">
                <div
                  className="audit-bulk-excel-row audit-bulk-excel-row--header"
                  role="row"
                  style={{ gridTemplateColumns: `4rem 8rem 15rem repeat(${Math.max(excel.columns.length, 1)}, minmax(10rem, 1fr))` }}
                >
                  <div role="columnheader">Item</div>
                  <div role="columnheader">Action</div>
                  <div role="columnheader">Record</div>
                  {excel.columns.map(column => <div role="columnheader" key={column}>{column}</div>)}
                </div>
                {excel.rows.map((row, index) => (
                  <div
                    className="audit-bulk-excel-row"
                    role="row"
                    key={`${row.item.ItemNo ?? index}-${index}`}
                    style={{ gridTemplateColumns: `4rem 8rem 15rem repeat(${Math.max(excel.columns.length, 1)}, minmax(10rem, 1fr))` }}
                  >
                    <div role="cell" data-label="Item">#{row.item.ItemNo ?? index + 1}</div>
                    <div role="cell" data-label="Action"><ActionBadge actionType={row.action} /></div>
                    <div role="cell" data-label="Record" title={getRecordKey(row.item)}>{getCompactAuditRecordKey(row.item)}</div>
                    {excel.columns.map(column => (
                      <div role="cell" data-label={column} className={row.values[column]?.includes(' → ') ? 'audit-excel-change-cell' : ''} key={column}>
                        {row.values[column] || '-'}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
      </div>
    </AuditModernModal>
  )
}

function AuditParsedCell({
  value,
  compareValue,
  side
}: {
  value: string
  compareValue: string
  side: 'old' | 'new'
}) {
  const parts = splitAuditParts(value)
  const compareParts = partsToMap(splitAuditParts(compareValue))
  const filteredParts = parts.filter(part => {
    const otherValue = compareParts.get(part.key) || ''
    return part.value !== otherValue
  })

  const hasComparison = String(compareValue || '').trim() !== ''
  const visibleParts = hasComparison ? filteredParts : parts
  if (visibleParts.length === 0) return <Text>-</Text>

  return (
    <div className="audit-parsed-cell">
      {visibleParts.map((part, index) => (
        <div className="audit-parsed-cell-row" key={`${part.key}-${index}`}>
          {part.key && <span className="audit-parsed-cell-key">{part.key}</span>}
          <span className={`audit-parsed-cell-value audit-parsed-cell-value--${side}`}>{part.value || '-'}</span>
        </div>
      ))}
    </div>
  )
}

function getAuditChangeRows(
  display: { fieldName: string; oldValue: string; newValue: string },
  actionType: string
): Array<{ field: string; oldValue: string; newValue: string }> {
  const action = normalizeAuditActionType(actionType)
  const oldParts = splitAuditParts(display.oldValue)
  const newParts = splitAuditParts(display.newValue)
  const oldMap = partsToMap(oldParts)
  const newMap = partsToMap(newParts)
  const keys = Array.from(new Set([...oldParts, ...newParts].map(part => part.key)))

  if (keys.length === 1 && !keys[0]) {
    const oldValue = oldParts[0]?.value || ''
    const newValue = newParts[0]?.value || ''
    if (action === 'C') return [{ field: normalizeDash(display.fieldName) || 'Value', oldValue: '', newValue }]
    if (action === 'D') return [{ field: normalizeDash(display.fieldName) || 'Value', oldValue, newValue: '' }]
    return oldValue !== newValue
      ? [{ field: normalizeDash(display.fieldName) || 'Value', oldValue, newValue }]
      : []
  }

  return keys
    .filter(key => oldMap.get(key) !== newMap.get(key))
    .map(key => ({
      field: key || normalizeDash(display.fieldName) || 'Value',
      oldValue: action === 'C' ? '' : oldMap.get(key) || '',
      newValue: action === 'D' ? '' : newMap.get(key) || ''
    }))
}

function getCompactAuditRecordKey(entry: AuditLogEntry | AuditItemEntry): string {
  const fullKey = getRecordKey(entry)
  if (fullKey.length <= 28) return fullKey

  const rawKey = getRawRecordKey(entry)
  try {
    const parsed = JSON.parse(rawKey)
    const firstEntry = Object.entries(parsed || {})[0]
    if (firstEntry) return `${firstEntry[0]}: ${String(firstEntry[1])}`
  } catch {
    // Keep the raw display key when it is not JSON.
  }
  return `${fullKey.slice(0, 25)}…`
}

function getAuditRecordParts(entry: AuditLogEntry | AuditItemEntry): Array<{ key: string; value: string }> {
  const rawKey = getRawRecordKey(entry)
  const parts = splitAuditParts(rawKey).filter(part => part.key && part.value)
  if (parts.length > 0) return parts

  const displayKey = getRecordKey(entry)
  return displayKey && displayKey !== '-'
    ? [{ key: 'Record', value: displayKey }]
    : []
}

function getAuditOverview(
  entry: AuditLogEntry,
  allEntries: AuditLogEntry[],
  cachedItems?: AuditItemEntry[]
) {
  const hasSummary = hasAuditItemSummary(entry)
  const childItems = hasSummary
    ? cachedItems ?? findBulkChildren(entry, allEntries)
    : []
  const singleItem = childItems.length === 1 ? childItems[0] : null
  const source = singleItem || entry
  const action = singleItem
    ? getAuditItemDisplayActionType(entry, singleItem)
    : hasSummary
    ? getBulkActionType(entry, childItems)
    : normalizeAuditActionType(entry.ActionType)

  if (hasSummary && !singleItem) {
    const itemText = childItems.length > 0 ? formatItemCount(childItems.length) : extractBulkCount(entry)
    const changedFieldCount = childItems.reduce((total, item) => {
      const itemAction = getAuditItemDisplayActionType(entry, item)
      return total + getAuditChangeRows(getAuditDisplayCells(item, itemAction), itemAction).length
    }, 0)
    return {
      source,
      action,
      summary: changedFieldCount > 0
        ? `${itemText} · ${changedFieldCount} changed field(s)`
        : itemText
    }
  }

  const changes = getAuditChangeRows(getAuditDisplayCells(source, action), action)
  const fields = changes.map(change => change.field).filter(Boolean)
  const fieldPreview = fields.slice(0, 2).join(', ')
  const remaining = Math.max(0, fields.length - 2)
  return {
    source,
    action,
    summary: changes.length === 0
      ? 'No field changes detected'
      : `${changes.length} changed field(s)${fieldPreview ? ` · ${fieldPreview}` : ''}${remaining > 0 ? ` +${remaining}` : ''}`
  }
}

function getBulkExcelRows(items: AuditItemEntry[], auditEntry: AuditLogEntry, isRollbackSummary: boolean) {
  const rows = items.map(item => {
    const fallbackAction = getAuditItemDisplayActionType(auditEntry, item)
    const action = isRollbackSummary
      ? normalizeAuditActionType(item.ActionType || fallbackAction)
      : fallbackAction
    const display = getAuditDisplayCells(item, action)
    const oldMap = partsToMap(splitAuditParts(display.oldValue))
    const newMap = partsToMap(splitAuditParts(display.newValue))
    const keys = Array.from(new Set([...oldMap.keys(), ...newMap.keys()].filter(Boolean)))
    const values: Record<string, string> = {}

    if (keys.length === 0) {
      const field = normalizeDash(display.fieldName) || 'Value'
      const oldValue = splitAuditParts(display.oldValue)[0]?.value || display.oldValue || ''
      const newValue = splitAuditParts(display.newValue)[0]?.value || display.newValue || ''
      values[field] = action === 'C' ? newValue : action === 'D' ? oldValue : `${oldValue || '-'} → ${newValue || '-'}`
    } else {
      keys.forEach(key => {
        const oldValue = oldMap.get(key) || ''
        const newValue = newMap.get(key) || ''
        values[key] = action === 'C' ? newValue : action === 'D' ? oldValue : `${oldValue || '-'} → ${newValue || '-'}`
      })
    }

    return { item, action, values }
  })

  return { rows, columns: Array.from(new Set(rows.flatMap(row => Object.keys(row.values)))) }
}

type AuditSpreadsheetRow = {
  id: string
  parent: AuditLogEntry
  source: AuditLogEntry | AuditItemEntry
  action: string
  record: string
  values: Record<string, string>
  changedFields: Set<string>
  isSummary: boolean
  isFirstInOperation: boolean
}

function getAuditSpreadsheetValues(source: AuditLogEntry | AuditItemEntry, actionType: string) {
  const action = normalizeAuditActionType(actionType)
  const display = getAuditDisplayCells(source, action)
  const oldParts = splitAuditParts(display.oldValue)
  const newParts = splitAuditParts(display.newValue)
  const oldMap = partsToMap(oldParts)
  const newMap = partsToMap(newParts)
  const keys = Array.from(new Set([...oldMap.keys(), ...newMap.keys()].filter(Boolean)))
  const values: Record<string, string> = {}
  const changedFields = new Set<string>()

  if (keys.length === 0) {
    const field = normalizeDash(display.fieldName) || 'VALUE'
    const oldValue = oldParts[0]?.value || display.oldValue || ''
    const newValue = newParts[0]?.value || display.newValue || ''
    values[field] = action === 'D' ? oldValue : newValue || oldValue
    if (action === 'C' || action === 'D' || oldValue !== newValue) changedFields.add(field)
    return { values, changedFields }
  }

  keys.forEach(field => {
    const oldValue = oldMap.get(field) || ''
    const newValue = newMap.get(field) || ''
    values[field] = action === 'D' ? oldValue : newValue || oldValue
    if (action === 'C' || action === 'D' || oldValue !== newValue) changedFields.add(field)
  })

  return { values, changedFields }
}

function getAuditSpreadsheetRows(
  pageEntries: AuditLogEntry[],
  allEntries: AuditLogEntry[],
  childMap: Record<string, AuditItemEntry[]>
): AuditSpreadsheetRow[] {
  return pageEntries.flatMap(entry => {
    const hasSummary = hasAuditItemSummary(entry)
    const cachedItems = childMap[entry.AuditId]
    const childItems = hasSummary
      ? cachedItems ?? findBulkChildren(entry, allEntries)
      : []

    if (childItems.length > 0) {
      return childItems.map((item, index) => {
        const action = getAuditItemDisplayActionType(entry, item)
        const { values, changedFields } = getAuditSpreadsheetValues(item, action)
        return {
          id: `${entry.AuditId}-${item.ItemNo ?? index}`,
          parent: entry,
          source: item,
          action,
          record: getRecordKey(item),
          values,
          changedFields,
          isSummary: false,
          isFirstInOperation: index === 0
        }
      })
    }

    const action = hasSummary
      ? getBulkActionType(entry, childItems)
      : normalizeAuditActionType(entry.ActionType)
    const { values, changedFields } = getAuditSpreadsheetValues(entry, action)

    if (hasSummary && Object.keys(values).length === 0) {
      values.SUMMARY = extractBulkCount(entry)
    }

    return [{
      id: entry.AuditId,
      parent: entry,
      source: entry,
      action,
      record: hasSummary ? 'BULK' : getRecordKey(entry),
      values,
      changedFields,
      isSummary: hasSummary,
      isFirstInOperation: true
    }]
  })
}

function AuditHoverPreview({
  display,
  actionType,
  itemCount,
  changesOverride
}: {
  display: { fieldName: string; oldValue: string; newValue: string }
  actionType: string
  itemCount?: number
  changesOverride?: Array<{ field: string; oldValue: string; newValue: string }>
}) {
  const changes = changesOverride || getAuditChangeRows(display, actionType)

  return (
    <div className="audit-hover-preview" role="tooltip">
      <div className="audit-hover-preview-title">
        <span>Changed fields</span>
        <span>{changes.length} field(s){itemCount !== undefined ? ` · ${itemCount} item(s)` : ''}</span>
      </div>
      {changes.length === 0 ? (
        <div className="audit-hover-preview-empty">No changed fields detected.</div>
      ) : (
        <div className="audit-hover-preview-table">
          {changes.map((change, index) => (
            <div className="audit-hover-preview-row" key={`${change.field}-${index}`}>
              <div className="audit-hover-preview-field">{change.field}</div>
              <div className="audit-hover-preview-old">{change.oldValue || '-'}</div>
              <div className="audit-hover-preview-arrow">→</div>
              <div className="audit-hover-preview-new">{change.newValue || '-'}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function AuditModernModal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 'min(94vw, 900px)',
  closeOnBackdrop = true
}: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  width?: string
  closeOnBackdrop?: boolean
}) {
  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) return null

  const modal = (
    <div
      role="presentation"
      onMouseDown={event => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose()
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'rgba(15, 23, 42, 0.72)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        isolation: 'isolate',
        boxSizing: 'border-box'
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={event => event.stopPropagation()}
        style={{
          width,
          maxHeight: 'calc(100vh - 48px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: '8px',
          border: '1px solid var(--sapGroup_BorderColor, #d9d9d9)',
          background: 'var(--sapGroup_ContentBackground, #fff)',
          boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)'
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '14px 18px',
            borderBottom: '1px solid var(--sapGroup_BorderColor, #d9d9d9)',
            background: 'var(--sapShellColor, #fff)',
            flex: '0 0 auto'
          }}
        >
          <Title level="H5" style={{ flex: 1, minWidth: 0 }}>
            {title}
          </Title>
          <Button
            design="Transparent"
            icon={'decline' as any}
            accessibleName="Close dialog"
            onClick={onClose}
          />
        </header>

        <div
          className="audit-modern-modal-body"
          style={{
            padding: '16px 18px',
            overflowY: 'auto',
            overflowX: 'hidden',
            flex: 1,
            minHeight: 0,
            boxSizing: 'border-box'
          }}
        >
          {children}
        </div>

        {footer && (
          <footer
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 18px',
              borderTop: '1px solid var(--sapGroup_BorderColor, #d9d9d9)',
              background: 'var(--sapShellColor, #fff)',
              flex: '0 0 auto'
            }}
          >
            {footer}
          </footer>
        )}
      </section>
    </div>
  )

  return createPortal(modal, document.body)
}

function AuditEntryItem({
  entry,
  allEntries,
  cachedChildItems,
  onViewDetails,
  onRollback,
  canRollback
}: {
  entry: AuditLogEntry
  allEntries: AuditLogEntry[]
  cachedChildItems?: AuditItemEntry[]
  onViewDetails: (entry: AuditLogEntry) => void
  onRollback: (entry: AuditLogEntry) => void
  canRollback: boolean
}) {
  const [isHovered, setIsHovered] = useState(false)
  const [previewPlacement, setPreviewPlacement] = useState<'above' | 'below'>('below')
  const normalizedEntryAction = normalizeAuditActionType(entry.ActionType)
  const hasItemSummary = hasAuditItemSummary(entry)

  const childItems = useMemo(() => {
    if (!hasItemSummary) return []
    if (cachedChildItems && cachedChildItems.length > 0) return cachedChildItems
    return findBulkChildren(entry, allEntries)
  }, [hasItemSummary, cachedChildItems, entry, allEntries])

  const isRollbackType = isRollbackAuditAction(normalizedEntryAction)
  const singleSummaryItem = hasItemSummary && !isRollbackType && childItems.length === 1
    ? childItems[0]
    : null
  const singleSummaryActionType = singleSummaryItem
    ? normalizeAuditActionType(singleSummaryItem.ActionType || entry.ActionType)
    : ''
  const displaySource = singleSummaryItem || entry
  const displayActionType = singleSummaryItem
    ? singleSummaryActionType
    : hasItemSummary
    ? getBulkActionType(entry, childItems)
    : normalizedEntryAction
  const { fieldName } = getAuditDisplayCells(displaySource, displayActionType)
  const normalizedField = normalizeDash(fieldName)
  const showSummaryPanel = hasItemSummary && !singleSummaryItem
  const canRollbackEntry = canRollback && canRollbackAuditEntry(entry) && !isRollbackAuditAction(normalizedEntryAction) && !isRollbackAuditAction(displayActionType)
  const summaryLabel = isRollbackType ? 'Rollback Summary' : 'Bulk Operation Summary'
  const previewDisplay = getAuditDisplayCells(displaySource, displayActionType)
  const previewChanges = showSummaryPanel
    ? childItems.flatMap(item => {
      const itemAction = getAuditItemDisplayActionType(entry, item)
      const record = getCompactAuditRecordKey(item)
      return getAuditChangeRows(getAuditDisplayCells(item, itemAction), itemAction).map(change => ({
        ...change,
        field: `#${item.ItemNo ?? '-'} · ${record} · ${change.field}`
      }))
    })
    : undefined

  return (
    <div
      className={`audit-row-hover-target audit-row-hover-target--${previewPlacement}`}
      role={hasItemSummary ? 'button' : undefined}
      tabIndex={hasItemSummary ? 0 : undefined}
      title={hasItemSummary ? 'Click to view all changed fields' : undefined}
      onClick={() => hasItemSummary && onViewDetails(entry)}
      onKeyDown={event => {
        if (hasItemSummary && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onViewDetails(entry)
        }
      }}
      onMouseEnter={event => {
        const bounds = event.currentTarget.getBoundingClientRect()
        setPreviewPlacement(bounds.bottom > window.innerHeight - 360 ? 'above' : 'below')
        setIsHovered(true)
      }}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="audit-table-row" role="row">
        <div className="audit-table-cell audit-table-cell--action" role="cell" data-label="Action">
          <ActionBadge actionType={displayActionType} />
        </div>
        <div className="audit-table-cell" role="cell" data-label="Changed by">{entry.ChangedBy || '-'}</div>
        <div className="audit-table-cell audit-table-cell--date" role="cell" data-label="Changed at">{formatDateTime(entry.ChangedAt)}</div>
        <div className="audit-table-cell audit-table-cell--key" role="cell" data-label="Record">{getRecordKey(displaySource)}</div>
        <div className="audit-table-cell" role="cell" data-label="Field">{showSummaryPanel ? summaryLabel : normalizedField || '-'}</div>
        <div className="audit-table-cell audit-table-cell--actions" role="cell" data-label="Actions">
          <span className="audit-hover-hint">{hasItemSummary ? 'Hover to preview · Click for details' : 'Hover to preview'}</span>
          {canRollbackEntry && (
            <Button
              design="Attention"
              icon={'undo' as any}
              onClick={event => {
                event.stopPropagation()
                onRollback(entry)
              }}
            >
              Rollback
            </Button>
          )}
        </div>
      </div>
      {isHovered && (
        <AuditHoverPreview
          display={previewDisplay}
          actionType={displayActionType}
          itemCount={showSummaryPanel ? childItems.length : undefined}
          changesOverride={previewChanges}
        />
      )}
    </div>
  )
}

function AuditDetailsDialog({
  entry,
  item,
  allEntries,
  cachedChildItems,
  onClose
}: {
  entry: AuditLogEntry | null
  item?: AuditItemEntry | null
  allEntries: AuditLogEntry[]
  cachedChildItems?: AuditItemEntry[]
  onClose: () => void
}) {
  if (!entry) return null

  const normalizedAction = normalizeAuditActionType(entry.ActionType)
  const hasItemSummary = !item && hasAuditItemSummary(entry)
  const childItems = hasItemSummary
    ? cachedChildItems?.length ? cachedChildItems : findBulkChildren(entry, allEntries)
    : []
  const isRollbackType = isRollbackAuditAction(normalizedAction)
  const singleItem = hasItemSummary && !isRollbackType && childItems.length === 1 ? childItems[0] : null
  const displaySource = item || singleItem || entry
  const displayActionType = item
    ? getAuditItemDisplayActionType(entry, item)
    : singleItem
    ? normalizeAuditActionType(singleItem.ActionType || entry.ActionType)
    : hasItemSummary ? getBulkActionType(entry, childItems) : normalizedAction
  const display = getAuditDisplayCells(displaySource, displayActionType)
  const changes = getAuditChangeRows(display, displayActionType)

  return (
    <AuditModernModal
      open
      title={`${actionLabel(displayActionType)} audit details`}
      onClose={onClose}
      width="min(94vw, 980px)"
      footer={<Button design="Emphasized" onClick={onClose}>Close</Button>}
    >
      <div className="audit-details-meta">
        <div className="audit-details-meta-item audit-details-meta-item--id">
          <Label>Audit ID</Label>
          <Text title={entry.AuditId}>{entry.AuditId}</Text>
        </div>
        <div className="audit-details-meta-item">
          <Label>Changed by</Label>
          <Text>{entry.ChangedBy || '-'}</Text>
        </div>
        <div className="audit-details-meta-item">
          <Label>Changed at</Label>
          <Text>{formatDateTime(entry.ChangedAt)}</Text>
        </div>
        <div className="audit-details-meta-action">
          <ActionBadge actionType={displayActionType} />
        </div>
      </div>
      <div className="audit-details-record">
        <Label>Record</Label>
        <Text title={getRecordKey(displaySource)}>{getCompactAuditRecordKey(displaySource)}</Text>
      </div>
      {hasItemSummary && !singleItem && (
        <MessageStrip design="Information" hideCloseButton className="audit-details-notice">
          This audit contains {childItems.length > 0 ? formatItemCount(childItems.length) : extractBulkCount(entry)}. Open the bulk operation row to view its changed fields.
        </MessageStrip>
      )}
      {!hasItemSummary || singleItem ? (
        <div className="audit-detail-change-table" role="table" aria-label="Changed audit fields">
          <div className="audit-detail-change-row audit-detail-change-row--header" role="row">
            <div role="columnheader">Field</div>
            <div role="columnheader">Old value</div>
            <div role="columnheader">New value</div>
          </div>
          {changes.length > 0 ? changes.map((change, index) => (
            <div className="audit-detail-change-row" role="row" key={`${change.field}-${index}`}>
              <div role="cell" data-label="Field" className="audit-detail-change-field">{change.field}</div>
              <div role="cell" data-label="Old value" className="audit-old-value">{change.oldValue || '-'}</div>
              <div role="cell" data-label="New value" className="audit-new-value">{change.newValue || '-'}</div>
            </div>
          )) : (
            <div className="audit-detail-empty">No changed fields detected.</div>
          )}
        </div>
      ) : null}
    </AuditModernModal>
  )
}

export default function AuditLogPanel({ tableName, canRollback = false }: AuditLogPanelProps) {
  const resultMessageRef = useRef<HTMLDivElement | null>(null)
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  const [selectedBulkEntry, setSelectedBulkEntry] = useState<AuditLogEntry | null>(null)
  const [selectedDetail, setSelectedDetail] = useState<{
    entry: AuditLogEntry
    item?: AuditItemEntry
  } | null>(null)
  const [rollbackConfirmEntry, setRollbackConfirmEntry] = useState<AuditLogEntry | null>(null)
  const [rollbackLoading, setRollbackLoading] = useState(false)
  const [rollbackResultMsg, setRollbackResultMsg] = useState<{
    type: 'success' | 'error'
    message: string
    auditId?: string
  } | null>(null)

  const [bulkChildMap, setBulkChildMap] = useState<Record<string, AuditItemEntry[]>>({})
  const auditItemsInFlightRef = useRef<Set<string>>(new Set())
  const auditPanelMountedRef = useRef(true)

  useEffect(() => {
    return () => {
      auditPanelMountedRef.current = false
    }
  }, [])

  useEffect(() => {
    setBulkChildMap({})
    auditItemsInFlightRef.current.clear()
    if (tableName) loadAuditLog()
  }, [tableName])

  useEffect(() => {
    setPageIndex(0)
  }, [tableName, searchQuery, actionFilter, dateFrom, dateTo, pageSize])

  useEffect(() => {
    if (!rollbackResultMsg) return
    window.requestAnimationFrame(() => {
      resultMessageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    })
  }, [rollbackResultMsg])

  async function loadAuditLog() {
    try {
      setLoading(true)
      setError('')
      setBulkChildMap({})
      auditItemsInFlightRef.current.clear()
      const result = await getAuditLog(tableName)
      setEntries(result)

      const initialMap: Record<string, AuditItemEntry[]> = {}
      result.forEach(entry => {
        const items = (entry as any)._Items?.value || (entry as any)._Items
        if (Array.isArray(items) && items.length > 0) {
          initialMap[entry.AuditId] = items
        }
      })
      if (Object.keys(initialMap).length > 0) {
        setBulkChildMap(initialMap)
      }
    } catch (e: any) {
      setError(getFriendlyErrorMessage(e))
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  const handleChildItemsLoaded = useCallback((auditId: string, items: AuditItemEntry[]) => {
    setBulkChildMap(prev => {
      if (Object.prototype.hasOwnProperty.call(prev, auditId)) return prev
      return { ...prev, [auditId]: items }
    })
  }, [])

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return entries.filter(entry => {
      const filterActionType = auditFilterActionType(entry, bulkChildMap[entry.AuditId])
      if (actionFilter !== 'ALL' && filterActionType !== actionFilter) return false

      const entryDate = dateInputValue(entry.ChangedAt)
      if (dateFrom && entryDate && entryDate < dateFrom) return false
      if (dateTo && entryDate && entryDate > dateTo) return false

      if (!query) return true

      const display = getAuditDisplayCells(entry)
      const recordKey = getRecordKey(entry)
      const rawRecordKey = getRawRecordKey(entry)
      const bulkCount = extractBulkCount(entry)
      return (
        includesText(entry.ChangedBy, query) ||
        includesText(entry.FieldName, query) ||
        includesText(display.fieldName, query) ||
        includesText(display.oldValue, query) ||
        includesText(display.newValue, query) ||
        includesText(recordKey, query) ||
        includesText(rawRecordKey, query) ||
        includesText(bulkCount, query) ||
        includesText(actionLabel(entry.ActionType), query)
      )
    })
  }, [entries, searchQuery, actionFilter, dateFrom, dateTo, bulkChildMap])

  const {
    pageItems: pagedEntries,
    totalPages,
    safePageIndex,
    start: pageStart,
    end: pageEnd
  } = useMemo(
    () => paginateAuditEntries(filteredEntries, pageIndex, pageSize),
    [filteredEntries, pageIndex, pageSize]
  )

  const overviewRows = useMemo(
    () => pagedEntries.map(entry => ({
      entry,
      ...getAuditOverview(entry, entries, bulkChildMap[entry.AuditId])
    })),
    [pagedEntries, entries, bulkChildMap]
  )

  useEffect(() => {
    if (safePageIndex !== pageIndex) {
      setPageIndex(safePageIndex)
    }
  }, [safePageIndex, pageIndex])

  // Pre-fetch audit items for visible summary entries so item counts are ready.
  useEffect(() => {
    const seenAuditIds = new Set<string>()
    const summaryEntries = pagedEntries.filter(entry => {
      if (!hasAuditItemSummary(entry) || !entry.AuditId) return false
      if (seenAuditIds.has(entry.AuditId)) return false
      if (Object.prototype.hasOwnProperty.call(bulkChildMap, entry.AuditId)) return false
      if (auditItemsInFlightRef.current.has(entry.AuditId)) return false
      seenAuditIds.add(entry.AuditId)
      return true
    })
    if (summaryEntries.length === 0) return undefined

    summaryEntries.forEach(entry => auditItemsInFlightRef.current.add(entry.AuditId))

    Promise.all(
      summaryEntries.map(async entry => {
        const matched = findBulkChildren(entry, entries)
        if (matched.length > 0) return { auditId: entry.AuditId, items: matched }

        try {
          const items = await getAuditItems(entry.AuditId)
          return { auditId: entry.AuditId, items }
        } catch {
          return { auditId: entry.AuditId, items: [] }
        }
      })
    ).then(results => {
      if (!auditPanelMountedRef.current) return

      setBulkChildMap(prev => {
        let changed = false
        const next = { ...prev }

        results.forEach(res => {
          if (!Object.prototype.hasOwnProperty.call(next, res.auditId)) {
            next[res.auditId] = res.items
            changed = true
          }
        })

        return changed ? next : prev
      })
    }).finally(() => {
      summaryEntries.forEach(entry => auditItemsInFlightRef.current.delete(entry.AuditId))
    })
  }, [entries, pagedEntries, bulkChildMap])

  async function handleConfirmRollback() {
    if (!rollbackConfirmEntry) return
    setRollbackLoading(true)
    setRollbackResultMsg(null)
    try {
      const res = await rollbackAudit(rollbackConfirmEntry.AuditId)
      if (res.success) {
        setRollbackResultMsg({ type: 'success', message: res.message || 'Rollback successful' })
        setRollbackConfirmEntry(null)
        await loadAuditLog()
      } else {
        setRollbackResultMsg({
          type: 'error',
          message: res.message || 'Rollback failed',
          auditId: rollbackConfirmEntry.AuditId
        })
        setRollbackConfirmEntry(null)
      }
    } catch (err: any) {
      const message = getFriendlyErrorMessage(err)
      setRollbackResultMsg({
        type: 'error',
        message,
        auditId: rollbackConfirmEntry.AuditId
      })
      setRollbackConfirmEntry(null)
    } finally {
      setRollbackLoading(false)
    }
  }

  return (
    <section className="tab-panel-form audit-panel">
      <div className="tab-panel-header audit-toolbar">
        <div className="tab-panel-title-block audit-title-block">
          <Title level="H4" className="tab-panel-title">Audit Trail</Title>
          <Text className="tab-panel-subtitle audit-muted">Review the audit summary here, then select View details to inspect field-level changes.</Text>
        </div>
        <div className="tab-panel-actions audit-actions">
          <Text className="audit-count">{filteredEntries.length} audit record(s)</Text>
          <Button icon={'refresh' as any} onClick={loadAuditLog} disabled={loading}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="audit-filter-bar" aria-label="Audit filters">
        <div className="audit-filter-field audit-filter-search">
          <Label>Search</Label>
          <Input
            placeholder="User, field, value, record key..."
            value={searchQuery}
            icon={<Icon name="search" />}
            onInput={(event: any) => setSearchQuery(event.target.value)}
            className="audit-search-input"
          />
        </div>
        <div className="audit-filter-field audit-filter-action">
          <Label>Action</Label>
          <Select
            value={actionFilter}
            onChange={(event: any) => setActionFilter(event.detail.selectedOption.value as ActionFilter)}
          >
            <Option value="ALL">All</Option>
            <Option value="C">Created</Option>
            <Option value="U">Updated</Option>
            <Option value="D">Deleted</Option>
            <Option value="R">Rollback</Option>
            <Option value="B">Bulk Operation</Option>
          </Select>
        </div>
        <div className="audit-filter-field audit-filter-date">
          <Label>From</Label>
          <DatePicker
            className="audit-date-picker"
            formatPattern="yyyy-MM-dd"
            value={dateFrom}
            onChange={(event: any) => setDateFrom(event.target.value)}
            aria-label="Audit date from"
          />
        </div>
        <div className="audit-filter-field audit-filter-date">
          <Label>To</Label>
          <DatePicker
            className="audit-date-picker"
            formatPattern="yyyy-MM-dd"
            value={dateTo}
            onChange={(event: any) => setDateTo(event.target.value)}
            aria-label="Audit date to"
          />
        </div>
      </div>

      {rollbackResultMsg?.type === 'success' && (
        <div ref={resultMessageRef} className="audit-result-message">
          <MessageStrip
            design="Positive"
            onClose={() => setRollbackResultMsg(null)}
            className="audit-message"
          >
            {rollbackResultMsg.message}
          </MessageStrip>
        </div>
      )}

      {loading && (
        <div className="audit-loading">
          <BusyIndicator active size="M" />
          <Text>Loading audit records...</Text>
        </div>
      )}

      {error && (
        <MessageStrip design="Negative" hideCloseButton className="audit-message">
          {error}
        </MessageStrip>
      )}

      {!loading && !error && filteredEntries.length === 0 && (
        <MessageStrip design="Information" hideCloseButton style={{ marginTop: '0.75rem' }}>
          No audit records found for this table.
        </MessageStrip>
      )}

      {!loading && !error && filteredEntries.length > 0 && (
        <section className="audit-list-wrap">
          <div className="audit-table audit-overview-table" role="table" aria-label="Audit records">
            <div className="audit-table-row audit-table-row--header" role="row">
              <div className="audit-table-cell" role="columnheader">Action</div>
              <div className="audit-table-cell" role="columnheader">Record</div>
              <div className="audit-table-cell" role="columnheader">Changed</div>
              <div className="audit-table-cell" role="columnheader">Summary</div>
              <div className="audit-table-cell" role="columnheader">Actions</div>
            </div>
            {overviewRows.map(row => {
              const { entry, source, action, summary } = row
              const canRollbackRow = canRollback &&
                canRollbackAuditEntry(entry) &&
                !isRollbackAuditAction(entry.ActionType) &&
                !isRollbackAuditAction(action)
              const rowAction = normalizeAuditActionType(action).toLowerCase()
              const recordParts = getAuditRecordParts(source)
              const isBulkSummary = hasAuditItemSummary(entry) && source === entry

              return (
                <div
                  className={`audit-table-row audit-overview-row audit-overview-row--${rowAction}`}
                  role="row"
                  key={entry.AuditId}
                >
                  <div className="audit-table-cell audit-table-cell--action" role="cell" data-label="Action">
                    <ActionBadge actionType={action} />
                  </div>
                  <div className="audit-table-cell audit-table-cell--key" role="cell" data-label="Record" title={getRecordKey(source)}>
                    <div className="audit-record-parts">
                      {recordParts.length > 0
                        ? recordParts.map(part => (
                          <div className="audit-record-part" key={part.key}>
                            <span className="audit-record-part-label">{part.key}</span>
                            <span className="audit-record-part-value">{part.value}</span>
                          </div>
                        ))
                        : <span>-</span>}
                    </div>
                  </div>
                  <div className="audit-table-cell audit-table-cell--changed" role="cell" data-label="Changed">
                    <span>{entry.ChangedBy || '-'}</span>
                    <span>{formatDateTime(entry.ChangedAt)}</span>
                  </div>
                  <div className="audit-table-cell audit-overview-summary" role="cell" data-label="Summary" title={summary}>
                    {summary}
                  </div>
                  <div className="audit-table-cell audit-table-cell--actions" role="cell" data-label="Actions">
                    <Button
                      design="Transparent"
                      icon={'inspect' as any}
                      className="audit-action-button"
                      onClick={() => {
                        if (isBulkSummary) setSelectedBulkEntry(entry)
                        else setSelectedDetail({
                          entry,
                          item: source === entry ? undefined : source as AuditItemEntry
                        })
                      }}
                    >
                      View details
                    </Button>
                    {canRollbackRow && (
                      <Button
                        design="Attention"
                        icon={'undo' as any}
                        onClick={() => setRollbackConfirmEntry(entry)}
                      >
                        Rollback
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="audit-pagination-bar">
            <Text className="audit-count">
              Showing {pageStart}-{pageEnd} of {filteredEntries.length}
            </Text>
            <div className="audit-pagination-actions">
              <Label>Rows</Label>
              <Select
                value={String(pageSize)}
                onChange={(event: any) => setPageSize(Number(event.detail.selectedOption.value))}
              >
                {PAGE_SIZE_OPTIONS.map(size => (
                  <Option key={size} value={String(size)}>{size}</Option>
                ))}
              </Select>
              <Button
                design="Transparent"
                icon={'navigation-left-arrow' as any}
                disabled={safePageIndex === 0}
                onClick={() => setPageIndex(prev => Math.max(0, prev - 1))}
              >
                Previous
              </Button>
              <Text className="audit-page-label">
                Page {safePageIndex + 1} / {totalPages}
              </Text>
              <Button
                design="Transparent"
                icon={'navigation-right-arrow' as any}
                disabled={safePageIndex >= totalPages - 1}
                onClick={() => setPageIndex(prev => Math.min(totalPages - 1, prev + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </section>
      )}

      {selectedBulkEntry && (
        <BulkAuditItemsDialog
          auditEntry={selectedBulkEntry}
          allEntries={entries}
          initialChildItems={bulkChildMap[selectedBulkEntry.AuditId]}
          onItemsLoaded={handleChildItemsLoaded}
          onClose={() => setSelectedBulkEntry(null)}
        />
      )}

      {selectedDetail && (
        <AuditDetailsDialog
          entry={selectedDetail.entry}
          item={selectedDetail.item}
          allEntries={entries}
          cachedChildItems={bulkChildMap[selectedDetail.entry.AuditId]}
          onClose={() => setSelectedDetail(null)}
        />
      )}

      {canRollback && rollbackConfirmEntry && (
        <AuditModernModal
          open
          title="Confirm Audit Rollback"
          onClose={() => {
            if (!rollbackLoading) setRollbackConfirmEntry(null)
          }}
          width="min(92vw, 520px)"
          closeOnBackdrop={!rollbackLoading}
          footer={
            <>
              <Button
                design="Transparent"
                onClick={() => setRollbackConfirmEntry(null)}
                disabled={rollbackLoading}
              >
                Cancel
              </Button>
              <Button
                design="Attention"
                icon={'undo' as any}
                onClick={handleConfirmRollback}
                disabled={rollbackLoading}
              >
                {rollbackLoading ? 'Rolling back...' : 'Confirm Rollback'}
              </Button>
            </>
          }
        >
          <div style={{ padding: '0.5rem 0' }}>
            <Text style={{ display: 'block', marginBottom: '0.5rem' }}>
              Are you sure you want to rollback this audit operation?
            </Text>
            <div style={{ background: '#fff3e0', padding: '0.75rem', borderRadius: '6px', border: '1px solid #ffe0b2' }}>
              <Text style={{ display: 'block', fontWeight: 600, color: '#e65100' }}>
                Audit ID: {rollbackConfirmEntry.AuditId}
              </Text>
              <Text style={{ display: 'block', fontSize: '0.85rem', color: '#6a7075' }}>
                Action: {actionLabel(rollbackConfirmEntry.ActionType)} | User: {rollbackConfirmEntry.ChangedBy || '-'} | Date: {formatDateTime(rollbackConfirmEntry.ChangedAt)}
              </Text>
            </div>
          </div>
        </AuditModernModal>
      )}

      {rollbackResultMsg?.type === 'error' && (
        <AuditModernModal
          open
          title="Rollback Failed"
          onClose={() => setRollbackResultMsg(null)}
          width="min(92vw, 560px)"
          footer={
            <Button design="Emphasized" onClick={() => setRollbackResultMsg(null)}>
              Close
            </Button>
          }
        >
          <div style={{ padding: '0.5rem 0' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.75rem',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid #f1aeb5',
                background: '#fff1f2'
              }}
            >
              <Icon name="error" style={{ color: '#bb0000', fontSize: '1.5rem', flex: '0 0 auto' }} />
              <div style={{ minWidth: 0 }}>
                <Text style={{ display: 'block', fontWeight: 600, color: '#8b0000', marginBottom: '0.4rem' }}>
                  The audit operation could not be rolled back.
                </Text>
                <Text style={{ display: 'block', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: '#32363a' }}>
                  {rollbackResultMsg.message}
                </Text>
              </div>
            </div>
            {rollbackResultMsg.auditId && (
              <div style={{ marginTop: '0.85rem', padding: '0.75rem 1rem', borderRadius: '6px', background: '#f4f6f8' }}>
                <Label style={{ display: 'block', fontSize: '0.75rem', marginBottom: '0.2rem' }}>Audit ID</Label>
                <Text style={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere' }}>
                  {rollbackResultMsg.auditId}
                </Text>
              </div>
            )}
          </div>
        </AuditModernModal>
      )}
    </section>
  )
}
