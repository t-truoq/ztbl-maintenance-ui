import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  BusyIndicator,
  Button,
  FlexBox,
  Icon,
  MessageStrip,
  ObjectStatus,
  Table,
  TableCell,
  TableHeaderCell,
  TableHeaderRow,
  TableRow,
  Text,
  Title
} from '@ui5/webcomponents-react'
import {
  ExcelConfirmResult,
  ExcelDiffRow,
  confirmImport,
  downloadBase64AsXlsx,
  downloadExcel,
  fileToBase64,
  filterDiffForCommit,
  getExcelErrorMessage,
  getInfoRows,
  uploadExcel
} from '../services/excelPipelineApi'

interface ExcelPipelineTabProps {
  tableName: string
  onImported: () => Promise<void> | void
}

type BusyStep = '' | 'downloadTemplate' | 'downloadData' | 'upload' | 'confirm'

const columns = [
  { key: 'row_no', label: 'Row', width: '90px' },
  { key: 'record_key', label: 'Record Key', width: '180px' },
  { key: 'field_name', label: 'Field', width: '170px' },
  { key: 'old_value', label: 'Old Value', width: '240px' },
  { key: 'new_value', label: 'New Value', width: '240px' },
  { key: 'status', label: 'Status', width: '130px' },
  { key: 'message', label: 'Message', width: '260px' }
] as const

const DIFF_STATUS_META: Record<string, { state: 'Positive' | 'Critical' | 'Negative' | 'Information' | 'None'; className: string }> = {
  NEW: { state: 'Positive', className: 'excel-diff-row--new' },
  CHANGED: { state: 'Critical', className: 'excel-diff-row--changed' },
  ERROR: { state: 'Negative', className: 'excel-diff-row--error' },
  UNCHANGED: { state: 'None', className: 'excel-diff-row--unchanged' },
  INFO: { state: 'Information', className: '' }
}

export default function ExcelPipelineTab({
  tableName,
  onImported
}: ExcelPipelineTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [busyStep, setBusyStep] = useState<BusyStep>('')
  const [diffRows, setDiffRows] = useState<ExcelDiffRow[]>([])
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [confirmResult, setConfirmResult] = useState<ExcelConfirmResult | null>(null)
  const [diffDialogOpen, setDiffDialogOpen] = useState(false)
  const [resultDialogOpen, setResultDialogOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [showParseDetails, setShowParseDetails] = useState(false)

  const visibleRows = useMemo(
    () => diffRows.filter(row => !(row.row_no === 0 || row.status === 'INFO')),
    [diffRows]
  )
  const infoRows = useMemo(() => getInfoRows(diffRows), [diffRows])
  const commitRows = useMemo(() => filterDiffForCommit(diffRows), [diffRows])
  const errorRows = useMemo(
    () => diffRows.filter(row => row.status === 'ERROR'),
    [diffRows]
  )
  const statusCounts = useMemo(() => buildStatusCounts(visibleRows), [visibleRows])
  const parseDetails = useMemo(
    () => infoRows.map(row => row.message).filter(Boolean).join(' | '),
    [infoRows]
  )

  const totalTableWidth = columns.reduce((sum, col) => sum + parseInt(col.width, 10), 0)
  const columnsStyle = columns.map(col => col.width).join(' ')

  function resetFeedback() {
    setError('')
    setMessage('')
    setConfirmResult(null)
    setShowParseDetails(false)
  }

  async function handleDownload(templateOnly: boolean) {
    resetFeedback()
    setBusyStep(templateOnly ? 'downloadTemplate' : 'downloadData')

    try {
      const result = await downloadExcel(tableName, templateOnly)
      const fileName = templateOnly ? `${tableName}_TEMPLATE.xlsx` : `${tableName}.xlsx`
      downloadBase64AsXlsx(result.file_base64, fileName)
      setMessage(result.message || `Downloaded ${fileName}`)
      console.debug('[ExcelPipeline] download completed', {
        tableName,
        templateOnly,
        fileName
      })
    } catch (e: any) {
      const msg = getExcelErrorMessage(e)
      console.error('[ExcelPipeline] download failed', e)
      setError(msg)
    } finally {
      setBusyStep('')
    }
  }

  async function processFile(file: File) {
    resetFeedback()
    setDiffRows([])
    setSelectedFileName(file.name)
    setBusyStep('upload')

    try {
      if (!file.name.toLowerCase().endsWith('.xlsx')) {
        throw new Error('Please select an .xlsx file.')
      }

      const base64 = await fileToBase64(file)
      console.debug('[ExcelPipeline] file encoded', {
        fileName: file.name,
        fileSize: file.size,
        base64Length: base64.length
      })

      const rows = await uploadExcel(tableName, base64)
      setDiffRows(rows)
      const commitCount = filterDiffForCommit(rows).length
      const visibleCount = rows.filter(row => !(row.row_no === 0 || row.status === 'INFO')).length
      const errorCount = rows.filter(row => row.status === 'ERROR').length
      const unchangedCount = rows.filter(row => row.status === 'UNCHANGED').length
      if (visibleCount > 0 && unchangedCount === visibleCount && commitCount === 0 && errorCount === 0) {
        setMessage('No changes detected. The uploaded file matches the current table data.')
      } else if (errorCount > 0) {
        setMessage(`Upload parsed ${visibleCount} row(s). Resolve ${errorCount} error row(s) before importing.`)
      } else {
        setMessage(`Upload parsed ${visibleCount} row(s). ${commitCount} row(s) can be imported.`)
      }
      setDiffDialogOpen(true)
      console.debug('[ExcelPipeline] upload completed', {
        tableName,
        rows: rows.length,
        commitRows: commitCount
      })
    } catch (e: any) {
      const msg = e?.message || getExcelErrorMessage(e)
      console.error('[ExcelPipeline] upload failed', e)
      setError(msg)
    } finally {
      setBusyStep('')
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    await processFile(file)
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (file && !busy) {
      processFile(file)
    }
  }

  async function handleConfirm() {
    resetFeedback()
    setBusyStep('confirm')

    try {
      const result = await confirmImport(tableName, diffRows)
      setConfirmResult(result)
      setMessage(result.message || 'Import confirmed.')
      setDiffDialogOpen(false)
      setResultDialogOpen(true)
      console.debug('[ExcelPipeline] confirm completed', result)
      await onImported()
    } catch (e: any) {
      const msg = getExcelErrorMessage(e)
      console.error('[ExcelPipeline] confirm failed', e)
      setError(msg)
      setErrorDialogOpen(true)
    } finally {
      setBusyStep('')
    }
  }

  function statusState(status: string): 'Positive' | 'Critical' | 'Negative' | 'Information' | 'None' {
    const normalized = String(status || '').toUpperCase()
    return DIFF_STATUS_META[normalized]?.state || 'None'
  }

  const busy = !!busyStep
  const canConfirm = commitRows.length > 0 && errorRows.length === 0 && !busy
  const noChangesDetected = visibleRows.length > 0 && commitRows.length === 0 && errorRows.length === 0
  const confirmLabel = noChangesDetected ? 'Nothing to Import' : `Confirm Import (${commitRows.length})`

  return (
    <div className="excel-workspace">
      <section className="excel-hero">
        <div className="excel-hero-copy">
          <Title level="H4">Excel Import / Export</Title>
          <Text className="excel-muted">
            Export table data, upload the edited workbook, review the diff, then confirm the import.
          </Text>
        </div>
        <div className="excel-primary-actions">
          <Button
            design="Transparent"
            icon={'download' as any}
            disabled={busy}
            onClick={() => handleDownload(true)}
          >
            Template
          </Button>
          <Button
            design="Transparent"
            icon={'download' as any}
            disabled={busy}
            onClick={() => handleDownload(false)}
          >
            Data
          </Button>
          <Button
            design="Emphasized"
            icon={'accept' as any}
            disabled={!canConfirm}
            onClick={() => setDiffDialogOpen(true)}
          >
            Review & Confirm
          </Button>
        </div>
      </section>

      <section className="excel-flow">
        <FlowStep index="1" title="Download" text="Get a template or the current table data." active={!selectedFileName} />
        <FlowStep index="2" title="Upload" text="Drop the edited .xlsx file or browse from your device." active={busyStep === 'upload'} />
        <FlowStep index="3" title="Review" text="Check NEW, CHANGED, UNCHANGED, and ERROR rows." active={diffRows.length > 0 && !confirmResult} />
        <FlowStep index="4" title="Confirm" text="Commit only NEW and CHANGED rows." active={!!confirmResult} />
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <section className="excel-action-grid">
        <div
          className={`excel-dropzone${dragActive ? ' excel-dropzone--active' : ''}`}
          onDragOver={event => {
            event.preventDefault()
            if (!busy) setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={event => {
            if ((event.key === 'Enter' || event.key === ' ') && !busy) {
              fileInputRef.current?.click()
            }
          }}
          onClick={() => !busy && fileInputRef.current?.click()}
        >
          <Icon name="upload-to-cloud" className="excel-dropzone-icon" />
          <div className="excel-dropzone-text">
            <Title level="H5">Upload Excel Workbook</Title>
            <Text className="excel-muted">
              Drop an .xlsx file here or click to browse. Use the exported data file for the cleanest import.
            </Text>
          </div>
          <Button design="Transparent" icon={'upload' as any} disabled={busy}>
            Browse
          </Button>
        </div>

        <div className="excel-summary-card">
          <div className="excel-summary-header">
            <Text className="excel-label">Current Session</Text>
            <ObjectStatus state={errorRows.length > 0 ? 'Negative' : commitRows.length > 0 ? 'Information' : 'None'}>
              {errorRows.length > 0 ? 'Needs attention' : commitRows.length > 0 ? 'Ready to review' : noChangesDetected ? 'No changes' : 'Waiting for upload'}
            </ObjectStatus>
          </div>
          <FlexBox gap="8px" wrap="Wrap">
            <InfoPill>Table: {tableName}</InfoPill>
            <InfoPill>Diff: {visibleRows.length}</InfoPill>
            <InfoPill>Commit: {commitRows.length}</InfoPill>
            {selectedFileName && <InfoPill>File: {selectedFileName}</InfoPill>}
          </FlexBox>
          <StatusSummary
            total={visibleRows.length}
            commit={commitRows.length}
            statusCounts={statusCounts}
          />
          {parseDetails && (
            <ParseDetails
              details={parseDetails}
              open={showParseDetails}
              onToggle={() => setShowParseDetails(prev => !prev)}
            />
          )}
        </div>
      </section>

      {busy && (
        <FlexBox alignItems="Center" gap="8px" style={{ padding: '0 1rem' }}>
          <BusyIndicator active size="S" />
          <Text>{busyLabel(busyStep)}</Text>
        </FlexBox>
      )}

      {error && (
        <div style={{ padding: '0 1rem' }}>
          <MessageStrip design="Negative" onClose={() => setError('')}>
            {error}
          </MessageStrip>
        </div>
      )}

      {message && !error && (
        <div style={{ padding: '0 1rem' }}>
          <MessageStrip design="Information" onClose={() => setMessage('')}>
            {message}
          </MessageStrip>
        </div>
      )}

      {confirmResult && (
        <FlexBox gap="8px" wrap="Wrap" style={{ padding: '0 1rem' }}>
          <InfoPill>Inserted: {confirmResult.inserted_count ?? 0}</InfoPill>
          <InfoPill>Updated: {confirmResult.updated_count ?? 0}</InfoPill>
          <InfoPill>Unchanged: {confirmResult.unchanged_count ?? 0}</InfoPill>
          <InfoPill>Skipped: {confirmResult.skipped_count ?? 0}</InfoPill>
          <InfoPill>Errors: {confirmResult.error_count ?? 0}</InfoPill>
        </FlexBox>
      )}

      <DiffTable
        rows={visibleRows}
        columnsStyle={columnsStyle}
        totalTableWidth={totalTableWidth}
        statusState={statusState}
      />

      <ModernModal
        open={diffDialogOpen}
        title="Excel Diff Preview"
        onClose={() => setDiffDialogOpen(false)}
        closeOnBackdrop={!busy}
        width="min(96vw, 1180px)"
        footer={
          <>
            <Button
              design="Transparent"
              icon={'decline' as any}
              onClick={() => setDiffDialogOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              design={canConfirm ? 'Emphasized' : 'Transparent'}
              icon={'accept' as any}
              disabled={!canConfirm}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </Button>
          </>
        }
      >
        <FlexBox direction="Column" gap="12px" style={{ width: '100%' }}>
          <FlexBox direction="Column" gap="4px">
            <Title level="H5">{tableName}</Title>
            <Text>
              Review the Excel diff before committing. Only NEW and CHANGED rows are sent to confirm.
            </Text>
          </FlexBox>

          <StatusSummary
            total={visibleRows.length}
            commit={commitRows.length}
            statusCounts={statusCounts}
          />

          {noChangesDetected && (
            <MessageStrip design="Positive" hideCloseButton>
              No changes detected. The uploaded file matches the current table data.
            </MessageStrip>
          )}

          {errorRows.length > 0 && (
            <MessageStrip design="Negative" hideCloseButton>
              Resolve ERROR rows before confirming the import.
            </MessageStrip>
          )}

          {parseDetails && (
            <ParseDetails
              details={parseDetails}
              open={showParseDetails}
              onToggle={() => setShowParseDetails(prev => !prev)}
            />
          )}

          <div style={{ maxHeight: '58vh', overflow: 'auto' }}>
            <DiffTable
              rows={visibleRows}
              columnsStyle={columnsStyle}
              totalTableWidth={totalTableWidth}
              statusState={statusState}
              compact
              highlightStatus
            />
          </div>
        </FlexBox>
      </ModernModal>

      <ModernModal
        open={resultDialogOpen}
        title="Excel Import Result"
        onClose={() => setResultDialogOpen(false)}
        width="min(92vw, 720px)"
        footer={
          <Button design="Emphasized" onClick={() => setResultDialogOpen(false)}>
            OK
          </Button>
        }
      >
        <FlexBox direction="Column" gap="12px">
          <ObjectStatus state={(confirmResult?.error_count ?? 0) > 0 ? 'Negative' : 'Positive'}>
            {confirmResult?.message || 'Import completed.'}
          </ObjectStatus>
          <FlexBox gap="8px" wrap="Wrap">
            <InfoPill>Inserted: {confirmResult?.inserted_count ?? 0}</InfoPill>
            <InfoPill>Updated: {confirmResult?.updated_count ?? 0}</InfoPill>
            <InfoPill>Unchanged: {confirmResult?.unchanged_count ?? 0}</InfoPill>
            <InfoPill>Skipped: {confirmResult?.skipped_count ?? 0}</InfoPill>
            <InfoPill>Errors: {confirmResult?.error_count ?? 0}</InfoPill>
          </FlexBox>
        </FlexBox>
      </ModernModal>

      <ModernModal
        open={errorDialogOpen}
        title="Excel Operation Failed"
        onClose={() => setErrorDialogOpen(false)}
        width="min(92vw, 760px)"
        footer={
          <Button design="Emphasized" onClick={() => setErrorDialogOpen(false)}>
            OK
          </Button>
        }
      >
        <FlexBox direction="Column" gap="8px">
          <ObjectStatus state="Negative">Operation failed</ObjectStatus>
          <Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {error || 'Unknown Excel error.'}
          </Text>
        </FlexBox>
      </ModernModal>
    </div>
  )
}

function busyLabel(step: BusyStep): string {
  if (step === 'downloadTemplate') return 'Downloading Excel template...'
  if (step === 'downloadData') return 'Downloading Excel data...'
  if (step === 'upload') return 'Uploading and parsing Excel file...'
  if (step === 'confirm') return 'Confirming import...'
  return ''
}

function FlowStep({
  index,
  title,
  text,
  active
}: {
  index: string
  title: string
  text: string
  active: boolean
}) {
  return (
    <div className={`excel-flow-step${active ? ' excel-flow-step--active' : ''}`}>
      <span className="excel-flow-index">{index}</span>
      <div className="excel-flow-copy">
        <span className="excel-flow-title">{title}</span>
        <span className="excel-flow-text">{text}</span>
      </div>
    </div>
  )
}

function InfoPill({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: '1.5rem',
        padding: '0 0.5rem',
        border: '1px solid var(--sapGroup_BorderColor, #d9d9d9)',
        borderRadius: '4px',
        background: 'var(--sapNeutralBackground, #f5f6f7)',
        color: 'var(--sapTextColor, #32363a)',
        fontSize: '0.875rem',
        lineHeight: '1.25rem',
        maxWidth: '100%',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap'
      }}
      title={typeof children === 'string' ? children : undefined}
    >
      {children}
    </span>
  )
}

function ParseDetails({
  details,
  open,
  onToggle
}: {
  details: string
  open: boolean
  onToggle: () => void
}) {
  return (
    <div className="excel-parse-details">
      <Button
        design="Transparent"
        icon={(open ? 'slim-arrow-up' : 'slim-arrow-down') as any}
        onClick={onToggle}
      >
        {open ? 'Hide parse details' : 'Show parse details'}
      </Button>
      {open && (
        <div className="excel-parse-details-body">
          {details}
        </div>
      )}
    </div>
  )
}

function ModernModal({
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
  if (!open) return null

  return (
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
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: 'rgba(15, 23, 42, 0.38)',
        backdropFilter: 'blur(2px)',
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
          maxHeight: '92vh',
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
            background: 'var(--sapShellColor, #fff)'
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
          style={{
            padding: '16px 18px',
            overflow: 'auto',
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
              background: 'var(--sapShellColor, #fff)'
            }}
          >
            {footer}
          </footer>
        )}
      </section>
    </div>
  )
}

function StatusSummary({
  total,
  commit,
  statusCounts
}: {
  total: number
  commit: number
  statusCounts: Record<string, number>
}) {
  const items = [
    { label: 'Total', value: total, accent: '#5b738b' },
    { label: 'New', value: statusCounts.NEW, accent: '#107e3e' },
    { label: 'Changed', value: statusCounts.CHANGED, accent: '#0a6ed1' },
    { label: 'Unchanged', value: statusCounts.UNCHANGED, accent: '#6a6d70' },
    { label: 'Errors', value: statusCounts.ERROR, accent: '#bb0000' },
    { label: 'Commit', value: commit, accent: '#256f3a' }
  ]

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(116px, 1fr))',
        gap: '8px',
        width: '100%'
      }}
    >
      {items.map(item => (
        <div
          key={item.label}
          style={{
            minHeight: '48px',
            borderRadius: '6px',
            border: '1px solid var(--sapGroup_BorderColor, #d9d9d9)',
            background: 'var(--sapList_Background, #fff)',
            padding: '7px 10px',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            borderLeft: `4px solid ${item.accent}`
          }}
        >
          <span
            style={{
              color: 'var(--sapContent_LabelColor, #6a6d70)',
              fontSize: '0.75rem',
              lineHeight: '1rem'
            }}
          >
            {item.label}
          </span>
          <span
            style={{
              color: 'var(--sapTextColor, #32363a)',
              fontSize: '1rem',
              fontWeight: 700,
              lineHeight: '1.2rem'
            }}
          >
            {item.value ?? 0}
          </span>
        </div>
      ))}
    </div>
  )
}

function DiffTable({
  rows,
  columnsStyle,
  totalTableWidth,
  statusState,
  compact = false,
  highlightStatus = false
}: {
  rows: ExcelDiffRow[]
  columnsStyle: string
  totalTableWidth: number
  statusState: (status: string) => 'Positive' | 'Critical' | 'Negative' | 'Information' | 'None'
  compact?: boolean
  highlightStatus?: boolean
}) {
  return (
    <div style={{ width: '100%', overflowX: 'auto', padding: compact ? 0 : '0 1rem 1rem', boxSizing: 'border-box' }}>
      <Table
        overflowMode="Scroll"
        style={{ minWidth: `${totalTableWidth}px`, width: '100%' }}
        headerRow={
          <TableHeaderRow style={{ gridTemplateColumns: columnsStyle }}>
            {columns.map(col => (
              <TableHeaderCell key={col.key} minWidth={col.width} style={{ minWidth: col.width }}>
                {col.label}
              </TableHeaderCell>
            ))}
          </TableHeaderRow>
        }
      >
        {rows.length === 0 ? (
          <TableRow>
            <TableCell>
              <Text>No Excel diff uploaded yet.</Text>
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row, index) => (
            <TableRow
              key={row.id || `${row.row_no}-${row.record_key}-${row.field_name}-${index}`}
              className={highlightStatus ? diffRowClass(row.status) : undefined}
              style={{ gridTemplateColumns: columnsStyle }}
            >
              <TableCell>
                <Text>{String(row.row_no ?? '')}</Text>
              </TableCell>
              <TableCell>
                <Text>{row.record_key || '-'}</Text>
              </TableCell>
              <TableCell>
                <Text>{row.field_name || '-'}</Text>
              </TableCell>
              <TableCell>
                <Text>{row.old_value || '-'}</Text>
              </TableCell>
              <TableCell>
                <Text>{row.new_value || '-'}</Text>
              </TableCell>
              <TableCell>
                <ObjectStatus state={statusState(row.status)}>
                  {row.status || '-'}
                </ObjectStatus>
              </TableCell>
              <TableCell>
                <DiffMessage status={row.status} message={row.message} />
              </TableCell>
            </TableRow>
          ))
        )}
      </Table>
    </div>
  )
}

function diffRowClass(status: string): string {
  const normalized = String(status || '').toUpperCase()
  return DIFF_STATUS_META[normalized]?.className || ''
}

function DiffMessage({ status, message }: { status: string; message: string }) {
  const normalized = String(status || '').toUpperCase()
  const text = message || (normalized === 'CHANGED' ? 'Value changed' : '-')
  const showNote = normalized === 'CHANGED' || normalized === 'ERROR'

  if (!showNote) return <Text>{text}</Text>

  return (
    <div className={`excel-diff-note excel-diff-note--${normalized.toLowerCase()}`}>
      <Icon
        name={(normalized === 'ERROR' ? 'message-error' : 'hint') as any}
        className="excel-diff-note-icon"
      />
      <span>{text}</span>
    </div>
  )
}

function buildStatusCounts(rows: ExcelDiffRow[]): Record<string, number> {
  const counts: Record<string, number> = {
    NEW: 0,
    CHANGED: 0,
    UNCHANGED: 0,
    ERROR: 0,
    OTHER: 0
  }
  rows.forEach(row => {
    const status = String(row.status || 'OTHER').toUpperCase()
    if (counts[status] == null) {
      counts.OTHER += 1
    } else {
      counts[status] += 1
    }
  })
  return counts
}
