import { useEffect, useRef, useState } from 'react'
import {
  BusyIndicator,
  Button,
  Label,
  MessageStrip,
  Table,
  TableCell,
  TableHeaderCell,
  TableHeaderRow,
  TableRow,
  Text,
  Title,
  Toolbar,
  ToolbarSpacer
} from '@ui5/webcomponents-react'
import { getRepositoryInfo } from '../services/tableConfigApi'
import type { RepositoryInfo } from '../services/tableConfigApi'
import { getFriendlyErrorMessage } from '../services/apiClient'

interface RepositoryInfoTabProps {
  configUuid: string;
  tableName: string;
}

function valueOf(row: any, ...keys: string[]): string {
  for (const key of keys) {
    const value = row?.[key]
    if (value !== undefined && value !== null && value !== '') return String(value)
  }
  return ''
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell {...({ colSpan } as any)}>
        <Text>{text}</Text>
      </TableCell>
    </TableRow>
  )
}

function NoticeRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TableRow>
      <TableCell {...({ colSpan } as any)}>
        <MessageStrip design="Information" hideCloseButton>
          {text}
        </MessageStrip>
      </TableCell>
    </TableRow>
  )
}

function repoNotice(row: any): string {
  return row?.__repoNotice ? String(row.__repoNotice) : ''
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: any }) {
  return (
    <section style={{ marginTop: '1.25rem' }}>
      <Title level="H5">{title}</Title>
      {subtitle && (
        <Text style={{ color: '#6a7075', display: 'block', margin: '0.25rem 0 0.75rem' }}>
          {subtitle}
        </Text>
      )}
      {children}
    </section>
  )
}

function ForeignKeysTable({ rows }: { rows: any[] }) {
  return (
    <Table
      headerRow={
        <TableHeaderRow>
          <TableHeaderCell minWidth="150px"><Label>Referenced By</Label></TableHeaderCell>
          <TableHeaderCell minWidth="140px"><Label>Field</Label></TableHeaderCell>
          <TableHeaderCell minWidth="150px"><Label>Check Table</Label></TableHeaderCell>
          <TableHeaderCell minWidth="140px"><Label>Check Field</Label></TableHeaderCell>
          <TableHeaderCell minWidth="80px"><Label>Type</Label></TableHeaderCell>
        </TableHeaderRow>
      }
    >
      {rows.length === 0 ? (
        <EmptyRow colSpan={5} text="No incoming foreign key references found." />
      ) : (
        rows.map((row, index) => (
          repoNotice(row) ? (
            <NoticeRow key={`notice-${index}`} colSpan={5} text={repoNotice(row)} />
          ) : (
            <TableRow key={`${valueOf(row, 'tabname', 'TABNAME')}-${valueOf(row, 'fieldname', 'FIELDNAME')}-${index}`}>
              <TableCell><Text>{valueOf(row, 'tabname', 'TABNAME')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'fieldname', 'FIELDNAME')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'checktable', 'CHECKTABLE')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'checkfield', 'CHECKFIELD')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'frkart', 'FRKART')}</Text></TableCell>
            </TableRow>
          )
        ))
      )}
    </Table>
  )
}

function DataElementsTable({ rows }: { rows: any[] }) {
  return (
    <Table
      headerRow={
        <TableHeaderRow>
          <TableHeaderCell minWidth="140px"><Label>Data Element</Label></TableHeaderCell>
          <TableHeaderCell minWidth="140px"><Label>Domain</Label></TableHeaderCell>
          <TableHeaderCell minWidth="80px"><Label>Type</Label></TableHeaderCell>
          <TableHeaderCell minWidth="90px"><Label>Length</Label></TableHeaderCell>
          <TableHeaderCell minWidth="90px"><Label>Decimals</Label></TableHeaderCell>
          <TableHeaderCell minWidth="180px"><Label>Label</Label></TableHeaderCell>
          <TableHeaderCell minWidth="220px"><Label>Description</Label></TableHeaderCell>
        </TableHeaderRow>
      }
    >
      {rows.length === 0 ? (
        <EmptyRow colSpan={7} text="No data element inventory found." />
      ) : (
        rows.map((row, index) => (
          repoNotice(row) ? (
            <NoticeRow key={`notice-${index}`} colSpan={7} text={repoNotice(row)} />
          ) : (
            <TableRow key={`${valueOf(row, 'rollname', 'ROLLNAME')}-${index}`}>
              <TableCell><Text>{valueOf(row, 'rollname', 'ROLLNAME')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'domname', 'DOMNAME')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'inttype', 'INTTYPE')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'leng', 'LENG')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'decimals', 'DECIMALS')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'label_long', 'LABEL_LONG', 'label_med', 'LABEL_MED')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'dd_text', 'DD_TEXT', 'rep_text', 'REP_TEXT')}</Text></TableCell>
            </TableRow>
          )
        ))
      )}
    </Table>
  )
}

function SearchHelpsTable({ rows }: { rows: any[] }) {
  return (
    <Table
      headerRow={
        <TableHeaderRow>
          <TableHeaderCell minWidth="140px"><Label>Field</Label></TableHeaderCell>
          <TableHeaderCell minWidth="140px"><Label>Data Element</Label></TableHeaderCell>
          <TableHeaderCell minWidth="150px"><Label>Search Help</Label></TableHeaderCell>
          <TableHeaderCell minWidth="150px"><Label>Search Help Field</Label></TableHeaderCell>
        </TableHeaderRow>
      }
    >
      {rows.length === 0 ? (
        <EmptyRow colSpan={4} text="No search helps found." />
      ) : (
        rows.map((row, index) => (
          repoNotice(row) ? (
            <NoticeRow key={`notice-${index}`} colSpan={4} text={repoNotice(row)} />
          ) : (
            <TableRow key={`${valueOf(row, 'fieldname', 'FIELDNAME')}-${index}`}>
              <TableCell><Text>{valueOf(row, 'fieldname', 'FIELDNAME')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'rollname', 'ROLLNAME')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'shlpname', 'SHLPNAME')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'shlpfield', 'SHLPFIELD')}</Text></TableCell>
            </TableRow>
          )
        ))
      )}
    </Table>
  )
}

function RepositoryObjectsTable({ rows }: { rows: any[] }) {
  return (
    <Table
      headerRow={
        <TableHeaderRow>
          <TableHeaderCell minWidth="180px"><Label>Object Name</Label></TableHeaderCell>
          <TableHeaderCell minWidth="100px"><Label>Type</Label></TableHeaderCell>
          <TableHeaderCell minWidth="140px"><Label>Package</Label></TableHeaderCell>
          <TableHeaderCell minWidth="120px"><Label>Author</Label></TableHeaderCell>
        </TableHeaderRow>
      }
    >
      {rows.length === 0 ? (
        <EmptyRow colSpan={4} text="No related repository objects found." />
      ) : (
        rows.map((row, index) => (
          repoNotice(row) ? (
            <NoticeRow key={`notice-${index}`} colSpan={4} text={repoNotice(row)} />
          ) : (
            <TableRow key={`${valueOf(row, 'obj_name', 'OBJ_NAME')}-${index}`}>
              <TableCell><Text>{valueOf(row, 'obj_name', 'OBJ_NAME')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'object', 'OBJECT')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'devclass', 'DEVCLASS')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'author', 'AUTHOR')}</Text></TableCell>
            </TableRow>
          )
        ))
      )}
    </Table>
  )
}

function FunctionModulesTable({ rows }: { rows: any[] }) {
  return (
    <Table
      headerRow={
        <TableHeaderRow>
          <TableHeaderCell minWidth="180px"><Label>Function Module</Label></TableHeaderCell>
          <TableHeaderCell minWidth="140px"><Label>Function Group</Label></TableHeaderCell>
          <TableHeaderCell minWidth="90px"><Label>Global</Label></TableHeaderCell>
        </TableHeaderRow>
      }
    >
      {rows.length === 0 ? (
        <EmptyRow colSpan={3} text="No function modules found." />
      ) : (
        rows.map((row, index) => (
          repoNotice(row) ? (
            <NoticeRow key={`notice-${index}`} colSpan={3} text={repoNotice(row)} />
          ) : (
            <TableRow key={`${valueOf(row, 'funcname', 'FUNCNAME')}-${index}`}>
              <TableCell><Text>{valueOf(row, 'funcname', 'FUNCNAME')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'fnarea', 'FNAREA', 'area', 'AREA')}</Text></TableCell>
              <TableCell><Text>{valueOf(row, 'global', 'GLOBAL')}</Text></TableCell>
            </TableRow>
          )
        ))
      )}
    </Table>
  )
}

export default function RepositoryInfoTab({ configUuid, tableName }: RepositoryInfoTabProps) {
  const [info, setInfo] = useState<RepositoryInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)
  const requestSeq = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    requestSeq.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setInfo(null)
    setError('')
    setLoading(false)
    setShowTechnicalDetails(false)

    return () => {
      requestSeq.current += 1
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [configUuid, tableName])

  async function loadRepositoryInfo() {
    if (!configUuid || loading) return
    const requestId = requestSeq.current + 1
    requestSeq.current = requestId
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      setLoading(true)
      setError('')
      setInfo(null)
      const nextInfo = await getRepositoryInfo(configUuid, controller.signal)
      if (requestSeq.current === requestId) {
        setInfo(nextInfo)
      }
    } catch (e: any) {
      if (requestSeq.current === requestId) {
        if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') {
          setError('Repository inventory request was canceled.')
        } else if (e?.code === 'ECONNABORTED') {
          setError('Repository inventory took too long to respond. Please try again later or ask BE to optimize getRepositoryInfo for this table.')
        } else {
          setError(getFriendlyErrorMessage(e))
        }
        setInfo(null)
      }
    } finally {
      if (requestSeq.current === requestId) {
        abortRef.current = null
        setLoading(false)
      }
    }
  }

  function cancelLoad() {
    requestSeq.current += 1
    abortRef.current?.abort()
    abortRef.current = null
    setLoading(false)
    setError('Repository inventory request was canceled.')
  }

  return (
    <div style={{ padding: '0.5rem 0' }}>
      <Toolbar design="Solid">
        <Button icon={'refresh' as any} onClick={loadRepositoryInfo} disabled={loading}>
          {info ? 'Refresh Dependencies' : 'Load Dependencies'}
        </Button>
        {loading && (
          <Button design="Transparent" icon={'decline' as any} onClick={cancelLoad}>
            Cancel
          </Button>
        )}
        <ToolbarSpacer />
        <Text style={{ fontSize: '13px', color: '#6a7075' }}>
          {tableName}
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

      {info?.errorMsg && (
        <MessageStrip design="Negative" hideCloseButton style={{ marginTop: '0.75rem' }}>
          {info.errorMsg}
        </MessageStrip>
      )}

      {!loading && !error && info && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '0.75rem',
              marginTop: '1rem'
            }}
          >
            <div>
              <Label>Relationships</Label>
              <Text style={{ display: 'block', fontSize: '1.25rem', fontWeight: 700 }}>
                {info.foreignKeys.filter(row => !repoNotice(row)).length}
              </Text>
            </div>
            <div>
              <Label>Repository Objects</Label>
              <Text style={{ display: 'block', fontSize: '1.25rem', fontWeight: 700 }}>
                {info.cdsViews.filter(row => !repoNotice(row)).length}
              </Text>
            </div>
            <div>
              <Label>Search Helps</Label>
              <Text style={{ display: 'block', fontSize: '1.25rem', fontWeight: 700 }}>
                {info.searchHelps.filter(row => !repoNotice(row)).length}
              </Text>
            </div>
            <div>
              <Label>Function Modules</Label>
              <Text style={{ display: 'block', fontSize: '1.25rem', fontWeight: 700 }}>
                {info.functionModules.filter(row => !repoNotice(row)).length}
              </Text>
            </div>
          </div>

          <Section
            title="Relationships"
            subtitle="Incoming DDIC foreign keys: tables that reference this table."
          >
            <ForeignKeysTable rows={info.foreignKeys} />
          </Section>

          <div style={{ marginTop: '1.25rem' }}>
            <Button
              design="Transparent"
              icon={(showTechnicalDetails ? 'slim-arrow-up' : 'slim-arrow-down') as any}
              onClick={() => setShowTechnicalDetails(prev => !prev)}
            >
              {showTechnicalDetails ? 'Hide Technical Details' : 'Show Technical Details'}
            </Button>
          </div>

          {showTechnicalDetails && (
            <>
              <Section title="Repository Objects">
                <RepositoryObjectsTable rows={info.cdsViews} />
              </Section>

              <Section title="Search Helps">
                <SearchHelpsTable rows={info.searchHelps} />
              </Section>

              <Section title="Function Modules">
                <FunctionModulesTable rows={info.functionModules} />
              </Section>

              <Section
                title="Data Elements"
                subtitle="Technical DDIC metadata. Use Field Schema for the user-facing field overview."
              >
                <DataElementsTable rows={info.dataElements} />
              </Section>
            </>
          )}
        </>
      )}

      {!loading && !error && !info && (
        <MessageStrip design="Information" hideCloseButton style={{ marginTop: '0.75rem' }}>
          Load dependencies when you need to inspect DDIC relationships and technical repository references for this table.
        </MessageStrip>
      )}
    </div>
  )
}
