import { useEffect, useMemo, useState } from 'react'
import {
  Table,
  TableHeaderRow,
  TableHeaderCell,
  TableRow,
  TableCell,
  Text,
  Button,
  CheckBox,
  Label,
  Title,
  FlexBox,
  Icon,
  Option,
  Select,
} from '@ui5/webcomponents-react'
import CellEditControl from './CellEditControl'
import RecordDetailsDialog from './dialogs/RecordDetailsDialog'
import { formatHeaderLabel } from '../utils/tableHelpers'
import { formatCellValue } from '../utils/displayHelpers'
import { buildRecordKeyString, normalizeRecordKeyString } from '../utils/recordHelpers'
import AppLoadingState from './AppLoadingState'

import { AiDescriptionMap, FieldMeta, PendingApprovalRecord, TableConfig, TableRowData } from '../types'

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100]

/* ============================================================================
 * PHAN 1: KHAI BAO INTERFACES VA PROPS CUA DYNAMICDATATABLE
 * ============================================================================ */

interface DynamicDataTableProps {
  /** Thong tin cau hinh bang hien tai */
  selectedTable: TableConfig
  /** Danh sach metadata cac cot duoc parse boi fieldMeta.ts */
  fields: FieldMeta[]
  /** Mang du lieu dong da qua bo loc tim kiem */
  filteredData: TableRowData[]
  /** Co dang tai du lieu tu SAP OData */
  dataLoading: boolean
  /** Trang thai co dang bat che do chinh sua Inline hay khong */
  isEditingTable: boolean
  /** Mang du lieu dang duoc chinh sua tam thoi */
  editedData: TableRowData[]
  /** Danh sach loi validate truc tiep tren tung o nhap lieu */
  inlineErrors: Record<number, Record<string, string>>
  /** Thong tin nguoi dung khac dang giu khoa bang (neu co) */
  activeTableLock: { lockedBy: string } | null
  /** Danh sach cac dong dang cho ADMIN phe duyet (Status = PENDING) */
  pendingApprovalRecords?: PendingApprovalRecord[]
  /** Callback khi gia tri cua 1 o thay doi */
  onCellChange: (rowIndex: number, fieldName: string, newValue: any) => void
  /** Callback them 1 dong moi vao bang */
  onAddRow: () => void
  /** Callback xoa 1 dong moi tao chua luu */
  onRemoveNewRow: (rowIndex: number) => void
  /** Callback luu cac thay doi xuong SAP RAP Backend */
  onSaveInlineEdits: () => void
  /** Callback huy che do chinh sua */
  onCancelInlineEdits: () => void
  /** Callback bat dau che do chinh sua cac dong da chon */
  onStartEditing: () => void
  /** Callback bat dau che do tao moi ban ghi */
  onStartCreating: () => void
  /** Callback tai lai du lieu bang */
  onRefresh: () => void
  /** Callback xoa cac dong da chon */
  onDeleteRows: (rows: TableRowData[]) => void
  /** Callback mo form sua 1 dong cu the */
  onEditRecord?: (row: TableRowData) => void
  /** Callback luu ban ghi truc tiep tu hop thoai chi tiet */
  onSaveRecord?: (values: Record<string, any>, dirtyFieldNames: string[], baselineRow?: TableRowData | null) => Promise<any>
  /** Quyen han cua user hien tai (Create, Update, Delete) */
  permissions?: {
    canCreate: boolean
    canUpdate: boolean
    canDelete: boolean
  }
  /** Ban do luu mo ta AI cho tung truong */
  aiDescriptions?: AiDescriptionMap
  /** Co dang tai mo ta AI */
  aiLoading?: boolean
  /** Callback yeu cau Backend sinh mo ta AI */
  onRequestAiDescriptions?: () => Promise<void> | void
}

export default function DynamicDataTable({
  selectedTable,
  fields,
  filteredData,
  dataLoading,
  isEditingTable,
  editedData,
  inlineErrors,
  activeTableLock,
  pendingApprovalRecords = [],
  onCellChange,
  onAddRow,
  onRemoveNewRow,
  onSaveInlineEdits,
  onCancelInlineEdits,
  onStartEditing,
  onStartCreating,
  onRefresh,
  onDeleteRows,
  onEditRecord,
  onSaveRecord,
  permissions = { canCreate: true, canUpdate: true, canDelete: true },
  aiDescriptions = {},
  aiLoading = false,
  onRequestAiDescriptions,
}: DynamicDataTableProps) {
  /* ============================================================================
   * PHAN 2: STATE QUAN LY SELECTION, SORTING, PAGINATION VA RESIZE COT
   * ============================================================================ */

  /** Tap hop RecordKey cua cac dong dang duoc chon boi Checkbox */
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set())
  /** Dong du lieu dang duoc mo trong Hop thoai Xem chi tiet RecordDetailsDialog */
  const [detailRow, setDetailRow] = useState<TableRowData | null>(null)
  /** Key cua o vua duoc bam nut Copy thanh cong */
  const [copiedCellKey, setCopiedCellKey] = useState('')
  /** State dieu khien popover giai thich y nghia truong bang AI */
  const [activeAiTooltip, setActiveAiTooltip] = useState<{
    fieldName: string
    label: string
    x: number
    y: number
  } | null>(null)
  const [aiTooltipLoadingField, setAiTooltipLoadingField] = useState('')

  /** Truong dang duoc sap xep va chieu sap xep (asc/desc) */
  const [sortField, setSortField] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | ''>('')

  /** Luu tru do rong tuy chinh khi nguoi dung keo dan cot bang chuot */
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})

  /** State quan ly phan trang (Trang hien tai va so dong tren 1 trang) */
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(10)

  /* ============================================================================
   * PHAN 3: XU LY SAP XEP DU LIEU (SORTING) VA KEO GIAN COT (RESIZING)
   * ============================================================================ */

  /** Xu ly khi click vao tieu de cot de sap xep: Chua sap xep -> Tang dan -> Giam dan -> Mac dinh */
  const handleHeaderSort = (fieldName: string) => {
    if (isEditingTable) return
    if (sortField !== fieldName) {
      setSortField(fieldName)
      setSortDirection('asc')
    } else if (sortDirection === 'asc') {
      setSortDirection('desc')
    } else {
      setSortField('')
      setSortDirection('')
    }
  }

  /** Xu ly bat dau keo chuot de thay doi do rong cot (Resize handle) */
  const handleResizeStart = (technicalName: string, startWidth: number, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    const startX = e.clientX
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault()
      const deltaX = moveEvent.clientX - startX
      const newWidth = Math.max(90, startWidth + deltaX)
      setColumnWidths(prev => ({ ...prev, [technicalName]: newWidth }))
    }

    const onMouseUp = () => {
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  /** Du lieu sau khi duoc sap xep theo cot va kieu du lieu tuong ung */
  const sortedData = useMemo(() => {
    if (!sortField || !sortDirection) return filteredData

    const fieldMeta = fields.find(f => (f.field_name || f.FieldName) === sortField)
    const feType = fieldMeta ? (fieldMeta.fe_type || fieldMeta.FeType || '').toLowerCase() : ''

    return [...filteredData].sort((a, b) => {
      const valA = a[sortField]
      const valB = b[sortField]

      if (valA == null || valA === '') return sortDirection === 'asc' ? 1 : -1
      if (valB == null || valB === '') return sortDirection === 'asc' ? -1 : 1

      let cmp = 0
      if (feType === 'number' || feType === 'decimal' || feType === 'integer') {
        const numA = Number(valA)
        const numB = Number(valB)
        cmp = isNaN(numA) || isNaN(numB) ? String(valA).localeCompare(String(valB)) : numA - numB
      } else if (feType === 'date') {
        const dateA = new Date(String(valA)).getTime()
        const dateB = new Date(String(valB)).getTime()
        cmp = isNaN(dateA) || isNaN(dateB) ? String(valA).localeCompare(String(valB)) : dateA - dateB
      } else {
        cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' })
      }

      return sortDirection === 'asc' ? cmp : -cmp
    })
  }, [filteredData, sortField, sortDirection, fields])

  /* ============================================================================
   * PHAN 4: TINH TOAN PHAN TRANG (PAGINATION)
   * ============================================================================ */

  const currentRecords = isEditingTable ? editedData : sortedData
  const totalPages = Math.max(1, Math.ceil(currentRecords.length / pageSize))
  const safePageIndex = Math.min(pageIndex, totalPages - 1)
  const pageStart = currentRecords.length === 0 ? 0 : safePageIndex * pageSize + 1
  const pageEnd = Math.min((safePageIndex + 1) * pageSize, currentRecords.length)
  const pagedData = useMemo(
    () => sortedData.slice(safePageIndex * pageSize, (safePageIndex + 1) * pageSize),
    [sortedData, safePageIndex, pageSize]
  )
  const pagedEditedData = useMemo(
    () => editedData.slice(safePageIndex * pageSize, (safePageIndex + 1) * pageSize),
    [editedData, safePageIndex, pageSize]
  )

  useEffect(() => {
    setPageIndex(0)
  }, [filteredData.length, pageSize, selectedTable.ConfigUuid])

  useEffect(() => {
    if (safePageIndex !== pageIndex) setPageIndex(safePageIndex)
  }, [safePageIndex, pageIndex])

  /* ============================================================================
   * PHAN 5: TINH TOAN DO RONG COT VA CSS GRID COLUMNS STYLE
   * ============================================================================ */

  const getDuplicateHeaderLabel = (headerLabel: string, technicalName: string) => {
    const normalizedName = technicalName.toUpperCase()
    if (normalizedName === 'LAST_CHANGED_AT') return `${headerLabel} (UTC)`
    if (normalizedName === 'LOCAL_LAST_CHANGED_AT') return `${headerLabel} (Local)`
    if (normalizedName === 'CHANGED_AT') return `${headerLabel} (System)`
    if (normalizedName === 'CREATED_AT') return `${headerLabel} (System)`
    return `${headerLabel} (${technicalName})`
  }

  const baseHeaderLabels = fields.map(f => formatHeaderLabel(f))
  const headerLabelCounts = baseHeaderLabels.reduce<Record<string, number>>((counts, label) => {
    counts[label] = (counts[label] || 0) + 1
    return counts
  }, {})

  /**
   * Tinh toan do rong minColWidth cho tung cot dua vao: do dai chuoi label,
   * kieu du lieu (Date: 225px, Domain: 200px, Text: 180px), va icon Khoa is_key (+18px).
   */
  const fieldsWithWidths = fields.map(f => {
    const technicalName = f.field_name || f.FieldName
    const baseHeaderLabel = formatHeaderLabel(f)
    const headerLabel = headerLabelCounts[baseHeaderLabel] > 1
      ? getDuplicateHeaderLabel(baseHeaderLabel, technicalName)
      : baseHeaderLabel
    const feType = f.fe_type || f.FeType
    const isDate = feType === 'date'
    const isDomain = feType === 'domain' || feType === 'fk_select'
    const hasKeyIcon = f.is_key || f.IsKeyField === 'X'
    const defaultWidth = Math.max(
      isDate ? 225 : isDomain ? 200 : 180,
      headerLabel.length * 9 + 104 + (hasKeyIcon ? 18 : 0)
    )
    const minColWidth = columnWidths[technicalName] || defaultWidth
    return { field: f, minColWidth, headerLabel, technicalName }
  })

  /* ============================================================================
   * PHAN 6: QUAN LY KHOA DONG DANG CHO DUYET (PENDING APPROVAL) VA SELECTION
   * ============================================================================ */

  const getRowKey = (row: TableRowData, fallbackIndex: number) => {
    if (row._isNew) return `new-${fallbackIndex}`
    try {
      return buildRecordKeyString(fields, row)
    } catch {
      return `row-${fallbackIndex}`
    }
  }

  const pendingRecordKeySet = useMemo(() => new Set(
    pendingApprovalRecords
      .filter(record => !['C', 'CREATE'].includes(String(record.ActionType || '').trim().toUpperCase()))
      .map(record => normalizeRecordKeyString(record.RecordKey))
      .filter(Boolean)
  ), [pendingApprovalRecords])

  /** Kiem tra dong nay co dang bi khoa vi co yeu cau Update/Delete dang cho ADMIN duyet */
  const isRowPending = (row: TableRowData, fallbackIndex: number) =>
    pendingRecordKeySet.has(normalizeRecordKeyString(getRowKey(row, fallbackIndex)))

  const selectableRowKeys = useMemo(
    () => sortedData
      .map((row, index) => ({ row, index, key: getRowKey(row, index) }))
      .filter(({ row, index }) => !isRowPending(row, index))
      .map(({ key }) => key),
    [sortedData, fields, pendingRecordKeySet]
  )

  useEffect(() => {
    if (isEditingTable) return
    setSelectedRowKeys(prev => {
      if (prev.size === 0) return prev
      const visible = new Set(selectableRowKeys)
      const next = new Set([...prev].filter(key => visible.has(key)))
      return next.size === prev.size ? prev : next
    })
  }, [selectableRowKeys, isEditingTable])

  useEffect(() => {
    setSortField('')
    setSortDirection('')
    setColumnWidths({})
    setSelectedRowKeys(new Set())
    setActiveAiTooltip(null)
  }, [selectedTable.ConfigUuid])

  useEffect(() => {
    if (!activeAiTooltip) return

    const closeTooltip = () => setActiveAiTooltip(null)
    window.addEventListener('resize', closeTooltip)
    window.addEventListener('scroll', closeTooltip, true)
    window.addEventListener('wheel', closeTooltip, true)
    window.addEventListener('touchmove', closeTooltip, true)

    return () => {
      window.removeEventListener('resize', closeTooltip)
      window.removeEventListener('scroll', closeTooltip, true)
      window.removeEventListener('wheel', closeTooltip, true)
      window.removeEventListener('touchmove', closeTooltip, true)
    }
  }, [activeAiTooltip])

  const selectedRowCount = selectedRowKeys.size
  const selectedRows = sortedData.filter((row, index) => selectedRowKeys.has(getRowKey(row, index)))
  const hasNewRows = isEditingTable && editedData.some(row => row._isNew)
  const allVisibleRowsSelected =
    selectableRowKeys.length > 0 && selectableRowKeys.every(key => selectedRowKeys.has(key))
  const createDenied = !permissions.canCreate
  const updateDenied = !permissions.canUpdate
  const deleteDenied = !permissions.canDelete

  const toggleRowSelection = (rowKey: string, checked: boolean) => {
    setSelectedRowKeys(prev => {
      const next = new Set(prev)
      if (checked) next.add(rowKey)
      else next.delete(rowKey)
      return next
    })
  }

  const toggleAllVisibleRows = (checked: boolean) => {
    setSelectedRowKeys(prev => {
      const next = new Set(prev)
      selectableRowKeys.forEach(key => {
        if (checked) next.add(key)
        else next.delete(key)
      })
      return next
    })
  }

  const startEditingSelectedRows = () => {
    if (updateDenied) return
    if (selectedRowKeys.size === 0) return
    onStartEditing()
  }

  const deleteSelectedRow = () => {
    if (deleteDenied) return
    if (selectedRows.length === 0) return
    onDeleteRows(selectedRows)
  }

  const isUuidLikeCellValue = (field: FieldMeta, value: any) => {
    if (value === undefined || value === null || value === '') return false
    const rawValue = String(value)
    const compactUuid = rawValue.replace(/-/g, '')
    const feType = field.fe_type || field.FeType
    return feType === 'uuid' || field.FieldType === 'UUID' || /^[0-9A-F]{32}$/i.test(compactUuid)
  }

  const shouldShowCopyButton = (field: FieldMeta, value: any) => {
    if (value === undefined || value === null || value === '') return false
    const rawValue = String(value)
    const displayValue = formatCellValue(field, value)
    return isUuidLikeCellValue(field, value) || displayValue !== rawValue || rawValue.length >= 24
  }

  const shouldKeepCellSingleLine = (field: FieldMeta, value: any) => {
    return isUuidLikeCellValue(field, value)
  }

  const copyCellValue = async (value: any, cellKey: string, event: any) => {
    event.stopPropagation()
    const text = String(value ?? '')
    if (!text) return

    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand('copy')
      document.body.removeChild(textArea)
    }

    setCopiedCellKey(cellKey)
    window.setTimeout(() => {
      setCopiedCellKey(prev => (prev === cellKey ? '' : prev))
    }, 1200)
  }

  const getAiDescriptionForField = (fieldName: string) => {
    return aiDescriptions[fieldName.toUpperCase()]
  }

  const openAiTooltip = async (fieldName: string, label: string, event: any) => {
    event.stopPropagation()

    const rect = event.currentTarget.getBoundingClientRect()
    const viewportPadding = 16
    const rootFontSize = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16
    const popoverWidth = Math.min(22 * rootFontSize, window.innerWidth - viewportPadding * 2)
    const x = Math.max(
      viewportPadding,
      Math.min(rect.left, window.innerWidth - popoverWidth - viewportPadding)
    )
    const y = Math.min(rect.bottom + 8, window.innerHeight - 160)

    setActiveAiTooltip(prev =>
      prev?.fieldName === fieldName ? null : { fieldName, label, x, y }
    )

    if (getAiDescriptionForField(fieldName) || !onRequestAiDescriptions) return

    setAiTooltipLoadingField(fieldName)
    try {
      await onRequestAiDescriptions()
    } finally {
      setAiTooltipLoadingField(prev => (prev === fieldName ? '' : prev))
    }
  }

  const startCreatingNewRow = () => {
    if (createDenied) return
    setSelectedRowKeys(new Set())
    setPageIndex(0)
    onStartCreating()
  }

  const cancelInlineEditing = () => {
    setSelectedRowKeys(new Set())
    onCancelInlineEdits()
  }

  const selectionColumnWidth = 76
  /** Chuoi CSS Grid tinh toan tong hop toan bo do rong cac cot */
  const columnsStyle =
    `${selectionColumnWidth}px ${fieldsWithWidths
      .map(item => `${item.minColWidth}px`)
      .join(' ')}${hasNewRows ? ' 100px' : ''}`
  const tableColumnCount = fields.length + 1 + (hasNewRows ? 1 : 0)
  const selectionCellStyle = {
    minWidth: `${selectionColumnWidth}px`,
    width: `${selectionColumnWidth}px`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingInline: '4px',
    overflow: 'hidden',
  } as const

  /* ============================================================================
   * PHAN 7: RENDER GIAO DIEN - TOOLBAR VA BANG DU LIEU DONG
   * ============================================================================ */

  return (
    <div className="tab-panel-form table-data-panel">
      {/* ── Header cua Panel: Tieu de so ban ghi va cac nut thao tac CRUD ── */}
      <div className="tab-panel-header">
        <div className="tab-panel-title-block">
          <Title level="H4" className="tab-panel-title">
            Records ({dataLoading ? '...' : isEditingTable ? editedData.length : filteredData.length})
          </Title>
          <Text className="tab-panel-subtitle">
            {isEditingTable
              ? 'Review the selected records, then save or discard your changes.'
              : 'Select records to edit or delete. Sort and resize columns directly from the header.'}
          </Text>
          {pendingApprovalRecords.length > 0 && (
            <div className="table-pending-notice" role="status">
              <Icon name={'pending' as any} className="table-pending-notice-icon" />
              <Text>
                {pendingApprovalRecords.length} {pendingApprovalRecords.length === 1 ? 'record is' : 'records are'} waiting for ADMIN approval.
              </Text>
            </div>
          )}
          {(createDenied || updateDenied || deleteDenied) && (
            <div className="table-pending-notice" role="status" style={{ marginTop: '0.25rem' }}>
              <Icon name={'alert' as any} className="table-pending-notice-icon" />
              <Text>
                {createDenied && updateDenied && deleteDenied
                  ? 'You have read-only access. You do not have permission to create, edit, or delete records in this table.'
                  : `You do not have permission to ${[
                      createDenied ? 'create' : '',
                      updateDenied ? 'edit' : '',
                      deleteDenied ? 'delete' : '',
                    ]
                      .filter(Boolean)
                      .join(', ')} records in this table.`}
              </Text>
            </div>
          )}
        </div>
        <div className="tab-panel-actions">
          {isEditingTable ? (
            <>
              <Button
                design="Emphasized"
                icon={'save' as any}
                onClick={onSaveInlineEdits}
                disabled={Object.values(inlineErrors).some(row => Object.keys(row).length > 0)}
              >
                Save
              </Button>
              <Button design="Transparent" icon={'decline' as any} onClick={cancelInlineEditing}>
                Cancel
              </Button>
              <Button
                design="Transparent"
                icon={'add' as any}
                onClick={() => {
                  setPageIndex(0)
                  onAddRow()
                }}
              >
                Add Row
              </Button>
            </>
          ) : (
            <>
              <Button
                design="Emphasized"
                icon={'add' as any}
                disabled={dataLoading || createDenied || !!activeTableLock}
                onClick={startCreatingNewRow}
                accessibleName={createDenied ? 'You do not have permission to create records.' : undefined}
              >
                Create
              </Button>
              <Button
                design="Default"
                icon={'edit' as any}
                disabled={dataLoading || updateDenied || !!activeTableLock || selectedRowCount === 0}
                onClick={startEditingSelectedRows}
                accessibleName={updateDenied ? 'You do not have permission to update this record.' : undefined}
              >
                {selectedRowCount > 0 ? `Edit (${selectedRowCount})` : 'Edit'}
              </Button>
              <Button
                design="Transparent"
                icon={'delete' as any}
                disabled={dataLoading || deleteDenied || !!activeTableLock || selectedRowCount === 0}
                onClick={deleteSelectedRow}
                accessibleName={deleteDenied ? 'You do not have permission to delete this record.' : undefined}
              >
                {selectedRowCount > 1 ? `Delete (${selectedRowCount})` : 'Delete'}
              </Button>
              <Button
                design="Transparent"
                icon={'refresh' as any}
                onClick={onRefresh}
                disabled={dataLoading}
              >
                Refresh
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Loading indicator ─────────────────────────────────────────── */}
      {dataLoading && (
        <AppLoadingState label="Loading table data..." />
      )}

      {/* ── Scrollable Table Wrapper: Dong bo CSS Grid voi cac o table ── */}
      {!dataLoading && <div
        className={`dynamic-table-scroll dynamic-table-surface${isEditingTable ? ' dynamic-table-scroll--editing' : ''}`}
        style={{ ['--dynamic-table-grid-columns' as any]: columnsStyle }}
        onScroll={() => setActiveAiTooltip(null)}
      >
        <Table
          className="dynamic-data-table"
          overflowMode="Scroll"
          style={{
            width: '100%',
            gridTemplateColumns: columnsStyle,
            ['--ui5-table-grid-columns' as any]: columnsStyle
          }}
          headerRow={
            <TableHeaderRow
              className="dynamic-table-header-row"
              style={{
                gridTemplateColumns: columnsStyle,
                ['--ui5-table-grid-columns' as any]: columnsStyle
              }}
            >
              <TableHeaderCell className="dynamic-table-selection-cell" minWidth={`${selectionColumnWidth}px`} style={selectionCellStyle}>
                <CheckBox
                  checked={allVisibleRowsSelected}
                  disabled={selectableRowKeys.length === 0 || isEditingTable}
                  onChange={(e: any) => toggleAllVisibleRows(e.target.checked)}
                />
              </TableHeaderCell>
              {/* [DYNAMIC RENDER 1] SINH TIEU DE COT DONG (DUYET MANG FIELDS) */}
              {fieldsWithWidths.map(({ field: f, minColWidth, headerLabel }) => {
                const technicalName = f.field_name || f.FieldName
                const isSorted = sortField === technicalName
                return (
                  <TableHeaderCell
                    className="dynamic-table-header-cell"
                    key={technicalName}
                    minWidth={`${minColWidth}px`}
                    style={{ minWidth: `${minColWidth}px` }}
                  >
                    <FlexBox
                      alignItems="Center"
                      gap="4px"
                      style={{
                        width: '100%',
                        minWidth: 0,
                        cursor: isEditingTable ? 'default' : 'pointer',
                        userSelect: 'none'
                      }}
                      onClick={() => handleHeaderSort(technicalName)}
                      title={`Click to sort by ${headerLabel} (${technicalName})`}
                    >
                      <Label
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'visible',
                          flexShrink: 0,
                          cursor: isEditingTable ? 'default' : 'pointer',
                          fontWeight: isSorted ? 'bold' : undefined,
                          color: isSorted ? '#0070f2' : undefined
                        }}
                      >
                        {headerLabel}
                      </Label>
                      {/* Bieu tuong Khoa vang neu truong nay la Primary Key (is_key) */}
                      {(f.is_key || f.IsKeyField === 'X') && (
                        <Icon
                          name="key"
                          style={{ minWidth: '12px', width: '12px', height: '12px', color: '#e09d00' }}
                        />
                      )}
                      {/* Bieu tuong Sap xep Tang / Giam dan */}
                      {isSorted && sortDirection ? (
                        <Icon
                          name={sortDirection === 'asc' ? 'sort-ascending' : 'sort-descending'}
                          style={{ minWidth: '14px', width: '14px', height: '14px', color: '#0070f2' }}
                        />
                      ) : (
                        <Icon
                          name="sort"
                          style={{ minWidth: '12px', width: '12px', height: '12px', color: '#8c8c8c', opacity: 0.3 }}
                        />
                      )}
                      {/* Nut (?) goi y giai thich y nghia truong bang AI (BP-09) */}
                      {onRequestAiDescriptions && (
                        <button
                          type="button"
                          className="ai-field-tooltip-button"
                          aria-label={`Show AI description for ${headerLabel}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            openAiTooltip(technicalName, headerLabel, event)
                          }}
                        >
                          ?
                        </button>
                      )}
                      {/* Thanh gach dung keo dan do rong cot dong */}
                      <div
                        className="column-resize-handle-inline"
                        title="Keo de thay doi do rong cot"
                        onMouseDown={(e) => handleResizeStart(technicalName, minColWidth, e)}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="column-resize-bar" />
                      </div>
                    </FlexBox>
                  </TableHeaderCell>
                )
              })}
              {hasNewRows && (
                <TableHeaderCell minWidth="100px" style={{ minWidth: '100px' }}>
                  <Label>Actions</Label>
                </TableHeaderCell>
              )}
            </TableHeaderRow>
          }
        >
          {/* [INLINE CUD 1] CHE DO CHINH SUA TAI CHO (INLINE EDIT MODE) */}
          {isEditingTable ? (
            editedData.length === 0 ? (
              <TableRow className="dynamic-table-empty-row" style={{ display: 'flex', width: '100%', gridTemplateColumns: '1fr' }}>
                <TableCell className="dynamic-table-empty-cell" style={{ gridColumn: '1 / -1', width: '100%' }} {...({ colSpan: tableColumnCount } as any)}>
                  <Icon name={'table-view' as any} className="dynamic-table-empty-icon" />
                  <Title level="H5">No records yet</Title>
                  <Text>Create a record to start maintaining this table.</Text>
                </TableCell>
              </TableRow>
            ) : (
              pagedEditedData.map((row, i) => {
                const actualIndex = safePageIndex * pageSize + i
                return (
                  <TableRow
                    className={`dynamic-table-data-row${row._isNew ? ' dynamic-table-data-row--new' : ''}`}
                    key={actualIndex}
                    style={{
                      gridTemplateColumns: columnsStyle,
                      ['--ui5-table-grid-columns' as any]: columnsStyle
                    }}
                  >
                    <TableCell className="dynamic-table-selection-cell" style={selectionCellStyle}>
                      <FlexBox alignItems="Center" justifyContent="Center" gap="2px" style={{ width: '100%' }}>
                        <CheckBox checked={row._isNew || selectedRowKeys.has(getRowKey(row, actualIndex))} disabled />
                        {!row._isNew ? (
                          <Button
                            design="Transparent"
                            icon={'display' as any}
                            title="View record details"
                            accessibleName="View record details"
                            style={{ width: '26px', minWidth: '26px', height: '26px' }}
                            onClick={(e: any) => {
                              e.stopPropagation()
                              setDetailRow(row)
                            }}
                          />
                        ) : (
                          <div style={{ width: '26px', minWidth: '26px' }} />
                        )}
                      </FlexBox>
                    </TableCell>
                    {/* Duyet mang fields de sinh cac o chinh sua/hien thi tuong ung */}
                    {fieldsWithWidths.map(({ field: f, minColWidth }) => {
                      const name = f.field_name || f.FieldName
                      const feType = f.fe_type || f.FeType
                      const rowSelected = row._isNew || selectedRowKeys.has(getRowKey(row, actualIndex))
                      const singleLine = shouldKeepCellSingleLine(f, row[name])
                      return (
                        <TableCell
                          key={name}
                          minWidth={`${minColWidth}px`}
                          style={{
                            minWidth: `${minColWidth}px`,
                          }}
                        >
                          {rowSelected ? (
                            <div style={{ width: '100%', minWidth: 0 }}>
                              <CellEditControl
                                row={row}
                                rowIndex={actualIndex}
                                field={f}
                                inlineErrors={inlineErrors}
                                configUuid={selectedTable.ConfigUuid}
                                tableName={selectedTable.TableName}
                                onCellChange={onCellChange}
                              />
                            </div>
                          ) : (
                            <FlexBox alignItems="Center" gap="4px" style={{ width: '100%', minWidth: 0 }}>
                              <Text
                                title={String(row[name] ?? '')}
                                style={{
                                  color: '#32363a',
                                  overflow: singleLine ? 'hidden' : 'visible',
                                  textOverflow: singleLine ? 'ellipsis' : undefined,
                                  whiteSpace: singleLine ? 'nowrap' : 'normal',
                                  overflowWrap: 'normal',
                                  wordBreak: 'normal',
                                  minWidth: 0,
                                }}
                              >
                                {formatCellValue(f, row[name])}
                              </Text>
                              {shouldShowCopyButton(f, row[name]) && (
                                <Button
                                  design="Transparent"
                                  icon={'copy' as any}
                                  accessibleName="Copy full value"
                                  title={copiedCellKey === `${actualIndex}-${name}` ? 'Copied' : 'Copy full value'}
                                  onClick={(e: any) => copyCellValue(row[name], `${actualIndex}-${name}`, e)}
                                />
                              )}
                            </FlexBox>
                          )}
                        </TableCell>
                      )
                    })}
                    {hasNewRows && (
                      <TableCell>
                        {row._isNew ? (
                          <Button
                            design="Transparent"
                            icon={'delete' as any}
                            accessibleName="Remove new record"
                            onClick={() => onRemoveNewRow(actualIndex)}
                          />
                        ) : null}
                      </TableCell>
                    )}
                  </TableRow>
                )
              })
            )
          ) : sortedData.length === 0 ? (
            /* ── Read-only empty state ────────────────────────────────── */
            <TableRow className="dynamic-table-empty-row" style={{ display: 'flex', width: '100%', gridTemplateColumns: '1fr' }}>
              <TableCell className="dynamic-table-empty-cell" style={{ gridColumn: '1 / -1', width: '100%' }} {...({ colSpan: tableColumnCount } as any)}>
                <Icon name={'table-view' as any} className="dynamic-table-empty-icon" />
                <Title level="H5">No records found</Title>
                <Text>Adjust the filters or create a new record.</Text>
              </TableCell>
            </TableRow>
          ) : (
            /* ── Read-only rows ───────────────────────────────────────── */
            pagedData.map((row, i) => {
              const rowIndex = safePageIndex * pageSize + i
              const pendingApproval = isRowPending(row, rowIndex)
              return (
                <TableRow
                  className={`dynamic-table-data-row${selectedRowKeys.has(getRowKey(row, rowIndex)) ? ' dynamic-table-data-row--selected' : ''}${pendingApproval ? ' dynamic-table-data-row--pending' : ''}`}
                  key={rowIndex}
                  interactive={!activeTableLock && !pendingApproval}
                  title={pendingApproval ? 'This record is waiting for ADMIN approval.' : undefined}
                  onClick={() => {
                    if (activeTableLock || pendingApproval) return
                    toggleRowSelection(getRowKey(row, rowIndex), !selectedRowKeys.has(getRowKey(row, rowIndex)))
                  }}
                  style={{
                    gridTemplateColumns: columnsStyle,
                    ['--ui5-table-grid-columns' as any]: columnsStyle
                  }}
                >
                  <TableCell
                    className="dynamic-table-selection-cell"
                    style={selectionCellStyle}
                    onClick={(e: any) => e.stopPropagation()}
                  >
                    <FlexBox alignItems="Center" justifyContent="Center" gap="2px" style={{ width: '100%' }}>
                      <CheckBox
                        checked={selectedRowKeys.has(getRowKey(row, rowIndex))}
                        disabled={!!activeTableLock || pendingApproval}
                        onChange={(e: any) => {
                          e.stopPropagation()
                          toggleRowSelection(getRowKey(row, rowIndex), e.target.checked)
                        }}
                      />
                      <Button
                        design="Transparent"
                        icon={'display' as any}
                        title="View record details"
                        accessibleName="View record details"
                        style={{ width: '26px', minWidth: '26px', height: '26px' }}
                        onClick={(e: any) => {
                          e.stopPropagation()
                          setDetailRow(row)
                        }}
                      />
                      {pendingApproval && (
                        <Icon
                          name={'locked' as any}
                          className="dynamic-table-pending-lock"
                          title="Waiting for ADMIN approval"
                        />
                      )}
                    </FlexBox>
                  </TableCell>
                  {fieldsWithWidths.map(({ field: f, minColWidth }) => {
                    const name = f.field_name || f.FieldName
                    const val = row[name]
                    const singleLine = shouldKeepCellSingleLine(f, val)

                    return (
                      <TableCell
                        key={name}
                        minWidth={`${minColWidth}px`}
                        style={{
                          minWidth: `${minColWidth}px`,
                        }}
                      >
                        <FlexBox alignItems="Center" gap="4px" style={{ width: '100%', minWidth: 0 }}>
                          <Text
                            title={String(val ?? '')}
                            style={{
                              color: '#32363a',
                              overflow: singleLine ? 'hidden' : 'visible',
                              textOverflow: singleLine ? 'ellipsis' : undefined,
                              whiteSpace: singleLine ? 'nowrap' : 'normal',
                              overflowWrap: 'normal',
                              wordBreak: 'normal',
                              minWidth: 0,
                            }}
                          >
                            {formatCellValue(f, val)}
                          </Text>
                          {shouldShowCopyButton(f, val) && (
                            <Button
                              design="Transparent"
                              icon={'copy' as any}
                              accessibleName="Copy full value"
                              title={copiedCellKey === `${i}-${name}` ? 'Copied' : 'Copy full value'}
                              onClick={(e: any) => copyCellValue(val, `${i}-${name}`, e)}
                            />
                          )}
                        </FlexBox>
                      </TableCell>
                    )
                  })}
                </TableRow>
              )
            })
          )}
        </Table>
      </div>}
      {/* ── Thanh phan trang (Pagination bar) ────────────────────────── */}
      <div className="audit-pagination-bar">
        <Text className="audit-count">Showing {pageStart}-{pageEnd} of {currentRecords.length}</Text>
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
          >Previous</Button>
          <Text className="audit-page-label">Page {safePageIndex + 1} / {totalPages}</Text>
          <Button
            design="Transparent"
            icon={'navigation-right-arrow' as any}
            disabled={safePageIndex >= totalPages - 1}
            onClick={() => setPageIndex(prev => Math.min(totalPages - 1, prev + 1))}
          >Next</Button>
        </div>
      </div>
      {/* ── Popover giai thich y nghia truong du lieu bang AI ────────── */}
      {activeAiTooltip && (
        <div
          className="ai-field-popover"
          role="dialog"
          aria-label={`AI description for ${activeAiTooltip.label}`}
          style={{ left: activeAiTooltip.x, top: activeAiTooltip.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            className="ai-field-popover-close"
            aria-label="Close AI description"
            onClick={() => setActiveAiTooltip(null)}
          >
            x
          </button>
          <div className="ai-field-popover-title">{activeAiTooltip.label}</div>
          {aiLoading || aiTooltipLoadingField === activeAiTooltip.fieldName ? (
            <Text>Loading AI description...</Text>
          ) : (() => {
            const ai = getAiDescriptionForField(activeAiTooltip.fieldName)
            if (!ai) {
              return <Text>No AI description available for this field.</Text>
            }

            return (
              <>
                {ai.description && (
                  <div className="ai-field-popover-section">
                    <strong>Description</strong>
                    <span>{ai.description}</span>
                  </div>
                )}
                {ai.constraints && (
                  <div className="ai-field-popover-section">
                    <strong>Input guidance</strong>
                    <span>{ai.constraints}</span>
                  </div>
                )}
              </>
            )
          })()}
        </div>
      )}
      {/* ── Dialog Xem chi tiet & Chinh sua truc tiep tren the cua 1 Row ── */}
      <RecordDetailsDialog
        open={!!detailRow}
        configUuid={selectedTable.ConfigUuid}
        tableName={selectedTable.TableName}
        fields={fields}
        row={detailRow}
        aiDescriptions={aiDescriptions}
        permissions={permissions}
        disabledActions={!!activeTableLock || isEditingTable}
        onSaveRecord={onSaveRecord}
        onDeleteRecord={row => {
          setDetailRow(null)
          onDeleteRows([row])
        }}
        onClose={() => setDetailRow(null)}
      />
      <div className="dynamic-table-bottom-spacer" aria-hidden="true" />
    </div>
  )
}
