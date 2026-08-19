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
} from '@ui5/webcomponents-react'
import CellEditControl from './CellEditControl'
import { formatHeaderLabel } from '../utils/tableHelpers'
import { formatCellValue } from '../utils/displayHelpers'
import { buildRecordKeyString, normalizeRecordKeyString } from '../utils/recordHelpers'
import AppLoadingState from './AppLoadingState'

import { AiDescriptionMap, FieldMeta, PendingApprovalRecord, TableConfig, TableRowData } from '../types'

interface DynamicDataTableProps {
  selectedTable: TableConfig
  fields: FieldMeta[]
  filteredData: TableRowData[]
  dataLoading: boolean
  isEditingTable: boolean
  editedData: TableRowData[]
  inlineErrors: Record<number, Record<string, string>>
  activeTableLock: { lockedBy: string } | null
  pendingApprovalRecords?: PendingApprovalRecord[]
  onCellChange: (rowIndex: number, fieldName: string, newValue: any) => void
  onAddRow: () => void
  onRemoveNewRow: (rowIndex: number) => void
  onSaveInlineEdits: () => void
  onCancelInlineEdits: () => void
  onStartEditing: () => void
  onStartCreating: () => void
  onRefresh: () => void
  onDeleteRows: (rows: TableRowData[]) => void
  permissions?: {
    canCreate: boolean
    canUpdate: boolean
    canDelete: boolean
  }
  aiDescriptions?: AiDescriptionMap
  aiLoading?: boolean
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
  permissions = { canCreate: true, canUpdate: true, canDelete: true },
  aiDescriptions = {},
  aiLoading = false,
  onRequestAiDescriptions,
}: DynamicDataTableProps) {
  const [selectedRowKeys, setSelectedRowKeys] = useState<Set<string>>(new Set())
  const [copiedCellKey, setCopiedCellKey] = useState('')
  const [activeAiTooltip, setActiveAiTooltip] = useState<{
    fieldName: string
    label: string
    x: number
    y: number
  } | null>(null)
  const [aiTooltipLoadingField, setAiTooltipLoadingField] = useState('')
  const [sortField, setSortField] = useState<string>('')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | ''>('')
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({})

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
      // Create requests do not have a row in the active table yet. Update and
      // delete requests must lock the existing row until ADMIN decides.
      .filter(record => !['C', 'CREATE'].includes(String(record.ActionType || '').trim().toUpperCase()))
      .map(record => normalizeRecordKeyString(record.RecordKey))
      .filter(Boolean)
  ), [pendingApprovalRecords])

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
    onStartCreating()
  }

  const cancelInlineEditing = () => {
    setSelectedRowKeys(new Set())
    onCancelInlineEdits()
  }

  const selectionColumnWidth = 44
  const columnsStyle =
    `${selectionColumnWidth}px ${fieldsWithWidths
      .map(item => `${item.minColWidth}px`)
      .join(' ')}${hasNewRows ? ' 100px' : ''}`
  const tableColumnCount = fields.length + 1 + (hasNewRows ? 1 : 0)
  const selectionCellStyle = {
    minWidth: `${selectionColumnWidth}px`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingInline: 0,
    overflow: 'hidden',
  } as const

  return (
    <div className="tab-panel-form table-data-panel">
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
          {pendingRecordKeySet.size > 0 && (
            <div className="table-pending-notice" role="status">
              <Icon name={'pending' as any} className="table-pending-notice-icon" />
              <Text>
                {pendingRecordKeySet.size} {pendingRecordKeySet.size === 1 ? 'record is' : 'records are'} waiting for ADMIN approval.
              </Text>
            </div>
          )}
          {(createDenied || updateDenied || deleteDenied) && (
            <Text className="tab-panel-subtitle table-data-permission-note">
              Some actions are disabled because you do not have the required permission.
            </Text>
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
              <Button design="Transparent" icon={'add' as any} onClick={onAddRow}>
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

      {/* ── Scrollable Table Wrapper: Đồng bộ CSS Grid với các ô table ── */}
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
              {/* ========================================================================= */}
              {/* 🎨 [DYNAMIC RENDER 1] SINH TIÊU ĐỀ CỘT ĐỘNG (DUYỆT MẢNG FIELDS)         */}
              {/* ========================================================================= */}
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
                      {/* Thêm biểu tượng Khóa Vàng nếu trường này là Khóa chính (Key Field) */}
                      {(f.is_key || f.IsKeyField === 'X') && (
                        <Icon
                          name="key"
                          style={{ minWidth: '12px', width: '12px', height: '12px', color: '#e09d00' }}
                        />
                      )}
                      {/* Biểu tượng Sắp xếp Tăng / Giảm dần */}
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
                      {/* Thanh gạch đứng kéo dãn độ rộng cột động */}
                      <div
                        className="column-resize-handle-inline"
                        title="Kéo để thay đổi độ rộng cột"
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
          {/* ========================================================================= */}
          {/* ✏️ [INLINE CUD 1] CHẾ ĐỘ CHỈNH SỬA TẠI CHỖ (INLINE EDIT MODE)            */}
          {/* ========================================================================= */}
          {isEditingTable ? (
            editedData.length === 0 ? (
              <TableRow className="dynamic-table-empty-row" style={{ gridTemplateColumns: '1fr' }}>
                <TableCell className="dynamic-table-empty-cell" {...({ colSpan: tableColumnCount } as any)}>
                  <Icon name={'table-view' as any} className="dynamic-table-empty-icon" />
                  <Title level="H5">No records yet</Title>
                  <Text>Create a record to start maintaining this table.</Text>
                </TableCell>
              </TableRow>
            ) : (
              editedData.map((row, i) => (
                <TableRow
                  className={`dynamic-table-data-row${row._isNew ? ' dynamic-table-data-row--new' : ''}`}
                  key={i}
                  style={{
                    gridTemplateColumns: columnsStyle,
                    ['--ui5-table-grid-columns' as any]: columnsStyle
                  }}
                >
                  <TableCell className="dynamic-table-selection-cell" style={selectionCellStyle}>
                    <CheckBox checked={row._isNew || selectedRowKeys.has(getRowKey(row, i))} disabled />
                  </TableCell>
                  {/* Duyệt mảng fields để sinh các ô chỉnh sửa/hiển thị tương ứng */}
                  {fieldsWithWidths.map(({ field: f, minColWidth }) => {
                    const name = f.field_name || f.FieldName
                    const feType = f.fe_type || f.FeType
                    const rowSelected = row._isNew || selectedRowKeys.has(getRowKey(row, i))
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
                              rowIndex={i}
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
                                title={copiedCellKey === `${i}-${name}` ? 'Copied' : 'Copy full value'}
                                onClick={(e: any) => copyCellValue(row[name], `${i}-${name}`, e)}
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
                          onClick={() => onRemoveNewRow(i)}
                        />
                      ) : null}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )
          ) : sortedData.length === 0 ? (
            /* ── Read-only empty state ────────────────────────────────── */
            <TableRow className="dynamic-table-empty-row" style={{ gridTemplateColumns: '1fr' }}>
              <TableCell className="dynamic-table-empty-cell" {...({ colSpan: tableColumnCount } as any)}>
                <Icon name={'table-view' as any} className="dynamic-table-empty-icon" />
                <Title level="H5">No records found</Title>
                <Text>Adjust the filters or create a new record.</Text>
              </TableCell>
            </TableRow>
          ) : (
            /* ── Read-only rows ───────────────────────────────────────── */
            sortedData.map((row, i) => {
              const pendingApproval = isRowPending(row, i)
              return (
                <TableRow
                  className={`dynamic-table-data-row${selectedRowKeys.has(getRowKey(row, i)) ? ' dynamic-table-data-row--selected' : ''}${pendingApproval ? ' dynamic-table-data-row--pending' : ''}`}
                  key={i}
                  interactive={!activeTableLock && !pendingApproval}
                  title={pendingApproval ? 'This record is waiting for ADMIN approval.' : undefined}
                  onClick={() => {
                    if (activeTableLock || pendingApproval) return
                    toggleRowSelection(getRowKey(row, i), !selectedRowKeys.has(getRowKey(row, i)))
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
                    <CheckBox
                      checked={selectedRowKeys.has(getRowKey(row, i))}
                      disabled={!!activeTableLock || pendingApproval}
                      onChange={(e: any) => {
                        e.stopPropagation()
                        toggleRowSelection(getRowKey(row, i), e.target.checked)
                      }}
                    />
                    {pendingApproval && (
                      <Icon
                        name={'locked' as any}
                        className="dynamic-table-pending-lock"
                        title="Waiting for ADMIN approval"
                      />
                    )}
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
      <div className="dynamic-table-bottom-spacer" aria-hidden="true" />
    </div>
  )
}
