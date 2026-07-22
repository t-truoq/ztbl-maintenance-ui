import { useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BusyIndicator,
  Button,
  DatePicker,
  Dialog,
  Icon,
  Input,
  Label,
  MessageStrip,
  Option,
  Select,
  Text,
  Title,
  Toolbar,
  ToolbarSpacer
} from '@ui5/webcomponents-react'
import { getAuditLog, getAuditItems, rollbackAudit } from '../services/tableConfigApi'
import { getFriendlyErrorMessage } from '../services/apiClient'
import { getAuditDisplayCells, getAuditValueParts } from '../utils/auditFormatters'
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
}

type ActionFilter = 'ALL' | 'C' | 'U' | 'D' | 'R' | 'B'

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

function getRawRecordKey(entry: AuditLogEntry | AuditItemEntry): string {
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

function getRecordKey(entry: AuditLogEntry | AuditItemEntry): string {
  const rawKey = getRawRecordKey(entry)
  if (!rawKey || rawKey === '-') return '-'
  if (rawKey === 'BULK') return 'BULK'

  try {
    const parsed = JSON.parse(rawKey)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return rawKey

    const visibleParts = Object.entries(parsed)
      .filter(([key]) => !['CLIENT', 'MANDT', '__SNAPSHOT__', '__BATCH__'].includes(key.toUpperCase()))
      .map(([key, value]) => `${key}: ${String(value)}`)

    return visibleParts.length > 0 ? visibleParts.join(', ') : '-'
  } catch {
    return rawKey
  }
}

function extractBulkCount(entry: AuditLogEntry): string {
  const raw = String(entry.NewValue || entry.OldValue || '')
  const match = raw.match(/(\d+)\s*item/i) || raw.match(/Bulk audit:\s*(\d+)/i)
  if (match) {
    const count = parseInt(match[1], 10)
    return `${count} item(s)`
  }
  return 'Bulk CRUD Operation'
}

function findBulkChildren(bulkEntry: AuditLogEntry, allEntries: AuditLogEntry[]): AuditItemEntry[] {
  const rawItems = (bulkEntry as any)._Items?.value || (bulkEntry as any)._Items
  if (Array.isArray(rawItems) && rawItems.length > 0) {
    return rawItems
  }

  const bulkTime = new Date(bulkEntry.ChangedAt || '').getTime()
  const prefix20 = (bulkEntry.AuditId || '').slice(0, 20)

  const matched = allEntries.filter(e => {
    if (e.AuditId === bulkEntry.AuditId) return false
    if (e.RecordKey === 'BULK') return false
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

function getBulkActionType(entry: AuditLogEntry, childItems: AuditItemEntry[]): string {
  if (childItems && childItems.length > 0) {
    const actions = new Set(childItems.map(item => item.ActionType || entry.ActionType).filter(Boolean))
    if (actions.size === 1) {
      return Array.from(actions)[0]
    }
    return 'B'
  }
  return entry.ActionType || 'B'
}

function includesText(value: unknown, query: string): boolean {
  return String(value ?? '').toLowerCase().includes(query)
}

function actionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] || actionType || 'Unknown'
}

function ActionBadge({ actionType }: { actionType: string }) {
  const actionLabelText = actionLabel(actionType)
  const meta = ACTION_META[actionType] || { icon: 'question-mark', color: '#556b82', background: '#eef2f5' }

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        padding: '0.25rem 0.55rem',
        borderRadius: '999px',
        color: meta.color,
        background: meta.background,
        fontWeight: 700
      }}
    >
      <Icon name={meta.icon} style={{ width: '0.9rem', height: '0.9rem', color: meta.color }} />
      <span>{actionLabelText}</span>
    </div>
  )
}

function ValueBlock({ title, value, emptyText }: { title: string; value: string; emptyText: string }) {
  const parts = splitAuditParts(value)

  return (
    <div
      style={{
        minWidth: 0,
        border: '1px solid var(--sapGroup_BorderColor, #d9e0e7)',
        borderRadius: '6px',
        background: 'var(--sapList_Background, #fff)'
      }}
    >
      <div
        style={{
          padding: '0.5rem 0.75rem',
          borderBottom: '1px solid var(--sapGroup_BorderColor, #d9e0e7)',
          background: 'var(--sapList_HeaderBackground, #f7f7f7)'
        }}
      >
        <Label>{title}</Label>
      </div>
      <div style={{ padding: '0.6rem 0.75rem' }}>
        {parts.length === 0 ? (
          <Text style={{ color: '#6a7075' }}>{emptyText}</Text>
        ) : (
          <div style={{ display: 'grid', gap: '0.35rem' }}>
            {parts.map((part, index) => (
              <div
                key={`${part.key}-${index}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: part.key ? 'minmax(110px, 34%) 1fr' : '1fr',
                  gap: '0.5rem',
                  alignItems: 'start'
                }}
              >
                {part.key && (
                  <Text style={{ color: '#6a7075', fontSize: '0.82rem', wordBreak: 'break-word' }}>
                    {part.key}
                  </Text>
                )}
                <Text style={{ wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                  {part.value || '-'}
                </Text>
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
    <div
      style={{
        minWidth: 0,
        border: '1px solid var(--sapGroup_BorderColor, #d9e0e7)',
        borderRadius: '6px',
        background: 'var(--sapList_Background, #fff)'
      }}
    >
      <div
        style={{
          padding: '0.5rem 0.75rem',
          borderBottom: '1px solid var(--sapGroup_BorderColor, #d9e0e7)',
          background: 'var(--sapList_HeaderBackground, #f7f7f7)'
        }}
      >
        <Label>Changed Fields</Label>
      </div>
      <div style={{ padding: '0.6rem 0.75rem' }}>
        {changes.length === 0 ? (
          <Text style={{ color: '#6a7075' }}>No changed fields detected.</Text>
        ) : (
          <div style={{ display: 'grid', gap: '0.6rem' }}>
            {changes.map(change => (
              <div
                key={change.key}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(180px, 28%) minmax(120px, 1fr) minmax(160px, 1.25fr)',
                  gap: '0.75rem',
                  alignItems: 'start',
                  paddingBottom: '0.6rem',
                  borderBottom: '1px solid var(--sapList_BorderColor, #edf0f2)'
                }}
              >
                <Text style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{change.key}</Text>
                <div>
                  <Label>Old</Label>
                  <Text style={{ display: 'block', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {change.oldValue || '-'}
                  </Text>
                </div>
                <div
                  style={{
                    borderLeft: '3px solid #0a6ed1',
                    paddingLeft: '0.6rem',
                    background: '#f5faff'
                  }}
                >
                  <Label>New</Label>
                  <Text style={{ display: 'block', fontWeight: 700, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                    {change.newValue || '-'}
                  </Text>
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

  const bulkSummaryText = extractBulkCount(auditEntry)
  const displayActionType = getBulkActionType(auditEntry, items)

  return (
    <Dialog
      {...({
        open: true,
        headerText: `Bulk Audit Items — ${bulkSummaryText}`,
        onAfterClose: onClose,
        footer: (
          <Bar
            design="Footer"
            endContent={
              <Button design="Emphasized" onClick={onClose}>
                Close
              </Button>
            }
          />
        )
      } as any)}
      style={{ width: '90vw', maxWidth: '900px' }}
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
            <Text style={{ display: 'block', marginTop: '0.5rem' }}>Loading bulk audit items...</Text>
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
              Bulk audit summary: {bulkSummaryText} executed by {auditEntry.ChangedBy || 'User'} at {formatDateTime(auditEntry.ChangedAt)}.
            </MessageStrip>
            {auditEntry.NewValue && (
              <ValueBlock title="Summary Details" value={auditEntry.NewValue} emptyText="No summary details" />
            )}
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {items.map((item, index) => {
              const display = getAuditDisplayCells(item)
              const itemAction = item.ActionType || auditEntry.ActionType
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
    </Dialog>
  )
}

function AuditEntryItem({
  entry,
  allEntries,
  cachedChildItems,
  onViewBulkItems,
  onRollback
}: {
  entry: AuditLogEntry
  allEntries: AuditLogEntry[]
  cachedChildItems?: AuditItemEntry[]
  onViewBulkItems: (entry: AuditLogEntry) => void
  onRollback: (entry: AuditLogEntry) => void
}) {
  const { fieldName, oldValue, newValue } = getAuditDisplayCells(entry)
  const normalizedField = normalizeDash(fieldName)
  const isUpdate = entry.ActionType === 'U'
  const isBulk = entry.RecordKey === 'BULK' || getRawRecordKey(entry) === 'BULK'
  const isRollbackType = entry.ActionType === 'R'

  const childItems = useMemo(() => {
    if (!isBulk) return []
    if (cachedChildItems && cachedChildItems.length > 0) return cachedChildItems
    return findBulkChildren(entry, allEntries)
  }, [isBulk, cachedChildItems, entry, allEntries])

  const displayActionType = isBulk
    ? getBulkActionType(entry, childItems)
    : entry.ActionType

  return (
    <article
      style={{
        borderTop: '1px solid var(--sapList_BorderColor, #e5e5e5)',
        padding: '1rem 0'
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(180px, 220px) minmax(0, 1fr)',
          gap: '1rem',
          alignItems: 'start'
        }}
      >
        <div style={{ display: 'grid', gap: '0.45rem' }}>
          <div>
            <ActionBadge actionType={displayActionType} />
          </div>
          <div>
            <Label>Changed By</Label>
            <Text style={{ display: 'block', marginTop: '0.15rem' }}>
              {entry.ChangedBy || '-'}
            </Text>
          </div>
          <div>
            <Label>Changed At</Label>
            <Text style={{ display: 'block', marginTop: '0.15rem' }}>
              {formatDateTime(entry.ChangedAt)}
            </Text>
          </div>
          <div>
            <Label>Record Key</Label>
            <Text className="audit-record-key" style={{ fontWeight: isBulk ? 700 : undefined }}>
              {getRecordKey(entry)}
            </Text>
          </div>
          {normalizedField && !isBulk && (
            <div>
              <Label>Field</Label>
              <Text style={{ display: 'block', marginTop: '0.15rem', wordBreak: 'break-word' }}>
                {normalizedField}
              </Text>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
            {isBulk && (
              <Button
                design="Emphasized"
                icon={'inspect' as any}
                onClick={() => onViewBulkItems(entry)}
              >
                View items
              </Button>
            )}
            <Button
              design={isRollbackType ? 'Transparent' : 'Attention'}
              icon={'undo' as any}
              disabled={isRollbackType}
              onClick={() => onRollback(entry)}
            >
              {isRollbackType ? 'Rolled Back' : 'Rollback'}
            </Button>
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          {isBulk ? (
            <div
              style={{
                border: '1px solid var(--sapGroup_BorderColor, #d9e0e7)',
                borderRadius: '6px',
                padding: '0.75rem 1rem',
                background: 'var(--sapList_HeaderBackground, #f7f7f7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <Label style={{ fontSize: '0.85rem', color: '#6a7075' }}>Bulk Operation Summary</Label>
                <Title level="H5" style={{ margin: '0.2rem 0 0 0', color: '#0a6ed1' }}>
                  {extractBulkCount(entry)}
                </Title>
              </div>
              <Button
                design="Transparent"
                icon={'navigation-right-arrow' as any}
                onClick={() => onViewBulkItems(entry)}
              >
                View items list
              </Button>
            </div>
          ) : isUpdate ? (
            <DiffBlock fieldName={fieldName} oldValue={oldValue} newValue={newValue} />
          ) : (
            <div style={{ display: 'grid', gap: '0.75rem' }}>
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

export default function AuditLogPanel({ tableName }: AuditLogPanelProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [actionFilter, setActionFilter] = useState<ActionFilter>('ALL')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const [selectedBulkEntry, setSelectedBulkEntry] = useState<AuditLogEntry | null>(null)
  const [rollbackConfirmEntry, setRollbackConfirmEntry] = useState<AuditLogEntry | null>(null)
  const [rollbackLoading, setRollbackLoading] = useState(false)
  const [rollbackResultMsg, setRollbackResultMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null)

  const [bulkChildMap, setBulkChildMap] = useState<Record<string, AuditItemEntry[]>>({})

  useEffect(() => {
    if (tableName) loadAuditLog()
  }, [tableName])

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

  // Pre-fetch audit items for bulk entries so parent badge matches child items seamlessly
  useEffect(() => {
    const bulkEntries = entries.filter(e => e.RecordKey === 'BULK' || getRawRecordKey(e) === 'BULK')
    if (bulkEntries.length === 0) return

    let isCancelled = false

    Promise.all(
      bulkEntries.map(async entry => {
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
  }, [entries])

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
      setRollbackResultMsg({ type: 'error', message: getFriendlyErrorMessage(err) })
    } finally {
      setRollbackLoading(false)
    }
  }

  return (
    <section className="audit-panel">
      <Toolbar design="Transparent" className="audit-toolbar">
        <div className="audit-title-block">
          <Title level="H4">Audit Trail</Title>
          <Text className="audit-muted">Latest changes are listed first. Updates show only the changed field values.</Text>
        </div>
        <ToolbarSpacer />
        <Text className="audit-count">{filteredEntries.length} audit record(s)</Text>
        <Button icon={'refresh' as any} onClick={loadAuditLog} disabled={loading}>
          Refresh
        </Button>
      </Toolbar>

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
        <MessageStrip
          design={rollbackResultMsg.type === 'success' ? 'Positive' : 'Negative'}
          onClose={() => setRollbackResultMsg(null)}
          className="audit-message"
          style={{ margin: '0.5rem 0.75rem' }}
        >
          {rollbackResultMsg.message}
        </MessageStrip>
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
        <section style={{ padding: '0.75rem 0.75rem 0' }}>
          <div style={{ marginTop: '0.75rem' }}>
            {filteredEntries.map(entry => (
              <AuditEntryItem
                key={entry.AuditId}
                entry={entry}
                allEntries={entries}
                cachedChildItems={bulkChildMap[entry.AuditId]}
                onViewBulkItems={setSelectedBulkEntry}
                onRollback={setRollbackConfirmEntry}
              />
            ))}
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

      {rollbackConfirmEntry && (
        <Dialog
          {...({
            open: true,
            headerText: 'Confirm Audit Rollback',
            onAfterClose: () => !rollbackLoading && setRollbackConfirmEntry(null),
            footer: (
              <Bar
                design="Footer"
                endContent={
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
              />
            )
          } as any)}
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
        </Dialog>
      )}
    </section>
  )
}
