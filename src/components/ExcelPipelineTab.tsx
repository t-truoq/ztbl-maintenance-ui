import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  BusyIndicator,
  Button,
  FlexBox,
  Icon,
  MessageStrip,
  ObjectStatus,
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
  isExcelConfirmFailure,
  isExcelFilenameAllowed,
  uploadExcel
} from '../services/excelPipelineApi'

interface ExcelPipelineTabProps {
  tableName: string
  canUpload?: boolean
  onImported: () => Promise<void> | void
}

type BusyStep = '' | 'downloadTemplate' | 'downloadData' | 'upload' | 'confirm'
type FeedbackDesign = 'Information' | 'Positive' | 'Critical' | 'Negative'

interface ExcelFeedback {
  text: string
  design: FeedbackDesign
}

const MAIN_DIFF_ROW_LIMIT = 200
const PREVIEW_DIFF_ROW_LIMIT = 500
const STORED_UNCHANGED_ROW_LIMIT = 200
const MAX_UPLOAD_FILE_BYTES = 12 * 1024 * 1024

const DIFF_STATUS_META: Record<string, { state: 'Positive' | 'Critical' | 'Negative' | 'Information' | 'None'; className: string }> = {
  NEW: { state: 'Positive', className: 'excel-diff-row--new' },
  CHANGED: { state: 'Critical', className: 'excel-diff-row--changed' },
  DELETE: { state: 'Negative', className: 'excel-diff-row--deleted' },
  DELETED: { state: 'Negative', className: 'excel-diff-row--deleted' },
  WARNING: { state: 'Critical', className: 'excel-diff-row--warning' },
  ERROR: { state: 'Negative', className: 'excel-diff-row--error' },
  UNCHANGED: { state: 'None', className: 'excel-diff-row--unchanged' },
  INFO: { state: 'Information', className: '' }
}

export default function ExcelPipelineTab({
  tableName,
  canUpload = true,
  onImported
}: ExcelPipelineTabProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const uploadInFlightRef = useRef(false)
  const [busyStep, setBusyStep] = useState<BusyStep>('')
  const [diffRows, setDiffRows] = useState<ExcelDiffRow[]>([])
  const [feedback, setFeedback] = useState<ExcelFeedback | null>(null)
  const [error, setError] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [confirmResult, setConfirmResult] = useState<ExcelConfirmResult | null>(null)
  const [diffDialogOpen, setDiffDialogOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const visibleRows = useMemo(
    () => diffRows.filter(row => !(row.row_no === 0 || row.status === 'INFO')),
    [diffRows]
  )
  const infoRows = useMemo(() => getInfoRows(diffRows), [diffRows])
  const commitRows = useMemo(() => filterDiffForCommit(diffRows, tableName), [diffRows, tableName])
  const visibleRecordCount = useMemo(() => countDistinctRecords(visibleRows), [visibleRows])
  const commitRecordCount = useMemo(() => countDistinctRecords(commitRows), [commitRows])
  const errorRows = useMemo(
    () => diffRows.filter(row => row.status === 'ERROR'),
    [diffRows]
  )
  const warningRows = useMemo(
    () => diffRows.filter(row => row.status === 'WARNING'),
    [diffRows]
  )
  const statusCounts = useMemo(() => buildStatusCounts(visibleRows), [visibleRows])
  const parseSummary = useMemo(
    () => buildParseSummary(infoRows),
    [infoRows]
  )

  useEffect(() => {
    setBusyStep('')
    setDiffRows([])
    setFeedback(null)
    setError('')
    setSelectedFileName('')
    setConfirmResult(null)
    setDiffDialogOpen(false)
    setErrorDialogOpen(false)
  }, [tableName])

  function resetFeedback() {
    setError('')
    setFeedback(null)
    setConfirmResult(null)
  }

  async function handleDownload(templateOnly: boolean) {
    resetFeedback()
    setBusyStep(templateOnly ? 'downloadTemplate' : 'downloadData')

    try {
      const result = await downloadExcel(tableName, templateOnly)
      const fileName = templateOnly ? `${tableName}_TEMPLATE.xlsx` : `${tableName}.xlsx`
      downloadBase64AsXlsx(result.file_base64, fileName)
      setFeedback({
        text: result.message || `Downloaded ${fileName}`,
        design: 'Positive'
      })
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
    if (uploadInFlightRef.current) return
    if (!canUpload) {
      setError('You do not have permission to upload data.')
      return
    }
    uploadInFlightRef.current = true
    resetFeedback()
    setDiffRows([])
    setSelectedFileName(file.name)
    setBusyStep('upload')

    try {
      await waitForBrowserPaint()

      if (!isExcelFilenameAllowed(file.name, tableName)) {
        throw new Error(`Please select ${tableName}.xlsx, ${tableName}_TEMPLATE.xlsx, or a browser-numbered copy.`)
      }

      if (file.size > MAX_UPLOAD_FILE_BYTES) {
        throw new Error(
          `The selected workbook is too large (${formatFileSize(file.size)}). Please upload a file smaller than ${formatFileSize(MAX_UPLOAD_FILE_BYTES)}.`
        )
      }

      const base64 = await fileToBase64(file)
      console.debug('[ExcelPipeline] file encoded', {
        fileName: file.name,
        fileSize: file.size,
        base64Length: base64.length
      })

      const rows = await uploadExcel(tableName, base64)
      const commitRows = filterDiffForCommit(rows, tableName)
      const visibleRows = rows.filter(row => !(row.row_no === 0 || row.status === 'INFO'))
      const commitCount = commitRows.length
      const commitRecordCount = countDistinctRecords(commitRows)
      const visibleCount = visibleRows.length
      const visibleRecordCount = countDistinctRecords(visibleRows)
      const errorCount = rows.filter(row => row.status === 'ERROR').length
      const warningCount = rows.filter(row => row.status === 'WARNING').length
      const unchangedCount = rows.filter(row => row.status === 'UNCHANGED').length
      setDiffRows(compactRowsForUi(rows))
      if (visibleRecordCount > 0 && unchangedCount === visibleCount && commitCount === 0 && errorCount === 0) {
        setFeedback({
          text: 'No changes detected. The uploaded file matches the current table data.',
          design: 'Positive'
        })
      } else if (warningCount > 0 && commitCount === 0 && errorCount === 0) {
        setFeedback({
          text: `Upload parsed ${visibleRecordCount} record(s) across ${visibleCount} detail row(s). ${warningCount} existing exported value warning(s) were ignored because those rows have no changes.`,
          design: 'Critical'
        })
      } else if (errorCount > 0) {
        setFeedback({
          text: `Upload parsed ${visibleRecordCount} record(s) across ${visibleCount} detail row(s). Resolve ${errorCount} error row(s) before importing.`,
          design: 'Critical'
        })
      } else {
        setFeedback({
          text: `Upload parsed ${visibleRecordCount} record(s) across ${visibleCount} detail row(s). ${commitRecordCount} record(s) can be imported.`,
          design: 'Information'
        })
      }
      console.debug('[ExcelPipeline] upload completed', {
        tableName,
        rows: rows.length,
        commitRows: commitCount,
        commitRecords: commitRecordCount
      })
    } catch (e: any) {
      const msg = e?.message || getExcelErrorMessage(e)
      console.error('[ExcelPipeline] upload failed', e)
      setError(msg)
    } finally {
      uploadInFlightRef.current = false
      setBusyStep('')
    }
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    window.setTimeout(() => {
      void processFile(file)
    }, 0)
  }

  function openFilePicker() {
    if (busy || !canUpload || uploadInFlightRef.current) return
    fileInputRef.current?.click()
  }

  function handleBrowseClick(event: React.MouseEvent<HTMLElement>) {
    event?.preventDefault()
    event?.stopPropagation()
    openFilePicker()
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
    if (!canUpload) {
      setError('You do not have permission to upload data.')
      return
    }
    resetFeedback()
    setBusyStep('confirm')

    try {
      const result = await confirmImport(tableName, diffRows)
      const confirmFailed = isExcelConfirmFailure(result)
      setConfirmResult(result)
      setFeedback({
        text: buildConfirmFeedbackText(result),
        design: confirmFailed ? 'Negative' : 'Positive'
      })
      console.debug('[ExcelPipeline] confirm completed', result)
      await onImported()
    } catch (e: any) {
      const msg = getExcelErrorMessage(e)
      console.error('[ExcelPipeline] confirm failed', e)
      setError(msg)
      setDiffDialogOpen(false)
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
  const canReview = visibleRows.length > 0 && !busy && !confirmResult
  const canConfirm = canUpload && commitRows.length > 0 && errorRows.length === 0 && !busy && !confirmResult
  const noChangesDetected = visibleRows.length > 0 && commitRows.length === 0 && errorRows.length === 0
  const confirmLabel = noChangesDetected ? 'Nothing to Import' : `Confirm Import (${commitRecordCount})`

  return (
    <div className="tab-panel-form excel-workspace">
      <section className="tab-panel-header excel-hero">
        <div className="tab-panel-title-block excel-hero-copy">
          <Title level="H4" className="tab-panel-title excel-title">Excel Import / Export</Title>
          <Text className="tab-panel-subtitle excel-muted excel-subtitle">
            Export table data, upload the edited workbook, review the diff, then confirm the import.
          </Text>
          {parseSummary && (
            <ParseDetails details={parseSummary} />
          )}
        </div>
        <div className="tab-panel-actions excel-primary-actions">
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
            disabled={!canReview}
            onClick={() => setDiffDialogOpen(true)}
          >
            Review & Confirm
          </Button>
        </div>
      </section>

      <section className="excel-flow">
        <FlowStep index="1" title="Download" text="Get a template or the current table data." active={!selectedFileName} />
        <FlowStep index="2" title="Upload" text="Drop the edited .xlsx file or browse from your device." active={busyStep === 'upload'} />
        <FlowStep index="3" title="Review" text="Check NEW, CHANGED, UNCHANGED, WARNING, and ERROR rows." active={diffRows.length > 0 && !confirmResult} />
        <FlowStep index="4" title="Confirm" text="Commit NEW, CHANGED, and DELETED records." active={!!confirmResult} />
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <section className="excel-action-grid">
        {!canUpload && (
          <MessageStrip design="Negative" hideCloseButton className="excel-permission-message">
            You do not have permission to upload data.
          </MessageStrip>
        )}
        <div
          className={`excel-dropzone${dragActive ? ' excel-dropzone--active' : ''}`}
          onDragOver={event => {
            event.preventDefault()
            if (!busy && canUpload) setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
          onKeyDown={event => {
            if ((event.key === 'Enter' || event.key === ' ') && !busy && canUpload) {
              openFilePicker()
            }
          }}
        >
          <Icon name="upload-to-cloud" className="excel-dropzone-icon" />
          <div className="excel-dropzone-text">
            <Title level="H5">Upload Excel Workbook</Title>
            <Text className="excel-muted">
              Drop an .xlsx file here or click to browse. Use the exported data file for the cleanest import.
            </Text>
          </div>
          <Button
            design="Transparent"
            icon={'upload' as any}
            disabled={busy || !canUpload}
            onClick={handleBrowseClick}
          >
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
          <div className="excel-session-context">
            <span><strong>Table</strong> {tableName}</span>
            <span className="excel-session-context-separator">·</span>
            <span><strong>File</strong> {selectedFileName || 'Waiting for upload'}</span>
          </div>
          <StatusSummary
            total={visibleRecordCount}
            commit={commitRecordCount}
            statusCounts={statusCounts}
          />
          <Text className="excel-summary-note">Counts are by record; the table below shows field-level details.</Text>
        </div>
      </section>

      {busy && (
        <FlexBox alignItems="Center" gap="8px" style={{ padding: '0 1rem' }}>
          <BusyIndicator active size="S" />
          <Text>{busyLabel(busyStep)}</Text>
        </FlexBox>
      )}

      {error && (
        <div className="excel-error-banner">
          <MessageStrip design="Critical" onClose={() => setError('')}>
            {error}
          </MessageStrip>
        </div>
      )}

      {feedback && !error && (
        <div className="excel-feedback-banner">
          <MessageStrip design={feedback.design} onClose={() => setFeedback(null)}>
            {feedback.text}
          </MessageStrip>
        </div>
      )}

      <DiffTable
        rows={visibleRows}
        statusState={statusState}
        rowLimit={MAIN_DIFF_ROW_LIMIT}
      />

      <ModernModal
        open={diffDialogOpen}
        title={confirmResult ? 'Excel Import Result' : 'Excel Diff Preview'}
        onClose={() => setDiffDialogOpen(false)}
        closeOnBackdrop={!busy}
        width={confirmResult ? 'min(92vw, 620px)' : 'min(96vw, 1180px)'}
        footer={
          confirmResult ? (
            <Button design="Emphasized" icon={'accept' as any} onClick={() => setDiffDialogOpen(false)}>
              Done
            </Button>
          ) : (
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
          )
        }
      >
        {confirmResult ? (
          <ExcelImportResultSummary result={confirmResult} />
        ) : (
          <FlexBox direction="Column" gap="12px" style={{ width: '100%' }}>
            <FlexBox direction="Column" gap="4px">
              <Title level="H5">{tableName}</Title>
              <Text>
                Review the Excel diff before committing. NEW, CHANGED, and DELETED records are sent to confirm.
              </Text>
            </FlexBox>

            <StatusSummary
              total={visibleRecordCount}
              commit={commitRecordCount}
              statusCounts={statusCounts}
            />
            <Text className="excel-summary-note">Counts are by record; the table below shows field-level details.</Text>

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

            {warningRows.length > 0 && errorRows.length === 0 && (
              <MessageStrip design="Critical" hideCloseButton>
                Existing exported values raised warnings, but unchanged warning rows will not be sent to confirm.
              </MessageStrip>
            )}

            <DiffTable
              rows={visibleRows}
              statusState={statusState}
              rowLimit={PREVIEW_DIFF_ROW_LIMIT}
              compact
            />
          </FlexBox>
        )}
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

function waitForBrowserPaint(): Promise<void> {
  return new Promise(resolve => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve())
    })
  })
}

function compactRowsForUi(rows: ExcelDiffRow[]): ExcelDiffRow[] {
  let unchangedCount = 0

  return rows.filter(row => {
    if (normalizeDiffStatus(row.status) !== 'UNCHANGED') return true
    unchangedCount += 1
    return unchangedCount <= STORED_UNCHANGED_ROW_LIMIT
  })
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${bytes} bytes`
}

function buildConfirmFeedbackText(result: ExcelConfirmResult): string {
  const hasErrors = isExcelConfirmFailure(result)
  const approvalId = parseImportResultMessage(result.message || '').approvalId
  if (hasErrors) {
    return 'Import failed. Review the result details.'
  }
  if (approvalId) {
    return 'Import submitted for approval. Review the approval request details.'
  }
  return `Import completed. Inserted: ${result.inserted_count ?? 0}, updated: ${result.updated_count ?? 0}, deleted: ${result.deleted_count ?? 0}, skipped: ${result.skipped_count ?? 0}.`
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

function ParseDetails({
  details
}: {
  details: string
}) {
  return (
    <div className="excel-parse-details">
      <div className="excel-parse-details-body">
        {details}
      </div>
    </div>
  )
}

function buildParseSummary(infoRows: ExcelDiffRow[]): string {
  const messages = infoRows
    .map(row => row.message)
    .filter(Boolean)
    .filter(message => !/readonly\/hidden\/system-managed/i.test(message))

  return messages.join(' | ')
}

function ExcelImportResultSummary({ result }: { result: ExcelConfirmResult | null }) {
  const parsed = parseImportResultMessage(result?.message || '')
  const hasErrors = isExcelConfirmFailure(result)
  const tone = hasErrors ? 'error' : parsed.approvalId ? 'approval' : 'success'
  const statusText = hasErrors
    ? 'Import failed'
    : parsed.approvalId
      ? 'Approval required'
      : 'Import completed'
  const statusDescription = parsed.description || (
    hasErrors
      ? 'The import finished with errors. Review the details and try again.'
      : parsed.approvalId
        ? 'Your changes were submitted successfully and are waiting for approval.'
        : 'Your changes were imported successfully.'
  )
  const iconName = hasErrors ? 'message-error' : parsed.approvalId ? 'message-information' : 'message-success'

  return (
    <div className={`excel-result-panel excel-result-panel--${tone}`}>
      <div className="excel-result-hero">
        <div className="excel-result-hero-icon" aria-hidden="true">
          <Icon name={iconName as any} />
        </div>
        <div className="excel-result-hero-copy">
          <Title level="H3" className="excel-result-title">{statusText}</Title>
          <Text className="excel-result-description">{statusDescription}</Text>
        </div>
      </div>

      {(parsed.approvalId || parsed.rowNo || parsed.waitingText) && (
        <div className="excel-result-detail-grid">
          {parsed.approvalId && (
            <div className="excel-result-detail">
              <span className="excel-result-detail-label">Approval Request ID</span>
              <code className="excel-result-code">{parsed.approvalId}</code>
            </div>
          )}
          {parsed.rowNo && (
            <div className="excel-result-detail">
              <span className="excel-result-detail-label">Source Row</span>
              <span className="excel-result-detail-value">Row {parsed.rowNo}</span>
            </div>
          )}
          {parsed.waitingText && (
            <div className="excel-result-detail">
              <span className="excel-result-detail-label">Next Step</span>
              <span className="excel-result-detail-value">{parsed.waitingText}</span>
            </div>
          )}
        </div>
      )}

      {parsed.fallback && (
        <div className="excel-result-raw">
          {parsed.fallback}
        </div>
      )}
    </div>
  )
}

function parseImportResultMessage(message: string): {
  title: string
  description: string
  approvalId: string
  rowNo: string
  waitingText: string
  fallback: string
} {
  const text = String(message || '').trim()
  const rowNo = text.match(/^Row\s+(\d+):/i)?.[1] || ''
  const approvalId = text.match(/Approval request submitted\s*\(ID:\s*([^)]+)\)/i)?.[1] || ''
  const waitingText = /Waiting for approval in the UI/i.test(text) ? 'Waiting for approval in the UI.' : ''

  if (approvalId) {
    return {
      title: 'Approval request submitted',
      description: 'Your Excel import was submitted successfully and is now waiting for approval.',
      approvalId,
      rowNo,
      waitingText,
      fallback: ''
    }
  }

  if (/no valid excel row/i.test(text) || /cannot create a new request/i.test(text)) {
    return {
      title: 'Import failed',
      description: 'No valid Excel rows were submitted. Review skipped rows and approval locks.',
      approvalId: '',
      rowNo,
      waitingText: '',
      fallback: text
    }
  }

  return {
    title: text || 'Import completed',
    description: '',
    approvalId: '',
    rowNo,
    waitingText,
    fallback: ''
  }
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
    { label: 'Total records', value: total, accent: '#5b738b' },
    { label: 'New', value: statusCounts.NEW, accent: '#107e3e' },
    { label: 'Changed', value: statusCounts.CHANGED, accent: '#e09d00' },
    { label: 'Deleted', value: (statusCounts.DELETE ?? 0) + (statusCounts.DELETED ?? 0), accent: '#bb0000' },
    { label: 'Commit records', value: commit, accent: '#0a6ed1' }
  ]
  const additionalItems = [
    { label: 'Unchanged', value: statusCounts.UNCHANGED ?? 0, tone: 'neutral' },
    { label: 'Warnings', value: statusCounts.WARNING ?? 0, tone: 'warning' },
    { label: 'Errors', value: statusCounts.ERROR ?? 0, tone: 'negative' }
  ].filter(item => item.value > 0)

  return (
    <>
      <div className="excel-status-summary">
        {items.map(item => (
          <div
            key={item.label}
            className="excel-status-card"
            style={{ borderLeftColor: item.accent }}
          >
            <span className="excel-status-label">
              {item.label}
            </span>
            <span className="excel-status-value">
              {item.value ?? 0}
            </span>
          </div>
        ))}
      </div>
      {additionalItems.length > 0 && (
        <div className="excel-status-secondary">
          {additionalItems.map(item => (
            <span key={item.label} className={`excel-status-secondary-item excel-status-secondary-item--${item.tone}`}>
              {item.label}: {item.value}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

function normalizeDiffStatus(status: string): string {
  return String(status || '').trim().toUpperCase()
}

function countDistinctRecords(rows: ExcelDiffRow[]): number {
  return new Set(rows.map(recordIdentity)).size
}

function recordIdentity(row: ExcelDiffRow): string {
  const recordKey = String(row.record_key || '').trim()
  return recordKey || `row:${row.row_no}`
}

function isDeleteDiffStatus(status: string): boolean {
  const normalized = normalizeDiffStatus(status)
  return normalized === 'DELETE' || normalized === 'DELETED'
}

interface DiffRecordGroup {
  recordKey: string
  rows: ExcelDiffRow[]
  status: string
  statuses: string[]
}

function DiffTable({
  rows,
  statusState,
  rowLimit,
  compact = false
}: {
  rows: ExcelDiffRow[]
  statusState: (status: string) => 'Positive' | 'Critical' | 'Negative' | 'Information' | 'None'
  rowLimit?: number
  compact?: boolean
}) {
  const displayedRows = rowLimit && rows.length > rowLimit
    ? rows.slice(0, rowLimit)
    : rows
  const groups = buildDiffRecordGroups(displayedRows)

  return (
    <div
      className={`excel-record-list-shell${compact ? ' excel-record-list-shell--compact' : ''}`}
      style={{
        maxHeight: compact ? 'min(54vh, 560px)' : undefined,
        padding: compact ? 0 : '0 1rem 1rem',
        scrollbarGutter: compact ? 'stable' : undefined
      }}
    >
      {rowLimit && rows.length > rowLimit && (
        <MessageStrip design="Information" hideCloseButton style={{ marginBottom: '8px' }}>
          Showing the first {displayedRows.length} of {rows.length} field details. Import counts and confirmation still use all records.
        </MessageStrip>
      )}

      {rows.length === 0 ? (
        <div className="excel-diff-empty-state">
          <Text>No Excel diff uploaded yet.</Text>
        </div>
      ) : (
        <div className="excel-record-list">
          {groups.map(group => (
            <DiffRecordGroupView key={recordIdentity(group.rows[0])} group={group} statusState={statusState} />
          ))}
        </div>
      )}
    </div>
  )
}

function buildDiffRecordGroups(rows: ExcelDiffRow[]): DiffRecordGroup[] {
  const groups = new Map<string, DiffRecordGroup>()

  rows.forEach(row => {
    const identity = recordIdentity(row)
    const status = normalizeDiffStatus(row.status || 'OTHER')
    const existing = groups.get(identity)

    if (existing) {
      existing.rows.push(row)
      if (!existing.statuses.includes(status)) existing.statuses.push(status)
      existing.status = getRecordGroupStatus(existing.statuses)
      return
    }

    groups.set(identity, {
      recordKey: row.record_key,
      rows: [row],
      status,
      statuses: [status]
    })
  })

  return Array.from(groups.values())
}

function getRecordGroupStatus(statuses: string[]): string {
  const priority = ['ERROR', 'DELETE', 'DELETED', 'CHANGED', 'NEW', 'WARNING', 'UNCHANGED', 'INFO', 'OTHER']
  const rank = (status: string) => {
    const index = priority.indexOf(status)
    return index === -1 ? priority.length : index
  }
  return [...statuses].sort((left, right) => rank(left) - rank(right))[0] || 'OTHER'
}

function DiffRecordGroupView({
  group,
  statusState
}: {
  group: DiffRecordGroup
  statusState: (status: string) => 'Positive' | 'Critical' | 'Negative' | 'Information' | 'None'
}) {
  const isDelete = isDeleteDiffStatus(group.status)
  const fieldCount = group.rows.length
  const statusClass = diffRowClass(group.status)
  const sourceRows = Array.from(new Set(group.rows.map(row => row.row_no))).join(', ')

  return (
    <article className={`excel-record-group ${statusClass}`}>
      <header className="excel-record-group-header">
        <div className="excel-record-group-heading">
          <span className="excel-record-group-status">
            <ObjectStatus state={statusState(group.status)}>
              {group.status || 'OTHER'}
            </ObjectStatus>
          </span>
          <strong className="excel-record-group-key">
            {formatDiffRecordKey(group.recordKey)}
          </strong>
        </div>
        <span className="excel-record-group-count">
          {isDelete
            ? `Excel row ${sourceRows}`
            : `${fieldCount} field${fieldCount === 1 ? '' : 's'} · Excel row ${sourceRows}`}
        </span>
      </header>

      {isDelete ? (
        <DeletedRecordGroup row={group.rows[0]} />
      ) : (
        <RecordFieldGrid group={group} />
      )}
    </article>
  )
}

function RecordFieldGrid({ group }: { group: DiffRecordGroup }) {
  const isNew = normalizeDiffStatus(group.status) === 'NEW'
  const hasMessages = group.rows.some(row => String(row.message || '').trim()) ||
    ['WARNING', 'ERROR'].includes(normalizeDiffStatus(group.status))
  const gridClass = `excel-record-fields${isNew ? ' excel-record-fields--new' : ''}${hasMessages ? ' excel-record-fields--with-messages' : ''}`

  return (
    <div className={gridClass}>
      <div className="excel-record-field-cell excel-record-field-cell--header">Field</div>
      {!isNew && <div className="excel-record-field-cell excel-record-field-cell--header">Old Value</div>}
      <div className="excel-record-field-cell excel-record-field-cell--header">New Value</div>
      {hasMessages && <div className="excel-record-field-cell excel-record-field-cell--header">Message</div>}

      {group.rows.flatMap((row, index) => {
        const rowKey = row.id || `${row.row_no}-${row.field_name}-${index}`
        const cells = [
          <div key={`${rowKey}-field`} className="excel-record-field-cell" data-label="Field">
            <Text className="excel-record-field-text">{getDiffFieldLabel(row)}</Text>
          </div>
        ]

        if (!isNew) {
          cells.push(
            <div key={`${rowKey}-old`} className="excel-record-field-cell" data-label="Old Value">
              <DiffValue row={row} valueKind="old" />
            </div>
          )
        }

        cells.push(
          <div key={`${rowKey}-new`} className="excel-record-field-cell" data-label="New Value">
            <DiffValue row={row} valueKind="new" />
          </div>
        )

        if (hasMessages) {
          cells.push(
            <div key={`${rowKey}-message`} className="excel-record-field-cell" data-label="Message">
              <DiffMessage row={row} />
            </div>
          )
        }

        return cells
      })}
    </div>
  )
}

function DeletedRecordGroup({ row }: { row: ExcelDiffRow }) {
  return (
    <div className="excel-record-delete">
      <div className="excel-record-delete-label">Existing record values</div>
      <div className="excel-record-delete-body">
        <DeletedRecordSummary value={row.old_value} />
        <div className="excel-record-delete-action">
          <div className="excel-record-delete-action-title">
            <Icon name="delete" className="excel-record-delete-action-icon" />
            <span>Record will be deleted</span>
          </div>
          <Text className="excel-record-delete-action-description">
            This record was removed from the uploaded Excel file.
          </Text>
        </div>
      </div>
    </div>
  )
}

function diffRowClass(status: string): string {
  const normalized = normalizeDiffStatus(status)
  return DIFF_STATUS_META[normalized]?.className || ''
}

function getDiffFieldLabel(row: ExcelDiffRow): string {
  if (isDeleteDiffStatus(row.status) && row.field_name === '__ACTION') return 'Record'
  return row.field_name || '-'
}

function formatDiffRecordKey(value: string): string {
  const text = String(value || '').trim()
  if (!text) return '-'

  const parsed = parseDiffRecordValue(text)
  if (!parsed) return text

  const entries = Object.entries(parsed)
    .filter(([, entryValue]) => entryValue != null && String(entryValue).trim() !== '')

  if (entries.length === 0) return '-'
  if (entries.length === 1) return String(entries[0][1])

  return entries
    .map(([key, entryValue]) => `${key}=${String(entryValue)}`)
    .join(', ')
}

function DiffValue({ row, valueKind }: { row: ExcelDiffRow; valueKind: 'old' | 'new' }) {
  if (isDeleteDiffStatus(row.status)) {
    if (valueKind === 'new') {
      return <Text className="excel-diff-cell-text">This record was removed from the uploaded Excel file.</Text>
    }
    return <DeletedRecordSummary value={row.old_value} />
  }

  return <Text className="excel-diff-cell-text">{(valueKind === 'old' ? row.old_value : row.new_value) || '-'}</Text>
}

function DeletedRecordSummary({ value }: { value: string }) {
  const record = parseDiffRecordValue(value)
  if (!record) return <Text>{value || 'Deleted record'}</Text>

  return (
    <div className="excel-record-summary" aria-label="Deleted record values">
      {Object.entries(record).map(([key, entryValue]) => (
        <div className="excel-record-summary-row" key={key}>
          <span className="excel-record-summary-key">{key}</span>
          <span className="excel-record-summary-value">{String(entryValue ?? '') || '-'}</span>
        </div>
      ))}
    </div>
  )
}

function parseDiffRecordValue(value: string): Record<string, unknown> | null {
  const text = String(value || '').trim()
  if (!text.startsWith('{') || !text.endsWith('}')) return null

  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function DiffMessage({ row }: { row: ExcelDiffRow }) {
  const normalized = normalizeDiffStatus(row.status)
  const text = isDeleteDiffStatus(row.status)
    ? 'Record will be deleted'
    : row.message || (normalized === 'CHANGED' ? 'Value changed' : '-')
  const showNote = normalized === 'CHANGED' || normalized === 'WARNING' || normalized === 'ERROR' || isDeleteDiffStatus(row.status)

  if (!showNote) return <Text>{text}</Text>

  return (
    <div className={`excel-diff-note excel-diff-note--${normalized.toLowerCase()}`}>
      <Icon
        name={(normalized === 'ERROR' ? 'message-error' : isDeleteDiffStatus(row.status) ? 'delete' : 'hint') as any}
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
    DELETE: 0,
    DELETED: 0,
    UNCHANGED: 0,
    WARNING: 0,
    ERROR: 0,
    OTHER: 0
  }
  const seenByStatus = new Map<string, Set<string>>()

  rows.forEach(row => {
    const status = normalizeDiffStatus(row.status || 'OTHER')
    if (counts[status] == null) {
      if (!seenByStatus.has('OTHER')) seenByStatus.set('OTHER', new Set())
      const otherRecords = seenByStatus.get('OTHER')!
      const identity = recordIdentity(row)
      if (!otherRecords.has(identity)) {
        otherRecords.add(identity)
        counts.OTHER += 1
      }
      return
    }

    if (!seenByStatus.has(status)) seenByStatus.set(status, new Set())
    const statusRecords = seenByStatus.get(status)!
    const identity = recordIdentity(row)
    if (!statusRecords.has(identity)) {
      statusRecords.add(identity)
      counts[status] += 1
    }
  })
  return counts
}
