import { useRef } from 'react'
import { Input, CheckBox, Icon } from '@ui5/webcomponents-react'
import { formatDateForSap } from '../utils/displayHelpers'
import { formatCellValue } from '../utils/displayHelpers'
import { isFieldReadonly, isSystemGeneratedField } from '../utils/recordHelpers'
import DomainValueHelp from './DomainValueHelp'
import { FieldMeta, TableRowData } from '../types'

interface CellEditControlProps {
  row: TableRowData
  rowIndex: number
  field: FieldMeta
  inlineErrors: Record<number, Record<string, string>>
  configUuid: string
  onCellChange: (rowIndex: number, fieldName: string, newValue: any) => void
}

/**
 * Renders the appropriate edit control for a single table cell
 * based on the field's fe_type (date, boolean, domain, text).
 * Falls back to a read-only Text display for key/system-generated fields.
 */
export default function CellEditControl({
  row,
  rowIndex,
  field: f,
  inlineErrors,
  configUuid,
  onCellChange,
}: CellEditControlProps) {
  const dateInputRef = useRef<HTMLInputElement | null>(null)
  const name = f.field_name || f.FieldName
  const val = row[name] ?? ''
  const isNewRow = !!row._isNew
  const mode = isNewRow ? 'create' : 'edit'

  const readonly =
    isFieldReadonly(f, mode) ||
    isSystemGeneratedField(f) ||
    (mode === 'edit' && (f.is_key || f.IsKeyField === 'X'))

  if (readonly) {
    return (
      <span style={{ color: '#6a7075', fontSize: '0.875rem' }}>
        {formatCellValue(f, val)}
      </span>
    )
  }

  const feType = f.fe_type || f.FeType
  const cellError = inlineErrors[rowIndex]?.[name]

  // ── Date ──────────────────────────────────────────────────────────────────
  // Use native HTML date input — UI5 DatePicker's calendar button is rendered
  // outside its host element and gets clipped by the table cell's overflow:hidden.
  if (feType === 'date') {
    const nativeVal = val ? String(val).substring(0, 10) : ''
    return (
      <span className="fiori-date-input-wrap">
        <button
          type="button"
          className="fiori-date-trailing-button"
          aria-label="Choose date"
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            const input = dateInputRef.current as any
            if (input?.showPicker) input.showPicker()
            else dateInputRef.current?.focus()
          }}
        >
          <Icon name="calendar" />
        </button>
        <input
          ref={dateInputRef}
          type="date"
          className="fiori-native-date-input fiori-native-date-input--trailing"
          value={nativeVal}
          onChange={e => onCellChange(rowIndex, name, formatDateForSap(e.target.value))}
          title={cellError || ''}
          style={{
            width: '100%',
            height: '36px',
            padding: '0 2.25rem 0 8px',
            border: cellError
              ? '2px solid var(--sapField_InvalidColor, #bb0000)'
              : '1px solid var(--sapField_BorderColor, #89919a)',
            borderRadius: '4px',
            background: 'var(--sapField_Background, #fff)',
            color: 'var(--sapTextColor, #32363a)',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            outline: 'none',
            cursor: 'pointer',
          }}
          onFocus={e => {
            e.target.style.border = cellError
              ? '2px solid var(--sapField_InvalidColor, #bb0000)'
              : '2px solid var(--sapField_Hover_BorderColor, #0a6ed1)'
          }}
          onBlur={e => {
            e.target.style.border = cellError
              ? '2px solid var(--sapField_InvalidColor, #bb0000)'
              : '1px solid var(--sapField_BorderColor, #89919a)'
          }}
        />
      </span>
    )
  }

  // ── Boolean ───────────────────────────────────────────────────────────────
  if (feType === 'boolean') {
    const isChecked = val === 'X' || val === true
    return (
      <CheckBox
        checked={isChecked}
        onChange={(e: any) => onCellChange(rowIndex, name, e.target.checked ? 'X' : '')}
      />
    )
  }

  // ── Domain ────────────────────────────────────────────────────────────────
  if (feType === 'domain') {
    return (
      <DomainValueHelp
        configUuid={configUuid}
        field={f}
        value={val}
        onChange={newVal => onCellChange(rowIndex, name, newVal)}
        readonly={false}
        valueState={cellError ? 'Negative' : 'None'}
        valueStateMessage={
          cellError ? <div slot="valueStateMessage">{cellError}</div> : undefined
        }
      />
    )
  }

  // ── Text (default) ────────────────────────────────────────────────────────
  return (
    <Input
      value={val}
      onInput={(e: any) => onCellChange(rowIndex, name, e.target.value)}
      style={{ width: '100%' }}
      valueState={cellError ? 'Negative' : 'None'}
      valueStateMessage={
        cellError ? <div slot="valueStateMessage">{cellError}</div> : undefined
      }
    />
  )
}
