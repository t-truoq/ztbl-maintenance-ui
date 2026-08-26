import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  Button,
  FlexBox,
  Icon,
  Input,
  Label,
  MessageStrip,
  ObjectStatus,
  Option,
  Select,
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
  EXCEL_WORKBOOK_STRUCTURE_ERROR_MESSAGE,
  getExcelErrorMessage,
  getExcelFileFormat,
  isExcelConfirmFailure,
  isExcelFilenameAllowed,
  isLikelyExcelWorkbookStructureError,
  uploadExcel
} from '../services/excelPipelineApi'
import type { FieldMeta } from '../types'
import { getUploadedFileFieldOrder } from '../utils/excelImportHeaders'
import { deduplicateExcelMessages, orderExcelPreviewFields } from '../utils/excelPreviewHelpers'
import AppLoadingState from './AppLoadingState'

interface ExcelPipelineTabProps {
  tableName: string
  allFields?: FieldMeta[]
  canUpload?: boolean
  onImported: () => Promise<void> | void
}

type BusyStep = '' | 'downloadTemplate' | 'downloadData' | 'upload' | 'confirm'
type FeedbackDesign = 'Information' | 'Positive' | 'Critical' | 'Negative'

interface ExcelFeedback {
  text: string
  design: FeedbackDesign
}

const MAX_UPLOAD_FILE_BYTES = 12 * 1024 * 1024
const EXCEL_ERROR_IMPORT_MESSAGE = 'ERROR rows will be excluded from import. Review them before confirming the remaining records.'
const EXCEL_ERROR_ACCENT = '#8e44ad'

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
  allFields = [],
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
  const [uploadedFieldOrder, setUploadedFieldOrder] = useState<string[]>([])
  const [confirmResult, setConfirmResult] = useState<ExcelConfirmResult | null>(null)
  const [diffDialogOpen, setDiffDialogOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [backendPermissionDenied, setBackendPermissionDenied] = useState(false)
  const [mainActionFilter, setMainActionFilter] = useState('ALL')
  const [modalActionFilter, setModalActionFilter] = useState('ALL')

  const visibleRows = useMemo(
    () => diffRows.filter(row => row.row_no !== 0 && shouldShowReviewDiffRow(row)),
    [diffRows]
  )
  const excelFieldOrder = useMemo(
    () => [...allFields]
      .sort((left, right) => {
        const leftOrder = left.display_order ?? left.DisplayOrder ?? Number.MAX_SAFE_INTEGER
        const rightOrder = right.display_order ?? right.DisplayOrder ?? Number.MAX_SAFE_INTEGER
        return leftOrder - rightOrder
      })
      .map(field => field.field_name || field.FieldName)
      .filter(Boolean),
    [allFields]
  )
  const previewFieldOrder = uploadedFieldOrder.length > 0 ? uploadedFieldOrder : excelFieldOrder
  const commitRows = useMemo(() => filterDiffForCommit(diffRows, tableName), [diffRows, tableName])
  const visibleRecordCount = useMemo(() => countDistinctRecords(visibleRows), [visibleRows])
  const commitRecordCount = useMemo(() => countDistinctRecords(commitRows), [commitRows])
  const errorRows = useMemo(
    () => diffRows.filter(row => row.status === 'ERROR'),
    [diffRows]
  )
  const errorRecordCount = useMemo(() => countDistinctRecords(errorRows), [errorRows])
  const warningRows = useMemo(
    () => diffRows.filter(row => row.status === 'WARNING'),
    [diffRows]
  )
  const workbookStructureError = useMemo(
    () => isLikelyExcelWorkbookStructureError(diffRows),
    [diffRows]
  )
  const statusCounts = useMemo(() => buildStatusCounts(visibleRows), [visibleRows])
  const approvalPending = confirmResult
    ? isApprovalPendingResult(confirmResult)
    : false

  useEffect(() => {
    setBusyStep('')
    setDiffRows([])
    setFeedback(null)
    setError('')
    setSelectedFileName('')
    setUploadedFieldOrder([])
    setConfirmResult(null)
    setDiffDialogOpen(false)
    setErrorDialogOpen(false)
    setBackendPermissionDenied(false)
    setMainActionFilter('ALL')
    setModalActionFilter('ALL')
  }, [tableName])

  const uploadAllowed = canUpload && !backendPermissionDenied

  useEffect(() => {
    if (canUpload) return
    setDiffRows([])
    setFeedback(null)
    setError('')
    setConfirmResult(null)
    setSelectedFileName('')
    setUploadedFieldOrder([])
    setDiffDialogOpen(false)
  }, [canUpload])

  useEffect(() => {
    if (!backendPermissionDenied) return
    setDiffRows([])
    setSelectedFileName('')
    setUploadedFieldOrder([])
    setDiffDialogOpen(false)
  }, [backendPermissionDenied])

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
    if (!uploadAllowed) {
      const message = 'You do not have permission to upload data.'
      setError(message)
      return
    }
    uploadInFlightRef.current = true
    resetFeedback()
    setDiffRows([])
    setUploadedFieldOrder([])
    setSelectedFileName(file.name)
    setBusyStep('upload')

    try {
      await waitForBrowserPaint()

      const fileFormat = getExcelFileFormat(file.name)
      if (!fileFormat) {
        throw new Error('Unsupported file extension. Please upload .xlsx, .csv, .tsv, .json, .jsonl, or .ndjson.')
      }

      if (!isExcelFilenameAllowed(file.name, tableName)) {
        throw new Error(`Please select a supported ${tableName} import file.`)
      }

      if (file.size > MAX_UPLOAD_FILE_BYTES) {
        throw new Error(
          `The selected workbook is too large (${formatFileSize(file.size)}). Please upload a file smaller than ${formatFileSize(MAX_UPLOAD_FILE_BYTES)}.`
        )
      }

      setUploadedFieldOrder(await getUploadedFileFieldOrder(file, fileFormat))

      const base64 = await fileToBase64(file)
      console.debug('[ExcelPipeline] file encoded', {
        fileName: file.name,
        fileSize: file.size,
        base64Length: base64.length
      })

      const rows = await uploadExcel(tableName, file.name, fileFormat, base64)
      const commitRows = filterDiffForCommit(rows, tableName)
      const visibleRows = rows.filter(row => !(row.row_no === 0 || row.status === 'INFO'))
      const commitCount = commitRows.length
      const commitRecordCount = countDistinctRecords(commitRows)
      const visibleCount = visibleRows.length
      const visibleRecordCount = countDistinctRecords(visibleRows)
      const errorCount = countDistinctRecords(rows.filter(row => row.status === 'ERROR'))
      const permissionError = rows.find(row => isPermissionMessage(row.message))
      if (permissionError) {
        setBackendPermissionDenied(true)
      }
      const warningCount = rows.filter(row => row.status === 'WARNING').length
      const unchangedCount = rows.filter(row => row.status === 'UNCHANGED').length
      setDiffRows(compactRowsForUi(rows))
      const hasWorkbookStructureError = isLikelyExcelWorkbookStructureError(rows)
      if (hasWorkbookStructureError) {
        setFeedback(null)
      } else if (visibleRecordCount > 0 && unchangedCount === visibleCount && commitCount === 0 && errorCount === 0) {
        setFeedback({
          text: 'No changes detected. The uploaded file matches the current table data.',
          design: 'Positive'
        })
      } else if (warningCount > 0 && commitCount === 0 && errorCount === 0) {
        setFeedback({
          text: `Upload checked ${formatCount(visibleRecordCount, 'record')} across ${formatCount(visibleCount, 'detail row')}. ${formatCount(warningCount, 'warning')} from unchanged exported values can be ignored.`,
          design: 'Critical'
        })
      } else if (errorCount > 0) {
        setFeedback({
          text: `Upload checked ${formatCount(visibleRecordCount, 'record')} across ${formatCount(visibleCount, 'detail row')}. ${EXCEL_ERROR_IMPORT_MESSAGE}`,
          design: 'Critical'
        })
      } else {
        const importReadiness = commitRecordCount === visibleRecordCount
          ? commitRecordCount === 1
            ? 'The record is ready to import.'
            : `All ${formatCount(commitRecordCount, 'record')} are ready to import.`
          : `${formatCount(commitRecordCount, 'record')} of ${visibleRecordCount} are ready to import.`
        setFeedback({
          text: `Upload ready: ${formatCount(visibleRecordCount, 'record')} across ${formatCount(visibleCount, 'detail row')}. ${importReadiness}`,
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
      if (isPermissionMessage(msg)) setBackendPermissionDenied(true)
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
    if (busy || !uploadAllowed || uploadInFlightRef.current) return
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
    if (file && !busy && uploadAllowed) {
      processFile(file)
    }
  }

  async function handleConfirm() {
    if (!uploadAllowed) {
      const message = 'You do not have permission to upload data.'
      setError(message)
      return
    }
    resetFeedback()
    setBusyStep('confirm')

    try {
      const confirmStartedAt = performance.now()
      const result = await confirmImport(tableName, diffRows)
      const confirmFailed = isExcelConfirmFailure(result)
      if (isPermissionMessage(result.message)) {
        setBackendPermissionDenied(true)
      }
      setConfirmResult(result)
      setFeedback({
        text: buildConfirmFeedbackText(result),
        design: confirmFailed ? 'Negative' : 'Positive'
      })
      console.debug('[ExcelPipeline] confirm completed', {
        ...result,
        durationMs: Math.round(performance.now() - confirmStartedAt)
      })

      // Do not keep the confirmation modal blocked by the parent table refresh.
      // The import response is authoritative; the refreshed table can update in
      // the background without making a successful confirm look slow or failed.
      void Promise.resolve()
        .then(() => onImported())
        .catch(refreshError => {
          console.error('[ExcelPipeline] table refresh after confirm failed', refreshError)
        })
    } catch (e: any) {
      const msg = getExcelErrorMessage(e)
      if (isPermissionMessage(msg)) setBackendPermissionDenied(true)
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
  const canReview = uploadAllowed && visibleRows.length > 0 && !busy && !confirmResult
  const canConfirm = uploadAllowed && commitRows.length > 0 && !busy && !confirmResult
  const hasErrors = errorRecordCount > 0
  const noChangesDetected = visibleRows.length > 0 && commitRows.length === 0 && !hasErrors
  const confirmLabel = noChangesDetected ? 'Nothing to Import' : `Confirm Import (${commitRecordCount})`

  return (
    <div className="tab-panel-form excel-workspace">
      <section className="tab-panel-header excel-hero">
        <div className="tab-panel-title-block excel-hero-copy">
          <Title level="H4" className="tab-panel-title excel-title">Excel Import / Export</Title>
          <Text className="tab-panel-subtitle excel-muted excel-subtitle">
            Export table data, upload the edited workbook, review the diff, then confirm the import.
          </Text>
          {workbookStructureError && <WorkbookStructureNotice />}
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
        <FlowStep index="2" title="Upload" text="Drop an edited XLSX, CSV, TSV, JSON, JSONL, or NDJSON file." active={busyStep === 'upload'} />
        <FlowStep index="3" title="Review" text="Check NEW, CHANGED, UNCHANGED, WARNING, and ERROR rows." active={diffRows.length > 0 && !confirmResult} />
        <FlowStep
          index="4"
          title={approvalPending ? 'Waiting for ADMIN approval' : 'Confirm'}
          text={approvalPending ? 'The approval request is waiting for ADMIN approval.' : 'Commit NEW, CHANGED, and DELETED records.'}
          active={!!confirmResult}
        />
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.csv,.tsv,.json,.jsonl,.ndjson,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,application/json,text/tab-separated-values"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />

      <section className="excel-action-grid">
        {!uploadAllowed && (
          <MessageStrip design="Negative" hideCloseButton className="excel-permission-message">
            You do not have permission to upload data.
          </MessageStrip>
        )}
        <div
          className={`excel-dropzone${dragActive ? ' excel-dropzone--active' : ''}`}
          onDragOver={event => {
            event.preventDefault()
            if (!busy && uploadAllowed) setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={uploadAllowed ? 0 : -1}
          aria-disabled={!uploadAllowed}
          onKeyDown={event => {
            if ((event.key === 'Enter' || event.key === ' ') && !busy && uploadAllowed) {
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
            disabled={busy || !uploadAllowed}
            onClick={handleBrowseClick}
          >
            Browse
          </Button>
        </div>

        <div className="excel-summary-card">
          <div className="excel-summary-header">
            <Text className="excel-label">Current Session</Text>
            <ObjectStatus state={approvalPending ? 'Information' : hasErrors ? 'Negative' : commitRows.length > 0 ? 'Information' : 'None'}>
              {approvalPending ? 'Waiting for ADMIN approval' : hasErrors ? 'Needs attention' : commitRows.length > 0 ? 'Ready to review' : noChangesDetected ? 'No changes' : 'Waiting for upload'}
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
            errorCount={errorRecordCount}
          />
          {approvalPending && (
            <MessageStrip design="Information" hideCloseButton>
              Waiting for ADMIN approval. The Excel changes will be applied after approval.
            </MessageStrip>
          )}
          <Text className="excel-summary-note">Counts are by record; the table below shows field-level details.</Text>
        </div>
      </section>

      {busy && (
        <AppLoadingState label={busyLabel(busyStep)} variant="inline" />
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

      {!workbookStructureError && (
        <DiffTable
          rows={visibleRows}
          fieldOrder={previewFieldOrder}
          exactFieldOrder={uploadedFieldOrder.length > 0}
          statusState={statusState}
          includeAllStatuses
          activeActionFilter={mainActionFilter}
          onActionFilterChange={setMainActionFilter}
        />
      )}

      <ModernModal
        open={diffDialogOpen}
        title={confirmResult ? 'Excel Import' : 'Excel Diff Preview'}
        onClose={() => setDiffDialogOpen(false)}
        closeOnBackdrop={!busy}
        width={confirmResult ? 'min(92vw, 460px)' : 'min(96vw, 1180px)'}
        footer={
          confirmResult ? (
            <Button
              className="excel-result-done-button"
              design="Emphasized"
              onClick={() => setDiffDialogOpen(false)}
            >
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

            {busyStep === 'confirm' && (
              <MessageStrip design="Information" hideCloseButton>
                Confirming the Excel import. If this table requires approval, the request will remain waiting for ADMIN approval.
              </MessageStrip>
            )}

            <StatusSummary
              total={visibleRecordCount}
              commit={commitRecordCount}
              statusCounts={statusCounts}
              errorCount={errorRecordCount}
              activeFilter={modalActionFilter}
              onFilterChange={setModalActionFilter}
            />
            <Text className="excel-summary-note">Counts are by record; the table below shows field-level details.</Text>

            {noChangesDetected && (
              <MessageStrip design="Positive" hideCloseButton>
                No changes detected. The uploaded file matches the current table data.
              </MessageStrip>
            )}

            {hasErrors && (
              <MessageStrip design="Negative" hideCloseButton className="excel-error-import-notice">
                {EXCEL_ERROR_IMPORT_MESSAGE}
              </MessageStrip>
            )}

            {warningRows.length > 0 && !hasErrors && (
              <MessageStrip design="Critical" hideCloseButton>
                Existing exported values raised warnings, but unchanged warning rows will not be sent to confirm.
              </MessageStrip>
            )}

            {workbookStructureError ? (
              <WorkbookStructureNotice compact />
            ) : (
              <DiffTable
                rows={visibleRows}
                fieldOrder={previewFieldOrder}
                exactFieldOrder={uploadedFieldOrder.length > 0}
                statusState={statusState}
                compact
                includeAllStatuses
                activeActionFilter={modalActionFilter}
                onActionFilterChange={setModalActionFilter}
              />
            )}
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
  return rows
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.ceil(bytes / 1024)} KB`
  return `${bytes} bytes`
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function isApprovalPendingResult(result: ExcelConfirmResult): boolean {
  if (isExcelConfirmFailure(result)) return false
  return parseImportResultMessage(result.message || '').pendingApproval
}

function buildConfirmFeedbackText(result: ExcelConfirmResult): string {
  const hasErrors = isExcelConfirmFailure(result)
  const pendingApproval = isApprovalPendingResult(result)
  if (hasErrors) {
    return result.message || 'Import failed. Review the result details.'
  }
  if (pendingApproval) {
    return 'Approval request submitted successfully. Waiting for ADMIN approval.'
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

function WorkbookStructureNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ padding: compact ? '0 1rem 1rem' : undefined }}>
      <MessageStrip design="Negative" hideCloseButton>
        <strong>Workbook structure is invalid.</strong> {EXCEL_WORKBOOK_STRUCTURE_ERROR_MESSAGE}
      </MessageStrip>
      <Text className="excel-summary-note" style={{ display: 'block', marginTop: '8px' }}>
        The backend returned cascading row errors, so the detailed diff is hidden. No import was submitted.
      </Text>
    </div>
  )
}

function ExcelImportResultSummary({ result }: { result: ExcelConfirmResult | null }) {
  const parsed = parseImportResultMessage(result?.message || '')
  const hasErrors = isExcelConfirmFailure(result)
  const tone = hasErrors ? 'error' : parsed.pendingApproval ? 'approval' : 'success'
  const statusText = hasErrors
    ? 'Import failed'
    : parsed.pendingApproval
      ? 'Waiting for ADMIN approval'
      : 'Import completed'
  const statusDescription = parsed.description || (
    hasErrors
      ? 'The import finished with errors. Review the details and try again.'
      : parsed.pendingApproval
      ? 'Your changes were submitted successfully and are waiting for ADMIN approval.'
        : 'Your changes were imported successfully.'
  )
  const iconName = hasErrors ? 'message-error' : parsed.pendingApproval ? 'message-information' : 'message-success'
  const showDescription = hasErrors || parsed.pendingApproval

  return (
    <div className={`excel-result-panel excel-result-panel--${tone}`}>
      <div className="excel-result-hero">
        <div className="excel-result-hero-icon" aria-hidden="true">
          <Icon name={iconName as any} />
        </div>
        <div className="excel-result-hero-copy">
          <Title level="H3" className="excel-result-title">{statusText}</Title>
          {showDescription && (
            <Text className="excel-result-description">{statusDescription}</Text>
          )}
        </div>
      </div>

      {(parsed.approvalId || parsed.rowNo) && (
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
  pendingApproval: boolean
  rowNo: string
  fallback: string
} {
  const text = String(message || '').trim()
  const rowNo = text.match(/^Row\s+(\d+):/i)?.[1] || ''
  const approvalId = text.match(/Approval request submitted\s*\(ID:\s*([^)]+)\)/i)?.[1] || ''
  const pendingApproval = Boolean(approvalId) || /(?:waiting for(?: ADMIN)? approval|submitted for approval|request submitted for approval)/i.test(text)

  if (pendingApproval) {
    return {
      title: 'Approval request submitted',
      description: 'Your Excel import was submitted successfully and is now waiting for ADMIN approval.',
      approvalId,
      pendingApproval,
      rowNo,
      fallback: ''
    }
  }

  if (/no valid excel row/i.test(text) || /cannot create a new request/i.test(text)) {
    return {
      title: 'Import failed',
      description: 'No valid Excel rows were submitted. Review skipped rows and approval locks.',
      approvalId: '',
      pendingApproval,
      rowNo,
      fallback: text
    }
  }

  return {
    title: text || 'Import completed',
    description: '',
    approvalId: '',
    pendingApproval,
    rowNo,
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
      className="excel-modern-modal-backdrop"
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
        className="excel-modern-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={event => event.stopPropagation()}
        style={{
          width,
          ['--excel-modal-width' as any]: width,
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
          className="excel-modern-modal-body"
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
            className="excel-modern-modal-footer"
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
  statusCounts,
  errorCount,
  activeFilter = 'ALL',
  onFilterChange
}: {
  total: number
  commit: number
  statusCounts: Record<string, number>
  errorCount: number
  activeFilter?: string
  onFilterChange?: (filter: string) => void
}) {
  const items = [
    { label: 'Total records', filterKey: 'ALL', value: total, accent: '#5b738b' },
    { label: 'New', filterKey: 'CREATE', value: statusCounts.NEW, accent: '#107e3e' },
    { label: 'Updated', filterKey: 'UPDATE', value: statusCounts.CHANGED, accent: '#e09d00' },
    { label: 'Deleted', filterKey: 'DELETE', value: (statusCounts.DELETE ?? 0) + (statusCounts.DELETED ?? 0), accent: '#bb0000' },
    { label: 'Unchanged', filterKey: 'UNCHANGED', value: statusCounts.UNCHANGED ?? 0, accent: '#7f8c8d' },
    { label: 'Errors', filterKey: 'ERROR', value: errorCount, accent: EXCEL_ERROR_ACCENT },
    { label: 'Commit records', filterKey: 'ALL', value: commit, accent: '#0a6ed1' }
  ]
  const additionalItems = [
    { label: 'Warnings', filterKey: 'WARNING', value: statusCounts.WARNING ?? 0, tone: 'warning' }
  ].filter(item => item.value > 0)

  return (
    <>
      <div className="excel-status-summary">
        {items.map(item => {
          const isSelected = Boolean(onFilterChange && activeFilter === item.filterKey)
          return (
            <div
              key={item.label}
              className={`excel-status-card${onFilterChange ? ' excel-status-card--clickable' : ''}${isSelected ? ' excel-status-card--selected' : ''}`}
              style={{
                borderLeftColor: item.accent,
                cursor: onFilterChange ? 'pointer' : 'default'
              }}
              onClick={() => onFilterChange?.(item.filterKey)}
              role={onFilterChange ? 'button' : undefined}
              tabIndex={onFilterChange ? 0 : undefined}
              onKeyDown={e => {
                if (onFilterChange && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  onFilterChange(item.filterKey)
                }
              }}
            >
              <span className="excel-status-label">
                {item.label}
              </span>
              <span className="excel-status-value">
                {item.value ?? 0}
              </span>
            </div>
          )
        })}
      </div>
      {additionalItems.length > 0 && (
        <div className="excel-status-secondary">
          {additionalItems.map(item => (
            <span
              key={item.label}
              className={`excel-status-secondary-item excel-status-secondary-item--${item.tone}`}
              style={{ cursor: onFilterChange ? 'pointer' : 'default' }}
              onClick={() => onFilterChange?.(item.filterKey)}
            >
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

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200, 500]

function DiffTable({
  rows,
  fieldOrder,
  exactFieldOrder,
  statusState,
  compact = false,
  includeAllStatuses = false,
  activeActionFilter,
  onActionFilterChange
}: {
  rows: ExcelDiffRow[]
  fieldOrder: string[]
  exactFieldOrder: boolean
  statusState: (status: string) => 'Positive' | 'Critical' | 'Negative' | 'Information' | 'None'
  compact?: boolean
  includeAllStatuses?: boolean
  activeActionFilter?: string
  onActionFilterChange?: (filter: string) => void
}) {
  const [internalActionFilter, setInternalActionFilter] = useState<string>('ALL')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [pageSize, setPageSize] = useState<number>(50)
  const [pageIndex, setPageIndex] = useState<number>(0)
  const [pageJumpInput, setPageJumpInput] = useState<string>('1')

  const currentActionFilter = activeActionFilter !== undefined ? activeActionFilter : internalActionFilter
  const handleSetActionFilter = (filter: string) => {
    if (onActionFilterChange) {
      onActionFilterChange(filter)
    } else {
      setInternalActionFilter(filter)
    }
    setPageIndex(0)
  }

  const changedRows = useMemo(() => {
    return rows.filter(row => includeAllStatuses
      ? ['NEW', 'CHANGED', 'DELETE', 'DELETED', 'UNCHANGED', 'INFO', 'WARNING', 'ERROR'].includes(normalizeDiffStatus(row.status))
      : isActionableDiffStatus(row.status)
    )
  }, [rows, includeAllStatuses])

  const allGroups = useMemo(() => buildDiffRecordGroups(changedRows), [changedRows])

  // Count distinct records for each action type
  const actionCounts = useMemo(() => {
    const counts = {
      ALL: allGroups.length,
      CREATE: 0,
      UPDATE: 0,
      DELETE: 0,
      UNCHANGED: 0,
      ERROR: 0,
      WARNING: 0
    }
    allGroups.forEach(group => {
      const act = formatGroupAction(group)
      const norm = normalizeDiffStatus(group.status)
      const isError = act === 'Error' || norm === 'ERROR' || group.statuses.includes('ERROR') || group.rows.some(r => normalizeDiffStatus(r.status) === 'ERROR')
      if (isError) {
        counts.ERROR += 1
      } else if (act === 'Create' || norm === 'NEW') {
        counts.CREATE += 1
      } else if (act === 'Update' || norm === 'CHANGED') {
        counts.UPDATE += 1
      } else if (act === 'Delete' || isDeleteDiffStatus(group.status)) {
        counts.DELETE += 1
      } else if (norm === 'WARNING' || group.statuses.includes('WARNING')) {
        counts.WARNING += 1
      } else {
        counts.UNCHANGED += 1
      }
    })
    return counts
  }, [allGroups])

  // Filter groups by Action filter and search query
  const filteredGroups = useMemo(() => {
    return allGroups.filter(group => {
      if (currentActionFilter !== 'ALL') {
        const act = formatGroupAction(group)
        const norm = normalizeDiffStatus(group.status)
        const isError = act === 'Error' || norm === 'ERROR' || group.statuses.includes('ERROR') || group.rows.some(r => normalizeDiffStatus(r.status) === 'ERROR')
        if (currentActionFilter === 'ERROR' && !isError) return false
        if (currentActionFilter === 'CREATE' && !(!isError && (act === 'Create' || norm === 'NEW'))) return false
        if (currentActionFilter === 'UPDATE' && !(!isError && (act === 'Update' || norm === 'CHANGED'))) return false
        if (currentActionFilter === 'DELETE' && !(!isError && (act === 'Delete' || isDeleteDiffStatus(group.status)))) return false
        if (currentActionFilter === 'WARNING' && !(!isError && (norm === 'WARNING' || group.statuses.includes('WARNING')))) return false
        if (currentActionFilter === 'UNCHANGED' && !(!isError && (norm === 'UNCHANGED' || norm === 'INFO' || act === 'Skip' || act === 'Unchanged'))) return false
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const keyMatch = String(group.recordKey || '').toLowerCase().includes(q)
        const rowMatch = group.rows.some(r =>
          String(r.row_no).includes(q) ||
          String(r.field_name || '').toLowerCase().includes(q) ||
          String(r.old_value || '').toLowerCase().includes(q) ||
          String(r.new_value || '').toLowerCase().includes(q) ||
          String(r.message || '').toLowerCase().includes(q)
        )
        if (!keyMatch && !rowMatch) return false
      }

      return true
    })
  }, [allGroups, currentActionFilter, searchQuery])

  const totalRecords = filteredGroups.length
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize))
  const safePageIndex = Math.min(pageIndex, totalPages - 1)
  const pageStart = totalRecords === 0 ? 0 : safePageIndex * pageSize + 1
  const pageEnd = Math.min((safePageIndex + 1) * pageSize, totalRecords)

  const displayedGroups = useMemo(() => {
    return filteredGroups.slice(safePageIndex * pageSize, (safePageIndex + 1) * pageSize)
  }, [filteredGroups, safePageIndex, pageSize])

  const fieldColumns = useMemo(() => {
    return getDiffFieldColumns(allGroups, fieldOrder, exactFieldOrder)
  }, [allGroups, fieldOrder, exactFieldOrder])

  const listShellRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    setPageJumpInput(String(safePageIndex + 1))
  }, [safePageIndex])

  useEffect(() => {
    setPageIndex(0)
  }, [currentActionFilter, searchQuery, pageSize])

  useEffect(() => {
    const shell = listShellRef.current
    if (!shell) return undefined

    const resetHorizontalScroll = () => {
      shell.scrollLeft = 0
    }

    resetHorizontalScroll()
    const resizeObserver = new ResizeObserver(resetHorizontalScroll)
    resizeObserver.observe(shell)

    return () => resizeObserver.disconnect()
  }, [compact, displayedGroups.length, fieldColumns.length, safePageIndex])

  return (
    <div className="excel-diff-container" style={{ width: '100%' }}>
      {/* ── Toolbar Lọc Action & Tìm kiếm ── */}
      <div className="excel-diff-toolbar">
        <div className="excel-diff-filter-group" role="tablist" aria-label="Filter by action">
          <button
            type="button"
            className={`excel-diff-filter-pill${currentActionFilter === 'ALL' ? ' excel-diff-filter-pill--active' : ''}`}
            onClick={() => handleSetActionFilter('ALL')}
          >
            All <span className="excel-diff-filter-count">{actionCounts.ALL.toLocaleString()}</span>
          </button>
          {actionCounts.CREATE > 0 && (
            <button
              type="button"
              className={`excel-diff-filter-pill excel-diff-filter-pill--new${currentActionFilter === 'CREATE' ? ' excel-diff-filter-pill--active' : ''}`}
              onClick={() => handleSetActionFilter('CREATE')}
            >
              Create <span className="excel-diff-filter-count">{actionCounts.CREATE.toLocaleString()}</span>
            </button>
          )}
          {actionCounts.UPDATE > 0 && (
            <button
              type="button"
              className={`excel-diff-filter-pill excel-diff-filter-pill--changed${currentActionFilter === 'UPDATE' ? ' excel-diff-filter-pill--active' : ''}`}
              onClick={() => handleSetActionFilter('UPDATE')}
            >
              Update <span className="excel-diff-filter-count">{actionCounts.UPDATE.toLocaleString()}</span>
            </button>
          )}
          {actionCounts.DELETE > 0 && (
            <button
              type="button"
              className={`excel-diff-filter-pill excel-diff-filter-pill--deleted${currentActionFilter === 'DELETE' ? ' excel-diff-filter-pill--active' : ''}`}
              onClick={() => handleSetActionFilter('DELETE')}
            >
              Delete <span className="excel-diff-filter-count">{actionCounts.DELETE.toLocaleString()}</span>
            </button>
          )}
          {actionCounts.UNCHANGED > 0 && (
            <button
              type="button"
              className={`excel-diff-filter-pill${currentActionFilter === 'UNCHANGED' ? ' excel-diff-filter-pill--active' : ''}`}
              onClick={() => handleSetActionFilter('UNCHANGED')}
            >
              Unchanged <span className="excel-diff-filter-count">{actionCounts.UNCHANGED.toLocaleString()}</span>
            </button>
          )}
          {actionCounts.ERROR > 0 && (
            <button
              type="button"
              className={`excel-diff-filter-pill excel-diff-filter-pill--error${currentActionFilter === 'ERROR' ? ' excel-diff-filter-pill--active' : ''}`}
              onClick={() => handleSetActionFilter('ERROR')}
            >
              Errors <span className="excel-diff-filter-count">{actionCounts.ERROR.toLocaleString()}</span>
            </button>
          )}
          {actionCounts.WARNING > 0 && (
            <button
              type="button"
              className={`excel-diff-filter-pill excel-diff-filter-pill--changed${currentActionFilter === 'WARNING' ? ' excel-diff-filter-pill--active' : ''}`}
              onClick={() => handleSetActionFilter('WARNING')}
            >
              Warnings <span className="excel-diff-filter-count">{actionCounts.WARNING.toLocaleString()}</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Input
            placeholder="Search in diff..."
            value={searchQuery}
            onInput={(e: any) => setSearchQuery(e.target.value)}
            icon={<Icon name={'search' as any} />}
            style={{ width: '220px' }}
          />
          {searchQuery && (
            <Button
              design="Transparent"
              icon={'decline' as any}
              onClick={() => setSearchQuery('')}
            />
          )}
        </div>
      </div>

      {/* ── Bảng dữ liệu Grid ── */}
      <div
        ref={listShellRef}
        className={`excel-record-list-shell${compact ? ' excel-record-list-shell--compact' : ''}`}
        style={{
          maxHeight: compact ? 'min(50vh, 520px)' : undefined,
          padding: compact ? 0 : '0 0 1rem',
          scrollbarGutter: compact ? 'stable' : undefined
        }}
      >
        {displayedGroups.length === 0 ? (
          <div className="excel-diff-empty-state" style={{ padding: '2rem', textAlign: 'center' }}>
            <Text>No Excel review rows match the current filter.</Text>
            {(currentActionFilter !== 'ALL' || searchQuery) && (
              <div style={{ marginTop: '0.75rem' }}>
                <Button
                  design="Transparent"
                  onClick={() => {
                    handleSetActionFilter('ALL')
                    setSearchQuery('')
                  }}
                >
                  Reset filters
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="excel-diff-table" role="table" aria-label="Excel review records">
            <div
              className="excel-diff-table-row excel-diff-table-row--header"
              role="row"
              style={{ gridTemplateColumns: diffTableGridTemplate(fieldColumns.length) }}
            >
              <div className="excel-diff-table-cell excel-diff-table-cell--flag" role="columnheader">Action</div>
              <div className="excel-diff-table-cell" role="columnheader">Excel row</div>
              {fieldColumns.map(field => (
                <div className="excel-diff-table-cell" role="columnheader" key={field}>{field}</div>
              ))}
              <div className="excel-diff-table-cell" role="columnheader">Message</div>
            </div>
            {displayedGroups.map(group => {
              const status = normalizeDiffStatus(group.status)
              const isError = status === 'ERROR' || group.statuses.includes('ERROR') || group.rows.some(r => normalizeDiffStatus(r.status) === 'ERROR')
              const statusClass = diffRowClass(status)
              const rowKey = recordIdentity(group.rows[0])

              return (
                <div
                  className={`excel-diff-table-row ${statusClass}`}
                  role="row"
                  key={rowKey}
                  style={{ gridTemplateColumns: diffTableGridTemplate(fieldColumns.length) }}
                >
                  <div className="excel-diff-table-cell excel-diff-table-cell--flag" role="cell" data-label="Action">
                    <Icon name={isError ? 'error' : 'flag'} className="excel-diff-flag-icon" />
                    <ObjectStatus state={isError ? 'Negative' : statusState(status)}>{formatGroupAction(group)}</ObjectStatus>
                  </div>
                  <div className="excel-diff-table-cell excel-diff-table-cell--record" role="cell" data-label="Excel row">
                    {Array.from(new Set(group.rows.map(row => row.row_no))).join(', ')}
                  </div>
                  {fieldColumns.map(field => (
                    <DiffSpreadsheetFieldCell key={`${rowKey}-${field}`} group={group} field={field} />
                  ))}
                  <div className="excel-diff-table-cell" role="cell" data-label="Message">
                    <DiffSpreadsheetMessage group={group} fields={fieldColumns} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Thanh Phân trang (Pagination) ── */}
      {totalRecords > 0 && (
        <div className="excel-diff-pagination-bar">
          <div className="excel-diff-pagination-info">
            Showing <strong>{pageStart.toLocaleString()}</strong> – <strong>{pageEnd.toLocaleString()}</strong> of <strong>{totalRecords.toLocaleString()}</strong> records
            {totalRecords !== allGroups.length && (
              <span> (filtered from {allGroups.length.toLocaleString()} total)</span>
            )}
          </div>

          <div className="excel-diff-pagination-controls">
            <Label style={{ fontSize: '0.8125rem' }}>Rows:</Label>
            <Select
              value={String(pageSize)}
              onChange={(e: any) => {
                const newSize = Number(e.detail.selectedOption.value)
                setPageSize(newSize)
                setPageIndex(0)
              }}
              style={{ minWidth: '70px' }}
            >
              {PAGE_SIZE_OPTIONS.map(size => (
                <Option key={size} value={String(size)}>{size}</Option>
              ))}
            </Select>

            <Button
              design="Transparent"
              icon={'collapse-group' as any}
              disabled={safePageIndex === 0}
              onClick={() => setPageIndex(0)}
              accessibleName="First page"
            />
            <Button
              design="Transparent"
              icon={'navigation-left-arrow' as any}
              disabled={safePageIndex === 0}
              onClick={() => setPageIndex(prev => Math.max(0, prev - 1))}
              accessibleName="Previous page"
            />

            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', margin: '0 4px' }}>
              <span>Page</span>
              <Input
                value={pageJumpInput}
                onInput={(e: any) => setPageJumpInput(e.target.value)}
                onKeyDown={(e: any) => {
                  if (e.key === 'Enter') {
                    const target = parseInt(pageJumpInput, 10)
                    if (!isNaN(target) && target >= 1 && target <= totalPages) {
                      setPageIndex(target - 1)
                    } else {
                      setPageJumpInput(String(safePageIndex + 1))
                    }
                  }
                }}
                style={{ width: '48px', textAlign: 'center' }}
              />
              <span>of <strong>{totalPages}</strong></span>
            </span>

            <Button
              design="Transparent"
              icon={'navigation-right-arrow' as any}
              disabled={safePageIndex >= totalPages - 1}
              onClick={() => setPageIndex(prev => Math.min(totalPages - 1, prev + 1))}
              accessibleName="Next page"
            />
            <Button
              design="Transparent"
              icon={'expand-group' as any}
              disabled={safePageIndex >= totalPages - 1}
              onClick={() => setPageIndex(totalPages - 1)}
              accessibleName="Last page"
            />
          </div>
        </div>
      )}
    </div>
  )
}

function isActionableDiffStatus(status: string): boolean {
  return ['NEW', 'CHANGED', 'DELETE', 'DELETED', 'ERROR'].includes(normalizeDiffStatus(status))
}

function diffTableGridTemplate(fieldCount: number): string {
  return `minmax(8rem, 0.8fr) minmax(7.5rem, 0.75fr) repeat(${fieldCount}, minmax(8.5rem, 1fr)) minmax(12rem, 1.3fr)`
}

function getDiffFieldColumns(
  groups: DiffRecordGroup[],
  preferredOrder: string[],
  exactPreferredOrder: boolean
): string[] {
  const fields: string[] = []

  groups.forEach(group => {
    group.rows.forEach(row => {
      fields.push(getDiffFieldLabel(row))
    })
    if (isDeleteDiffStatus(group.status)) {
      const deletedRecord = parseDiffRecordValue(group.rows[0]?.old_value)
      fields.push(...Object.keys(deletedRecord || {}))
    }
  })
  return orderExcelPreviewFields(fields, preferredOrder, exactPreferredOrder)
}

function formatGroupAction(group: DiffRecordGroup): string {
  const groupStatus = normalizeDiffStatus(group.status)
  if (groupStatus === 'ERROR' || group.statuses.includes('ERROR') || group.rows.some(r => normalizeDiffStatus(r.status) === 'ERROR')) {
    return 'Error'
  }
  const actionRow = group.rows.find(row => String(row.field_name || '').trim().toUpperCase() === 'ACTION')
  const rawAction = String(actionRow?.new_value || actionRow?.old_value || '').trim().toUpperCase()
  if (rawAction === 'U' || rawAction === 'UPDATE') return 'Update'
  if (rawAction === 'C' || rawAction === 'CREATE') return 'Create'
  if (rawAction === 'D' || rawAction === 'DELETE') return 'Delete'
  if (groupStatus === 'CHANGED') return 'Update'
  if (isDeleteDiffStatus(group.status)) return 'Delete'
  if (groupStatus === 'NEW') return 'Create'
  return 'Skip'
}

function DiffSpreadsheetFieldCell({ group, field }: { group: DiffRecordGroup; field: string }) {
  const row = group.rows.find(item => getDiffFieldLabel(item) === field)
  const deletedRecord = isDeleteDiffStatus(group.status)
    ? parseDiffRecordValue(group.rows[0]?.old_value)
    : null

  if (deletedRecord && Object.prototype.hasOwnProperty.call(deletedRecord, field)) {
    const deletedValue = field === 'ACTION' && isDeleteDiffStatus(group.status) && !String(deletedRecord[field] ?? '').trim()
      ? 'D'
      : deletedRecord[field]
    return (
      <div className="excel-diff-table-cell" role="cell" data-label={field}>
        <Text className="excel-diff-cell-text">{formatSpreadsheetFieldValue(field, deletedValue)}</Text>
      </div>
    )
  }

  if (!row) {
    const value = field === 'ACTION' && isDeleteDiffStatus(group.status)
      ? formatExcelAction('D')
      : isUpdateActionGroup(group)
        ? '-'
        : '-'
    return (
      <div className="excel-diff-table-cell" role="cell" data-label={field}>
        <Text className="excel-diff-cell-text">{value}</Text>
      </div>
    )
  }

  const status = normalizeDiffStatus(row.status)
  const value = ['INFO', 'UNCHANGED'].includes(status) && isUpdateActionGroup(group)
    ? '-'
    : status === 'NEW'
    ? formatSpreadsheetFieldValue(field, row.new_value)
    : status === 'CHANGED'
      ? `${formatSpreadsheetFieldValue(field, row.old_value)} → ${formatSpreadsheetFieldValue(field, row.new_value)}`
      : formatSpreadsheetFieldValue(field, row.new_value || row.old_value)

  return (
    <div className="excel-diff-table-cell" role="cell" data-label={field}>
      <Text className="excel-diff-cell-text">{value || '-'}</Text>
    </div>
  )
}

function formatSpreadsheetFieldValue(field: string, value: unknown): string {
  if (String(field || '').trim().toUpperCase() === 'ACTION') {
    return formatExcelAction(value)
  }
  const text = String(value ?? '').trim()
  if (!text) return '-'

  // Excel decimal values can arrive as binary floating-point artifacts
  // such as 2.0009999999999999. Clean only obvious repeated 0/9 tails;
  // ordinary high-precision values are left untouched.
  const numericMatch = text.match(/^(-?\d+)\.(\d+)$/)
  if (numericMatch && /(?:0{4,}|9{4,})$/.test(numericMatch[2])) {
    const numericValue = Number(text)
    if (Number.isFinite(numericValue)) {
      return String(Number(numericValue.toFixed(6)))
    }
  }

  return text
}

function formatExcelAction(value: unknown): string {
  const normalized = String(value ?? '').trim().toUpperCase()
  if (normalized === 'C' || normalized === 'CREATE') return 'Create'
  if (normalized === 'U' || normalized === 'UPDATE') return 'Update'
  if (normalized === 'D' || normalized === 'DELETE') return 'Delete'
  if (normalized === 'ERROR' || normalized === 'E') return 'Error'
  return 'Ignore'
}

function DiffSpreadsheetMessage({ group, fields }: { group: DiffRecordGroup; fields: string[] }) {
  const messages = group.rows.map(row => String(row.message || '').trim()).filter(Boolean)
  if (isDeleteDiffStatus(group.status)) messages.unshift('Record will be deleted')

  if (isUpdateActionGroup(group)) {
    const changedFields = new Set(
      group.rows
        .filter(row => !['INFO', 'UNCHANGED'].includes(normalizeDiffStatus(row.status)))
        .map(row => getDiffFieldLabel(row).trim().toUpperCase())
    )
    const ignoredFields = group.rows
      .filter(row => normalizeDiffStatus(row.status) === 'INFO')
      .map(getDiffFieldLabel)
    const skippedFields = [
      ...group.rows
        .filter(row => normalizeDiffStatus(row.status) === 'UNCHANGED')
        .map(getDiffFieldLabel),
      ...fields.filter(field => !changedFields.has(field.trim().toUpperCase()) &&
        !ignoredFields.some(ignored => ignored.trim().toUpperCase() === field.trim().toUpperCase()))
    ]
    if (ignoredFields.length > 0) messages.push(`Ignore: ${ignoredFields.join(', ')}`)
    if (skippedFields.length > 0) messages.push(`Skipped: ${Array.from(new Set(skippedFields)).join(', ')}`)
  }

  const uniqueMessages = deduplicateExcelMessages(messages)
  return <Text className="excel-diff-cell-text">{uniqueMessages.join('; ') || '-'}</Text>
}

function isUpdateActionGroup(group: DiffRecordGroup): boolean {
  const actionRow = group.rows.find(row => String(row.field_name || '').trim().toUpperCase() === 'ACTION')
  const rawAction = String(actionRow?.new_value || actionRow?.old_value || '').trim().toUpperCase()
  return rawAction === 'U' || rawAction === 'UPDATE' || normalizeDiffStatus(group.status) === 'CHANGED'
}

function shouldShowReviewDiffRow(row: ExcelDiffRow): boolean {
  const status = normalizeDiffStatus(row.status)
  // INFO/UNCHANGED rows are meaningful review results for a real Excel row:
  // they tell the user that an ACTION was present but no field was changed.
  // Only global informational rows (row_no = 0) are removed by the caller.
  if (status === 'INFO' || status === 'UNCHANGED') return row.row_no !== 0
  return true
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

function isPermissionMessage(message: unknown): boolean {
  return /not allowed|does not have permission|do not have permission|permission denied|unauthorized/i.test(
    String(message || '')
  )
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
    : row.message || (normalized === 'CHANGED' ? 'Value updated' : '-')
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
