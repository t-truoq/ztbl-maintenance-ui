import { useState, useEffect } from 'react'
import {
  Table,
  TableHeaderRow,
  TableHeaderCell,
  TableRow,
  TableCell,
  Label,
  Text,
  Tag,
  BusyIndicator,
  Button,
  Toolbar,
  ToolbarSpacer
} from '@ui5/webcomponents-react'
import { getAuditLog, getSapErrorMessage } from '../services/sapApi'
import { getAuditDisplayCells } from '../utils/auditFormatters'
import { AuditLogEntry } from '../types'

const ACTION_LABELS: Record<string, string> = { C: 'Created', U: 'Updated', D: 'Deleted' }
const ACTION_COLORS: Record<string, any> = { C: '8', U: '6', D: '1' }

interface AuditValueTextProps {
  children?: string;
}

function AuditValueText({ children }: AuditValueTextProps) {
  if (!children) return <Text>—</Text>
  return <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{children}</Text>
}

interface AuditLogPanelProps {
  tableName: string;
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
      setError(getSapErrorMessage(e))
      setEntries([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '0.5rem 0' }}>
      <Toolbar design="Solid">
        <Button icon={"refresh" as any} onClick={loadAuditLog} disabled={loading}>
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
        <Text style={{ color: '#bb0000', padding: '1rem' }}>{error}</Text>
      )}

      {!loading && !error && (
        <Table
          headerRow={
            <TableHeaderRow>
              <TableHeaderCell minWidth="100px"><Label>Action</Label></TableHeaderCell>
              <TableHeaderCell minWidth="120px"><Label>Field Name</Label></TableHeaderCell>
              <TableHeaderCell minWidth="200px"><Label>Old Value</Label></TableHeaderCell>
              <TableHeaderCell minWidth="200px"><Label>New Value</Label></TableHeaderCell>
              <TableHeaderCell minWidth="120px"><Label>Changed By</Label></TableHeaderCell>
              <TableHeaderCell minWidth="160px"><Label>Changed At</Label></TableHeaderCell>
            </TableHeaderRow>
          }
        >
          {entries.length === 0 ? (
            <TableRow>
              <TableCell {...({ colSpan: 6 } as any)}>
                <Text>No audit records</Text>
              </TableCell>
            </TableRow>
          ) : (
            entries.map(entry => {
              const { fieldName, oldValue, newValue } = getAuditDisplayCells(entry)
              const isUpdate = entry.ActionType === 'U'

              return (
                <TableRow key={entry.AuditId}>
                  <TableCell>
                    <Tag colorScheme={ACTION_COLORS[entry.ActionType] || '2'}>
                      {ACTION_LABELS[entry.ActionType] || entry.ActionType}
                    </Tag>
                  </TableCell>
                  <TableCell>
                    <AuditValueText>{fieldName}</AuditValueText>
                    {isUpdate && (oldValue || newValue) && (
                      <Text style={{ fontSize: '0.8rem', color: '#6a7075', marginTop: '2px' }}>
                        {oldValue || '—'} → {newValue || '—'}
                      </Text>
                    )}
                  </TableCell>
                  <TableCell>
                    <AuditValueText>{oldValue}</AuditValueText>
                  </TableCell>
                  <TableCell>
                    <AuditValueText>{newValue}</AuditValueText>
                  </TableCell>
                  <TableCell><Text>{entry.ChangedBy || ''}</Text></TableCell>
                  <TableCell>
                    <Text>
                      {entry.ChangedAt
                        ? String(entry.ChangedAt).substring(0, 19)
                        : ''}
                    </Text>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </Table>
      )}
    </div>
  )
}
