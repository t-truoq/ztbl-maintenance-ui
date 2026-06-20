import { useEffect, useMemo, useState } from 'react'
import {
  BusyIndicator,
  Button,
  Icon,
  Input,
  MessageStrip,
  ObjectStatus,
  Option,
  Select,
  Text,
  Title,
  Toolbar,
  ToolbarSpacer
} from '@ui5/webcomponents-react'
import { getAuditLog } from '../services/tableConfigApi'
import { getFriendlyErrorMessage } from '../services/apiClient'
import { getAuditDisplayCells } from '../utils/auditFormatters'
import { AuditLogEntry } from '../types'

const ACTION_LABELS: Record<string, string> = {
  C: 'Created',
  U: 'Updated',
  D: 'Deleted'
}

const ACTION_META: Record<string, { icon: string; state: 'Positive' | 'Information' | 'Negative' | 'None'; border: string; bg: string }> = {
  C: { icon: 'add', state: 'Positive', border: '#107e3e', bg: '#f1fdf6' },
  U: { icon: 'edit', state: 'Information', border: '#0a6ed1', bg: '#f5faff' },
  D: { icon: 'delete', state: 'Negative', border: '#bb0000', bg: '#fff5f5' }
}

interface AuditLogPanelProps {
  tableName: string
}

type ActionFilter = 'ALL' | 'C' | 'U' | 'D'

interface AuditChange {
  field: string
  oldValue: string
  newValue: string
}

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
    minute: '2-digit'
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
  if (!value) return []
  return value
    .split(/\s+\|\s+/)
    .map(part => {
      const separator = part.indexOf(':')
      if (separator === -1) return { key: '', value: part.trim() }
      return {
        key: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim()
      }
    })
    .filter(part => part.key || part.value)
}

function partsToMap(parts: Array<{ key: string; value: string }>): Map<string, string> {
  return new Map(parts.filter(part => part.key).map(part => [part.key, part.value]))
}

function getChangedFields(entry: AuditLogEntry): AuditChange[] {
  const { fieldName, oldValue, newValue } = getAuditDisplayCells(entry)

  if (entry.ActionType !== 'U') {
    return [{
      field: normalizeDash(fieldName) || 'Record',
      oldValue,
      newValue
    }].filter(change => change.oldValue || change.newValue)
  }

  const oldMap = partsToMap(splitAuditParts(oldValue))
  const newMap = partsToMap(splitAuditParts(newValue))
  const keys = Array.from(new Set([...oldMap.keys(), ...newMap.keys()]))

  const changes = keys
    .map(key => ({
      field: key,
      oldValue: oldMap.get(key) || '',
      newValue: newMap.get(key) || ''
    }))
    .filter(change => change.oldValue !== change.newValue)

  if (changes.length > 0) return changes

  if (normalizeDash(fieldName) && (oldValue || newValue) && oldValue !== newValue) {
    return [{ field: normalizeDash(fieldName), oldValue, newValue }]
  }

  return []
}

function normalizeDash(value?: string): string {
  const text = String(value || '').trim()
  if (!text || text === '-' || text === '—' || text === 'â€”') return ''
  return text
}

function getRecordKey(entry: AuditLogEntry): string {
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

function includesText(value: unknown, query: string): boolean {
  return String(value ?? '').toLowerCase().includes(query)
}

function actionLabel(actionType: string): string {
  return ACTION_LABELS[actionType] || actionType || 'Unknown'
}

function AuditActionBadge({ actionType }: { actionType: string }) {
  const meta = ACTION_META[actionType] || { icon: 'question-mark', state: 'None' as const, border: '#6a6d70', bg: '#f7f7f7' }

  return (
    <div
      className="audit-action-badge"
      style={{
        borderColor: meta.border,
        background: meta.bg
      }}
    >
      <Icon name={meta.icon} className="audit-action-icon" style={{ color: meta.border }} />
      <ObjectStatus state={meta.state}>{actionLabel(actionType)}</ObjectStatus>
    </div>
  )
}

function AuditMetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="audit-meta-row">
      <span className="audit-meta-label">{label}</span>
      <span className="audit-meta-value" title={value}>{value || '-'}</span>
    </div>
  )
}

function ChangedFields({ entry, changes }: { entry: AuditLogEntry; changes: AuditChange[] }) {
  if (changes.length === 0) {
    return <Text className="audit-muted">No field-level details available.</Text>
  }

  if (entry.ActionType === 'U') {
    return (
      <div className="audit-change-table">
        <div className="audit-change-header">Field</div>
        <div className="audit-change-header">Old Value</div>
        <div className="audit-change-header">New Value</div>
        {changes.map((change, index) => (
          <div className="audit-change-row" key={`${change.field}-${index}`}>
            <div className="audit-change-field">{change.field || '-'}</div>
            <div className="audit-old-value">{change.oldValue || '-'}</div>
            <div className="audit-new-value">{change.newValue || '-'}</div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="audit-single-value">
      {changes.map((change, index) => (
        <div key={`${change.field}-${index}`} className="audit-single-value-row">
          <span className="audit-change-field">{change.field}</span>
          <span className={entry.ActionType === 'D' ? 'audit-old-value' : 'audit-new-value'}>
            {entry.ActionType === 'D' ? change.oldValue : change.newValue}
          </span>
        </div>
      ))}
    </div>
  )
}

function AuditCard({ entry }: { entry: AuditLogEntry }) {
  const { fieldName } = getAuditDisplayCells(entry)
  const changes = getChangedFields(entry)

  return (
    <article className="audit-card" style={{ borderLeftColor: ACTION_META[entry.ActionType]?.border || '#6a6d70' }}>
      <div className="audit-card-grid">
        <section className="audit-card-meta">
          <AuditActionBadge actionType={entry.ActionType} />
          <AuditMetaRow label="Changed By" value={entry.ChangedBy || '-'} />
          <AuditMetaRow label="Changed At" value={formatDateTime(entry.ChangedAt)} />
          <AuditMetaRow label="Record Key" value={getRecordKey(entry)} />
          <AuditMetaRow label="Field" value={normalizeDash(fieldName) || '-'} />
        </section>
        <section className="audit-card-changes">
          <ChangedFields entry={entry} changes={changes} />
        </section>
      </div>
    </article>
  )
}

function EmptyState() {
  return (
    <div className="audit-empty-state">
      <Icon name="history" className="audit-empty-icon" />
      <Title level="H5">No audit records found</Title>
      <Text className="audit-muted">Try changing the search or filter criteria.</Text>
    </div>
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
      return (
        includesText(entry.ChangedBy, query) ||
        includesText(entry.FieldName, query) ||
        includesText(display.fieldName, query) ||
        includesText(display.oldValue, query) ||
        includesText(display.newValue, query) ||
        includesText(recordKey, query) ||
        includesText(actionLabel(entry.ActionType), query)
      )
    })
  }, [entries, searchQuery, actionFilter, dateFrom, dateTo])

  return (
    <section className="audit-panel">
      <Toolbar design="Transparent" className="audit-toolbar">
        <div className="audit-title-block">
          <Title level="H4">Audit Trail</Title>
          <Text className="audit-muted">Latest changes are listed first</Text>
        </div>
        <ToolbarSpacer />
        <Text className="audit-count">{filteredEntries.length} audit record(s)</Text>
        <Button icon={'refresh' as any} onClick={loadAuditLog} disabled={loading}>
          Refresh
        </Button>
      </Toolbar>

      <div className="audit-filter-bar">
        <Input
          placeholder="Search by user, field, value..."
          value={searchQuery}
          icon={<Icon name="search" />}
          onInput={(event: any) => setSearchQuery(event.target.value)}
          className="audit-search-input"
        />
        <Select
          value={actionFilter}
          onChange={(event: any) => setActionFilter(event.detail.selectedOption.value as ActionFilter)}
        >
          <Option value="ALL">All</Option>
          <Option value="C">Created</Option>
          <Option value="U">Updated</Option>
          <Option value="D">Deleted</Option>
        </Select>
        <input
          className="audit-date-input"
          type="date"
          value={dateFrom}
          onChange={event => setDateFrom(event.target.value)}
          aria-label="Audit date from"
        />
        <input
          className="audit-date-input"
          type="date"
          value={dateTo}
          onChange={event => setDateTo(event.target.value)}
          aria-label="Audit date to"
        />
      </div>

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

      {!loading && !error && filteredEntries.length === 0 && <EmptyState />}

      {!loading && !error && filteredEntries.length > 0 && (
        <div className="audit-list">
          {filteredEntries.map(entry => (
            <AuditCard key={entry.AuditId} entry={entry} />
          ))}
        </div>
      )}
    </section>
  )
}
