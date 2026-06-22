import {
  Table,
  TableHeaderRow,
  TableHeaderCell,
  TableRow,
  TableCell,
  BusyIndicator,
  Text,
  Button,
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

import { FieldMeta, TableConfig, TableRowData } from '../types'

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
  onEditRow: (row: TableRowData) => void
  onDeleteRow: (row: TableRowData) => void
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
  onEditRow,
  onDeleteRow,
}: DynamicDataTableProps) {
  const fieldsWithWidths = fields.map(f => {
    const headerLabel = formatHeaderLabel(f)
    const technicalName = f.field_name || f.FieldName
    const feType = f.fe_type || f.FeType
    const isDate = feType === 'date'
    const isDomain = feType === 'domain'
    const minColWidth = Math.max(
      isDate ? 260 : isDomain ? 200 : 150,
      headerLabel.length * 10 + 50
    )
    return { field: f, minColWidth, headerLabel, technicalName }
  })

  const totalTableWidth = fieldsWithWidths.reduce((sum, item) => sum + item.minColWidth, 100)
  const columnsStyle =
    fieldsWithWidths.map(item => `${item.minColWidth}px`).join(' ') + ' 100px'

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
            <Button design="Transparent" icon={'decline' as any} onClick={onCancelInlineEdits}>
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
              disabled={!!activeTableLock}
              onClick={onStartEditing}
            >
              Edit
            </Button>
            <Button
              design="Transparent"
              icon={'add' as any}
              disabled={!!activeTableLock}
              onClick={onStartCreating}
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
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <Table
          overflowMode="Scroll"
          style={{ minWidth: `${totalTableWidth}px`, width: '100%' }}
          headerRow={
            <TableHeaderRow style={{ gridTemplateColumns: columnsStyle }}>
              {fieldsWithWidths.map(({ field: f, minColWidth, headerLabel }) => {
                const technicalName = f.field_name || f.FieldName
                return (
                  <TableHeaderCell
                    key={technicalName}
                    width={`${minColWidth}px`}
                    minWidth={`${minColWidth}px`}
                    style={{ minWidth: `${minColWidth}px` }}
                  >
                    <FlexBox alignItems="Center" gap="4px" style={{ width: '100%' }}>
                      <Label
                        title={`${headerLabel} (${technicalName})`}
                        style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
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
                    </FlexBox>
                  </TableHeaderCell>
                )
              })}
              <TableHeaderCell minWidth="100px" style={{ minWidth: '100px' }}>
                <Label>Actions</Label>
              </TableHeaderCell>
            </TableHeaderRow>
          }
        >
          {/* ── Inline edit mode ──────────────────────────────────────── */}
          {isEditingTable ? (
            editedData.length === 0 ? (
              <TableRow>
                <TableCell {...({ colSpan: fields.length + 1 } as any)}>
                  <Text>No data available</Text>
                </TableCell>
              </TableRow>
            ) : (
              editedData.map((row, i) => (
                <TableRow key={i} style={{ gridTemplateColumns: columnsStyle }}>
                  {fieldsWithWidths.map(({ field: f, minColWidth }) => {
                    const name = f.field_name || f.FieldName
                    const feType = f.fe_type || f.FeType
                    return (
                      <TableCell
                        key={name}
                        style={{
                          minWidth: `${minColWidth}px`,
                          overflow: feType === 'date' ? 'visible' : undefined,
                        }}
                      >
                        <CellEditControl
                          row={row}
                          rowIndex={i}
                          field={f}
                          inlineErrors={inlineErrors}
                          configUuid={selectedTable.ConfigUuid}
                          onCellChange={onCellChange}
                        />
                      </TableCell>
                    )
                  })}
                  <TableCell>
                    {row._isNew ? (
                      <Button
                        design="Transparent"
                        icon={'delete' as any}
                        accessibleName="Remove new record"
                        onClick={() => onRemoveNewRow(i)}
                      />
                    ) : (
                      <Button
                        design="Transparent"
                        icon={'delete' as any}
                        accessibleName="Delete record"
                        onClick={() => onDeleteRow(row)}
                      />
                    )}
                  </TableCell>
                </TableRow>
              ))
            )
          ) : filteredData.length === 0 ? (
            /* ── Read-only empty state ────────────────────────────────── */
            <TableRow>
              <TableCell {...({ colSpan: fields.length + 1 } as any)}>
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
                  onEditRow(row)
                }}
                style={{ gridTemplateColumns: columnsStyle }}
              >
                {fieldsWithWidths.map(({ field: f, minColWidth }) => {
                  const name = f.field_name || f.FieldName
                  const val = row[name]

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
                      <Text style={{ color: '#32363a' }}>{formatCellValue(f, val)}</Text>
                    </TableCell>
                  )
                })}
                <TableCell onClick={(e: any) => e.stopPropagation()}>
                  <Button
                    design="Transparent"
                    icon={'edit' as any}
                    accessibleName="Edit record"
                    disabled={!!activeTableLock}
                    onClick={(e: any) => {
                      e.stopPropagation()
                      onEditRow(row)
                    }}
                  />
                  <Button
                    design="Transparent"
                    icon={'delete' as any}
                    accessibleName="Delete record"
                    disabled={!!activeTableLock}
                    onClick={(e: any) => {
                      e.stopPropagation()
                      onDeleteRow(row)
                    }}
                  />
                </TableCell>
              </TableRow>
            ))
          )}
        </Table>
      </div>
    </div>
  )
}
