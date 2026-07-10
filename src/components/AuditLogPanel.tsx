import { useEffect, useMemo, useState } from 'react'
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
  Title,
  Toolbar,
  ToolbarSpacer
} from '@ui5/webcomponents-react'
import { getAuditLog } from '../services/tableConfigApi'
import { getFriendlyErrorMessage } from '../services/apiClient'
import { getAuditDisplayCells, getAuditValueParts } from '../utils/auditFormatters'
import { AuditLogEntry } from '../types'

const ACTION_LABELS: Record<string, string> = { C: 'Created', U: 'Updated', D: 'Deleted' }
const ACTION_META: Record<string, { icon: string; color: string; background: string }> = {
  C: { icon: 'add', color: '#107e3e', background: '#e4f5e9' },
  U: { icon: 'edit', color: '#0a6ed1', background: '#eaf4ff' },
  D: { icon: 'delete', color: '#bb0000', background: '#ffebeb' }
}

interface AuditLogPanelProps {
  tableName: string
}

type ActionFilter = 'ALL' | 'C' | 'U' | 'D'

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

function getRawRecordKey(entry: AuditLogEntry): string {
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

function getRecordKey(entry: AuditLogEntry): string {
  const rawKey = getRawRecordKey(entry)
  if (!rawKey || rawKey === '-') return '-'

  try {
    const parsed = JSON.parse(rawKey)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return rawKey

    const visibleParts = Object.entries(parsed)
      .filter(([key]) => !['CLIENT', 'MANDT'].includes(key.toUpperCase()))
      .map(([key, value]) => `${key}: ${String(value)}`)

    return visibleParts.length > 0 ? visibleParts.join(', ') : '-'
  } catch {
    return rawKey
  }
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

function AuditEntryItem({ entry }: { entry: AuditLogEntry }) {
  const { fieldName, oldValue, newValue } = getAuditDisplayCells(entry)
  const normalizedField = normalizeDash(fieldName)
  const isUpdate = entry.ActionType === 'U'

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
          gridTemplateColumns: 'minmax(150px, 200px) minmax(0, 1fr)',
          gap: '1rem',
          alignItems: 'start'
        }}
      >
        <div style={{ display: 'grid', gap: '0.45rem' }}>
          <div>
            <ActionBadge actionType={entry.ActionType} />
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
            <Text className="audit-record-key">
              {getRecordKey(entry)}
            </Text>
          </div>
          {normalizedField && (
            <div>
              <Label>Field</Label>
              <Text style={{ display: 'block', marginTop: '0.15rem', wordBreak: 'break-word' }}>
                {normalizedField}
              </Text>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isUpdate ? 'minmax(0, 1fr)' : 'minmax(0, 1fr)',
            gap: '0.75rem'
          }}
        >
          {isUpdate ? (
            <DiffBlock fieldName={fieldName} oldValue={oldValue} newValue={newValue} />
          ) : (
            <>
              {entry.ActionType !== 'C' && (
                <ValueBlock title="Old Value" value={oldValue} emptyText="No previous value" />
              )}
              {entry.ActionType !== 'D' && (
                <ValueBlock title="New Value" value={newValue} emptyText="No new value" />
              )}
            </>
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
      const rawRecordKey = getRawRecordKey(entry)
      return (
        includesText(entry.ChangedBy, query) ||
        includesText(entry.FieldName, query) ||
        includesText(display.fieldName, query) ||
        includesText(display.oldValue, query) ||
        includesText(display.newValue, query) ||
        includesText(recordKey, query) ||
        includesText(rawRecordKey, query) ||
        includesText(actionLabel(entry.ActionType), query)
      )
    })
  }, [entries, searchQuery, actionFilter, dateFrom, dateTo])

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
              <AuditEntryItem key={entry.AuditId} entry={entry} />
            ))}
          </div>
        </section>
      )}
    </section>
  )
}
