import { useState, useEffect } from 'react'
import {
  BusyIndicator,
  Button,
  Icon,
  Label,
  MessageStrip,
  Text,
  Title,
  Toolbar,
  ToolbarSpacer
} from '@ui5/webcomponents-react'
import { getAuditLog } from '../services/tableConfigApi'
import { getFriendlyErrorMessage } from '../services/apiClient'
import { getAuditDisplayCells } from '../utils/auditFormatters'
import { AuditLogEntry } from '../types'

const ACTION_LABELS: Record<string, string> = { C: 'Created', U: 'Updated', D: 'Deleted' }
const ACTION_META: Record<string, { icon: string; color: string; background: string }> = {
  C: { icon: 'add', color: '#107e3e', background: '#e4f5e9' },
  U: { icon: 'edit', color: '#0a6ed1', background: '#eaf4ff' },
  D: { icon: 'delete', color: '#bb0000', background: '#ffebeb' }
}

interface AuditLogPanelProps {
  tableName: string;
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
    minute: '2-digit',
    second: '2-digit'
  })
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

function changedParts(oldValue: string, newValue: string, fieldName = ''): Array<{ key: string; oldValue: string; newValue: string }> {
  const oldParts = splitAuditParts(oldValue)
  const newParts = splitAuditParts(newValue)
  const oldMap = partsToMap(oldParts)
  const newMap = partsToMap(newParts)
  const keys = Array.from(new Set([...oldMap.keys(), ...newMap.keys()]))

  if (keys.length === 0) {
    const oldScalar = oldParts.find(part => !part.key)?.value || oldValue || ''
    const newScalar = newParts.find(part => !part.key)?.value || newValue || ''
    const key = fieldName && fieldName !== '-' && fieldName !== '—' ? fieldName : 'Value'
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

function ActionBadge({ actionType }: { actionType: string }) {
  const actionLabel = ACTION_LABELS[actionType] || actionType
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
      <span>{actionLabel}</span>
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
          {fieldName && fieldName !== '-' && fieldName !== '—' && (
            <div>
              <Label>Field</Label>
              <Text style={{ display: 'block', marginTop: '0.15rem', wordBreak: 'break-word' }}>
                {fieldName}
              </Text>
            </div>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isUpdate ? 'minmax(0, 1fr) minmax(0, 1fr)' : 'minmax(0, 1fr)',
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

  return (
    <div style={{ padding: '0.5rem 0' }}>
      <Toolbar design="Solid">
        <Button icon={'refresh' as any} onClick={loadAuditLog} disabled={loading}>
          Refresh
        </Button>
        <ToolbarSpacer />
        <Text style={{ fontSize: '13px', color: '#6a7075' }}>
          {entries.length} audit record(s)
        </Text>
      </Toolbar>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <BusyIndicator active size="M" />
        </div>
      )}

      {error && (
        <MessageStrip design="Negative" hideCloseButton style={{ marginTop: '0.75rem' }}>
          {error}
        </MessageStrip>
      )}

      {!loading && !error && entries.length === 0 && (
        <MessageStrip design="Information" hideCloseButton style={{ marginTop: '0.75rem' }}>
          No audit records found for this table.
        </MessageStrip>
      )}

      {!loading && !error && entries.length > 0 && (
        <section style={{ padding: '0.75rem 0.75rem 0' }}>
          <Title level="H5" style={{ marginBottom: '0.25rem' }}>Audit Trail</Title>
          <Text style={{ color: '#6a7075' }}>
            Latest changes are listed first. Updates show only the changed field values.
          </Text>
          <div style={{ marginTop: '0.75rem' }}>
            {entries.map(entry => (
              <AuditEntryItem key={entry.AuditId} entry={entry} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
