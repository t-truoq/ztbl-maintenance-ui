import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  isBulkAuditEntry,
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
  return date.toISOString().slice(0, 10)
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
  return ACTION_LABELS[actionType] || actionType || 'Unknown'
}

function formatItemCount(count: number): string {
  return `${count} item(s)`
}

function ActionBadge({ actionType }: { actionType: string }) {
  const actionLabelText = actionLabel(actionType)
  const meta = ACTION_META[actionType] || { icon: 'question-mark', color: '#556b82', background: '#eef2f5' }

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
  const [items, setItems] = useState<AuditItemEntry[]>(initialChildItems || [])
  const [loading, setLoading] = useState(!initialChildItems || initialChildItems.length === 0)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auditEntry) return
    let isCancelled = false

    // If initial items were provided, check if we still need remote fetch
    if (initialChildItems && initialChildItems.length > 0) {
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
  const isRollbackSummary = auditEntry.ActionType === 'R'
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
            <Text style={{ fontWeight: 700 }}>{auditEntry.AuditId}</Text>
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

        {!loading && !error && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {items.map((item, index) => {
              const display = getAuditDisplayCells(item)
              const itemAction = getAuditItemDisplayActionType(auditEntry, item)
              const isUpdate = itemAction === 'U'
              return (
                <div
                  key={item.ItemNo ?? index}
                  style={{
                    border: '1px solid var(--sapGroup_BorderColor, #d9e0e7)',
                    borderRadius: '6px',
                    padding: '0.75rem 1rem',
                    background: '#fff'
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem',
                      marginBottom: '0.6rem',
                      paddingBottom: '0.4rem',
                      borderBottom: '1px solid #edf0f2'
                    }}
                  >
                    <Label style={{ fontWeight: 700 }}>Item #{item.ItemNo ?? index + 1}</Label>
                    <ActionBadge actionType={itemAction} />
                    <div style={{ marginLeft: 'auto' }}>
                      <Text style={{ fontSize: '0.85rem', color: '#6a7075' }}>
                        Key: <strong style={{ color: '#32363a' }}>{getRecordKey(item)}</strong>
                      </Text>
                    </div>
                  </div>

                  {isUpdate ? (
                    <DiffBlock fieldName={display.fieldName} oldValue={display.oldValue} newValue={display.newValue} />
                  ) : (
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      {itemAction !== 'C' && (
                        <ValueBlock title="Old Value" value={display.oldValue} emptyText="No previous value" />
                      )}
                      {itemAction !== 'D' && (
                        <ValueBlock title="New Value" value={display.newValue} emptyText="No new value" />
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </AuditModernModal>
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
  onViewBulkItems,
  onRollback,
  canRollback
}: {
  entry: AuditLogEntry
  allEntries: AuditLogEntry[]
  cachedChildItems?: AuditItemEntry[]
  onViewBulkItems: (entry: AuditLogEntry) => void
  onRollback: (entry: AuditLogEntry) => void
  canRollback: boolean
}) {
  const { fieldName, oldValue, newValue } = getAuditDisplayCells(entry)
  const normalizedField = normalizeDash(fieldName)
  const isUpdate = entry.ActionType === 'U'
  const isBulk = isBulkAuditEntry(entry)
  const hasItemSummary = hasAuditItemSummary(entry)

  const childItems = useMemo(() => {
    if (!hasItemSummary) return []
    if (cachedChildItems && cachedChildItems.length > 0) return cachedChildItems
    return findBulkChildren(entry, allEntries)
  }, [hasItemSummary, cachedChildItems, entry, allEntries])

  const displayActionType = isBulk
    ? getBulkActionType(entry, childItems)
    : entry.ActionType

  const isRollbackType = entry.ActionType === 'R' || (entry as any).ActionType === 'ROLLBACK' || displayActionType === 'R'
  const summaryLabel = isRollbackType ? 'Rollback Summary' : 'Bulk Operation Summary'

  return (
    <article className="audit-entry">
      <div className="audit-entry-marker" aria-hidden="true" />
      <div className="audit-entry-surface">
        <div className="audit-entry-header">
          <ActionBadge actionType={displayActionType} />
          <div className="audit-entry-meta">
            <span>{entry.ChangedBy || '-'}</span>
            <span>{formatDateTime(entry.ChangedAt)}</span>
            <span className={hasItemSummary ? 'audit-record-key audit-record-key-strong' : 'audit-record-key'}>
              {getRecordKey(entry)}
            </span>
            {normalizedField && !hasItemSummary && <span>{normalizedField}</span>}
          </div>
          {canRollback && !isRollbackType && (
            <div className="audit-entry-actions">
              <Button
                design="Attention"
                icon={'undo' as any}
                onClick={() => onRollback(entry)}
              >
                Rollback
              </Button>
            </div>
          )}
        </div>

        <div className="audit-entry-content">
          {hasItemSummary ? (
            <div className="audit-bulk-summary">
              <div>
                <Label>{summaryLabel}</Label>
                <Text className="audit-bulk-count">
                  {childItems.length > 0 ? formatItemCount(childItems.length) : extractBulkCount(entry)}
                </Text>
              </div>
              <Button
                design="Transparent"
                icon={'navigation-right-arrow' as any}
                onClick={() => onViewBulkItems(entry)}
              >
                View list
              </Button>
            </div>
          ) : isUpdate ? (
            <DiffBlock fieldName={fieldName} oldValue={oldValue} newValue={newValue} />
          ) : (
            <div className="audit-value-stack">
              {entry.ActionType !== 'C' && (
                <ValueBlock title="Old Value" value={oldValue} emptyText="No previous value" />
              )}
              {entry.ActionType !== 'D' && (
                <ValueBlock title="New Value" value={newValue} emptyText="No new value" />
              )}
            </div>
          )}
        </div>
      </div>
    </article>
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
  const [rollbackConfirmEntry, setRollbackConfirmEntry] = useState<AuditLogEntry | null>(null)
  const [rollbackLoading, setRollbackLoading] = useState(false)
  const [rollbackResultMsg, setRollbackResultMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [bulkChildMap, setBulkChildMap] = useState<Record<string, AuditItemEntry[]>>({})

  useEffect(() => {
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
      const result = await getAuditLog(tableName)
      setEntries(result)
    } catch (e: any) {
      setError(getFriendlyErrorMessage(e))
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  function handleChildItemsLoaded(auditId: string, items: AuditItemEntry[]) {
    setBulkChildMap(prev => ({ ...prev, [auditId]: items }))
  }

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return entries.filter(entry => {
      if (actionFilter !== 'ALL' && entry.ActionType !== actionFilter) return false

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
  }, [entries, searchQuery, actionFilter, dateFrom, dateTo])

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

  useEffect(() => {
    if (safePageIndex !== pageIndex) {
      setPageIndex(safePageIndex)
    }
  }, [safePageIndex, pageIndex])

  // Pre-fetch audit items for visible summary entries so parent badges match child items.
  useEffect(() => {
    const summaryEntries = pagedEntries.filter(hasAuditItemSummary)
    if (summaryEntries.length === 0) return

    let isCancelled = false

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
      if (isCancelled) return
      const map: Record<string, AuditItemEntry[]> = {}
      results.forEach(res => {
        map[res.auditId] = res.items
      })
      setBulkChildMap(prev => ({ ...prev, ...map }))
    })

    return () => {
      isCancelled = true
    }
  }, [entries, pagedEntries])

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
        setRollbackResultMsg({ type: 'error', message: res.message || 'Rollback failed' })
      }
    } catch (err: any) {
      const message = getFriendlyErrorMessage(err)
      setRollbackResultMsg({
        type: 'error',
        message: `${message} Audit ID: ${rollbackConfirmEntry.AuditId}`
      })
    } finally {
      setRollbackLoading(false)
    }
  }

  return (
    <section className="tab-panel-form audit-panel">
      <div className="tab-panel-header audit-toolbar">
        <div className="tab-panel-title-block audit-title-block">
          <Title level="H4" className="tab-panel-title">Audit Trail</Title>
          <Text className="tab-panel-subtitle audit-muted">Latest changes are listed first. Updates show only the changed field values.</Text>
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

      {rollbackResultMsg && (
        <div ref={resultMessageRef} className="audit-result-message">
          <MessageStrip
            design={rollbackResultMsg.type === 'success' ? 'Positive' : 'Negative'}
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
          <div className="audit-list">
            {pagedEntries.map(entry => (
              <AuditEntryItem
                key={entry.AuditId}
                entry={entry}
                allEntries={entries}
                cachedChildItems={bulkChildMap[entry.AuditId]}
                onViewBulkItems={setSelectedBulkEntry}
                onRollback={setRollbackConfirmEntry}
                canRollback={canRollback}
              />
            ))}
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
              <Text style={{ display: 'block', fontWeight: 700, color: '#e65100' }}>
                Audit ID: {rollbackConfirmEntry.AuditId}
              </Text>
              <Text style={{ display: 'block', fontSize: '0.85rem', color: '#6a7075' }}>
                Action: {actionLabel(rollbackConfirmEntry.ActionType)} | User: {rollbackConfirmEntry.ChangedBy || '-'} | Date: {formatDateTime(rollbackConfirmEntry.ChangedAt)}
              </Text>
            </div>
          </div>
        </AuditModernModal>
      )}
    </section>
  )
}
