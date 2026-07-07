import { useEffect, useMemo, useState } from 'react'
import {
  Table,
  TableHeaderRow,
  TableHeaderCell,
  TableRow,
  TableCell,
  BusyIndicator,
  Text,
  Button,
  CheckBox,
  Label,
  Title,
  Toolbar,
  ToolbarSpacer,
  FlexBox,
  Icon,
  ObjectStatus,
} from '@ui5/webcomponents-react'
import CellEditControl from './CellEditControl'
import { formatHeaderLabel } from '../utils/tableHelpers'
import { formatCellValue } from '../utils/displayHelpers'
import { buildRecordKeyString } from '../utils/recordHelpers'

import { AiDescriptionMap, FieldMeta, TableConfig, TableRowData } from '../types'

interface DynamicDataTableProps {
  selectedTable: TableConfig
  fields: FieldMeta[]
  filteredData: TableRowData[]
  dataLoading: boolean
  isEditingTable: boolean
  editedData: TableRowData[]
  inlineErrors: Record<number, Record<string, string>>
  activeTableLock: { lockedBy: string } | null
  onCellChange: (rowIndex: number, fieldName: string, newValue: any) => void
  onAddRow: () => void
  onRemoveNewRow: (rowIndex: number) => void
  onSaveInlineEdits: () => void
  onCancelInlineEdits: () => void
  onStartEditing: () => void
  onStartCreating: () => void
  onRefresh: () => void
  onDeleteRows: (rows: TableRowData[]) => void
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
  onCellChange,
  onAddRow,
  onRemoveNewRow,
  onSaveInlineEdits,
  onCancelInlineEdits,
  onStartEditing,
  onStartCreating,
  onRefresh,
  onDeleteRows,
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

  const fieldsWithWidths = fields.map(f => {
    const technicalName = f.field_name || f.FieldName
    const headerLabel = formatHeaderLabel(f)
    const feType = f.fe_type || f.FeType
    const isDate = feType === 'date'
    const isDomain = feType === 'domain' || feType === 'fk_select'
    const hasKeyIcon = f.is_key || f.IsKeyField === 'X'
    const minColWidth = Math.max(
      isDate ? 260 : isDomain ? 200 : 150,
      headerLabel.length * 10 + 80 + (hasKeyIcon ? 18 : 0)
    )
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

  const filteredRowKeys = useMemo(
    () => filteredData.map((row, index) => getRowKey(row, index)),
    [filteredData, fields]
  )

  useEffect(() => {
    if (isEditingTable) return
    setSelectedRowKeys(prev => {
      if (prev.size === 0) return prev
      const visible = new Set(filteredRowKeys)
      const next = new Set([...prev].filter(key => visible.has(key)))
      return next.size === prev.size ? prev : next
    })
  }, [filteredRowKeys, isEditingTable])

  useEffect(() => {
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
  const selectedRows = filteredData.filter((row, index) => selectedRowKeys.has(getRowKey(row, index)))
  const hasNewRows = isEditingTable && editedData.some(row => row._isNew)
  const allVisibleRowsSelected =
    filteredRowKeys.length > 0 && filteredRowKeys.every(key => selectedRowKeys.has(key))

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
      filteredRowKeys.forEach(key => {
        if (checked) next.add(key)
        else next.delete(key)
      })
      return next
    })
  }

  const startEditingSelectedRows = () => {
    if (selectedRowKeys.size === 0) return
    onStartEditing()
  }

  const deleteSelectedRow = () => {
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
    setSelectedRowKeys(new Set())
    onStartCreating()
  }

  const cancelInlineEditing = () => {
    setSelectedRowKeys(new Set())
    onCancelInlineEdits()
  }

  const selectionColumnWidth = 72
  const totalTableWidth = fieldsWithWidths.reduce(
    (sum, item) => sum + item.minColWidth,
    selectionColumnWidth + (hasNewRows ? 100 : 0)
  )
  const columnsStyle =
    `${selectionColumnWidth}px ${fieldsWithWidths.map(item => `${item.minColWidth}px`).join(' ')}${hasNewRows ? ' 100px' : ''}`
  const tableColumnCount = fields.length + 1 + (hasNewRows ? 1 : 0)
  const selectionCellStyle = {
    minWidth: `${selectionColumnWidth}px`,
    boxSizing: 'border-box',
    display: 'flex',
    justifyContent: 'center',
    paddingInline: '12px',
    overflow: 'visible',
  } as const

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <Toolbar design="Transparent" style={{ width: '100%', boxSizing: 'border-box' }}>
        <Title level="H4">
          Records ({isEditingTable ? editedData.length : filteredData.length})
        </Title>
        <ToolbarSpacer />
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
              icon={'edit' as any}
              disabled={!!activeTableLock || selectedRowCount === 0}
              onClick={startEditingSelectedRows}
            >
              {selectedRowCount > 0 ? `Edit (${selectedRowCount})` : 'Edit'}
            </Button>
            <Button
              design="Transparent"
              icon={'delete' as any}
              disabled={!!activeTableLock || selectedRowCount === 0}
              onClick={deleteSelectedRow}
            >
              {selectedRowCount > 1 ? `Delete (${selectedRowCount})` : 'Delete'}
            </Button>
            <Button
              design="Transparent"
              icon={'add' as any}
              disabled={!!activeTableLock}
              onClick={startCreatingNewRow}
            >
              Create
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
      </Toolbar>

      {/* ── Loading indicator ─────────────────────────────────────────── */}
      {dataLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem' }}>
          <BusyIndicator active size="S" />
        </div>
      )}

      {/* ── Scrollable Table Wrapper ───────────────────────────────────── */}
      <div
        className={`dynamic-table-scroll${isEditingTable ? ' dynamic-table-scroll--editing' : ''}`}
        onScroll={() => setActiveAiTooltip(null)}
      >
        <Table
          overflowMode="Scroll"
          style={{ minWidth: `${totalTableWidth}px`, width: '100%' }}
          headerRow={
            <TableHeaderRow style={{ gridTemplateColumns: columnsStyle }}>
              <TableHeaderCell minWidth={`${selectionColumnWidth}px`} style={selectionCellStyle}>
                <CheckBox
                  checked={allVisibleRowsSelected}
                  disabled={filteredRowKeys.length === 0 || isEditingTable}
                  onChange={(e: any) => toggleAllVisibleRows(e.target.checked)}
                />
              </TableHeaderCell>
              {fieldsWithWidths.map(({ field: f, minColWidth, headerLabel }) => {
                const technicalName = f.field_name || f.FieldName
                return (
                  <TableHeaderCell
                    key={technicalName}
                    width={`${minColWidth}px`}
                    minWidth={`${minColWidth}px`}
                    style={{ minWidth: `${minColWidth}px` }}
                  >
                    <FlexBox alignItems="Center" gap="5px" style={{ width: '100%', minWidth: 0 }}>
                      <Label
                        title={`${headerLabel} (${technicalName})`}
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          minWidth: 0,
                        }}
                      >
                        {headerLabel}
                      </Label>
                      {(f.is_key || f.IsKeyField === 'X') && (
                        <Icon
                          name="key"
                          style={{ minWidth: '12px', width: '12px', height: '12px', color: '#e09d00' }}
                        />
                      )}
                      {onRequestAiDescriptions && (
                        <button
                          type="button"
                          className="ai-field-tooltip-button"
                          aria-label={`Show AI description for ${headerLabel}`}
                          onClick={(event) => openAiTooltip(technicalName, headerLabel, event)}
                        >
                          ?
                        </button>
                      )}
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
          {/* ── Inline edit mode ──────────────────────────────────────── */}
          {isEditingTable ? (
            editedData.length === 0 ? (
              <TableRow>
                <TableCell {...({ colSpan: tableColumnCount } as any)}>
                  <Text>No data available</Text>
                </TableCell>
              </TableRow>
            ) : (
              editedData.map((row, i) => (
                <TableRow key={i} style={{ gridTemplateColumns: columnsStyle }}>
                  <TableCell style={selectionCellStyle}>
                    <CheckBox checked={row._isNew || selectedRowKeys.has(getRowKey(row, i))} disabled />
                  </TableCell>
                  {fieldsWithWidths.map(({ field: f, minColWidth }) => {
                    const name = f.field_name || f.FieldName
                    const feType = f.fe_type || f.FeType
                    const rowSelected = row._isNew || selectedRowKeys.has(getRowKey(row, i))
                    const singleLine = shouldKeepCellSingleLine(f, row[name])
                    return (
                      <TableCell
                        key={name}
                        style={{
                          minWidth: `${minColWidth}px`,
                          overflow: feType === 'date' || feType === 'fk_select' ? 'visible' : undefined,
                        }}
                      >
                        {rowSelected ? (
                          <CellEditControl
                            row={row}
                            rowIndex={i}
                            field={f}
                            inlineErrors={inlineErrors}
                            configUuid={selectedTable.ConfigUuid}
                            tableName={selectedTable.TableName}
                            onCellChange={onCellChange}
                          />
                        ) : (
                          <FlexBox alignItems="Center" gap="4px" style={{ width: '100%', minWidth: 0 }}>
                            <Text
                              title={String(row[name] ?? '')}
                              style={{
                                color: '#32363a',
                                overflow: 'hidden',
                                textOverflow: singleLine ? 'ellipsis' : undefined,
                                whiteSpace: singleLine ? 'nowrap' : 'normal',
                                overflowWrap: singleLine ? undefined : 'anywhere',
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
          ) : filteredData.length === 0 ? (
            /* ── Read-only empty state ────────────────────────────────── */
            <TableRow>
              <TableCell {...({ colSpan: tableColumnCount } as any)}>
                <Text>No data available</Text>
              </TableCell>
            </TableRow>
          ) : (
            /* ── Read-only rows ───────────────────────────────────────── */
            filteredData.map((row, i) => (
              <TableRow
                key={i}
                interactive={!activeTableLock}
                onClick={() => {
                  if (activeTableLock) return
                  toggleRowSelection(getRowKey(row, i), !selectedRowKeys.has(getRowKey(row, i)))
                }}
                style={{ gridTemplateColumns: columnsStyle }}
              >
                <TableCell
                  style={selectionCellStyle}
                  onClick={(e: any) => e.stopPropagation()}
                >
                  <CheckBox
                    checked={selectedRowKeys.has(getRowKey(row, i))}
                    disabled={!!activeTableLock}
                    onChange={(e: any) => {
                      e.stopPropagation()
                      toggleRowSelection(getRowKey(row, i), e.target.checked)
                    }}
                  />
                </TableCell>
                {fieldsWithWidths.map(({ field: f, minColWidth }) => {
                  const name = f.field_name || f.FieldName
                  const val = row[name]
                  const singleLine = shouldKeepCellSingleLine(f, val)

                  if (name.toUpperCase() === 'STATUS') {
                    const valStr = String(val ?? '').toUpperCase()
                    const isActive =
                      valStr === 'A' || valStr === 'ACTIVE' || valStr === 'X'
                    const isInactive = valStr === 'I' || valStr === 'INACTIVE'
                    return (
                      <TableCell key={name} style={{ minWidth: `${minColWidth}px` }}>
                        <ObjectStatus
                          state={isActive ? 'Positive' : isInactive ? 'Negative' : 'None'}
                        >
                          {isActive ? 'Active' : isInactive ? 'Inactive' : valStr || '—'}
                        </ObjectStatus>
                      </TableCell>
                    )
                  }

                  return (
                    <TableCell key={name} style={{ minWidth: `${minColWidth}px` }}>
                      <FlexBox alignItems="Center" gap="4px" style={{ width: '100%', minWidth: 0 }}>
                        <Text
                          title={String(val ?? '')}
                          style={{
                            color: '#32363a',
                            overflow: 'hidden',
                            textOverflow: singleLine ? 'ellipsis' : undefined,
                            whiteSpace: singleLine ? 'nowrap' : 'normal',
                            overflowWrap: singleLine ? undefined : 'anywhere',
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
            ))
          )}
        </Table>
      </div>
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
