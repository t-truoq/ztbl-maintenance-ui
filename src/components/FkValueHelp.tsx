import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  Button,
  ComboBox,
  ComboBoxItem,
  Dialog,
  FlexBox,
  Input,
  Label,
  Table,
  TableCell,
  TableHeaderCell,
  TableHeaderRow,
  TableRow,
  Text
} from '@ui5/webcomponents-react'
import { getFkValues } from '../services/tableConfigApi'
import { getSapErrorMessage } from '../services/apiClient'
import { FieldMeta } from '../types'
import { FkValueOption } from '../services/fkValueCache'

interface FkValueHelpProps {
  configUuid: string;
  tableName: string;
  field: FieldMeta;
  value: string;
  onChange: (value: string) => void;
  readonly?: boolean;
  inputId?: string;
  valueState?: 'None' | 'Negative' | 'Critical' | 'Positive' | 'Information';
  valueStateMessage?: any;
}

function fieldName(field: FieldMeta): string {
  return field.field_name || field.FieldName
}

export default function FkValueHelp({
  configUuid,
  tableName,
  field,
  value,
  onChange,
  readonly = false,
  inputId,
  valueState,
  valueStateMessage
}: FkValueHelpProps) {
  const name = fieldName(field)
  const label = field.label || field.LabelText || name
  const [options, setOptions] = useState<FkValueOption[]>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [openedOnce, setOpenedOnce] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpSearch, setHelpSearch] = useState('')
  const loadingRef = useRef(false)
  const loadedKeyRef = useRef('')

  const selected = useMemo(
    () => options.find(option => option.value === value),
    [options, value]
  )

  const loadOptions = useCallback(async () => {
    if (!configUuid || !tableName || !name || loadingRef.current) return
    loadingRef.current = true
    setLoading(true)
    setLoadError('')
    try {
      const rows = await getFkValues(configUuid, tableName, name)
      setOptions(rows)
    } catch (e: any) {
      setLoadError(getSapErrorMessage(e))
      setOptions([])
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [configUuid, tableName, name])

  useEffect(() => {
    const key = `${configUuid}|${tableName}|${name}`
    if (!configUuid || !tableName || !name || loadedKeyRef.current === key) return
    loadedKeyRef.current = key
    setOpenedOnce(true)
    setOptions([])
    setLoadError('')
    loadOptions()
  }, [configUuid, tableName, name, loadOptions])

  function ensureLoaded() {
    setOpenedOnce(true)
    if (options.length === 0) loadOptions()
  }

  function selectValue(option: FkValueOption) {
    onChange(option.value)
    setHelpOpen(false)
    setHelpSearch('')
  }

  if (readonly) {
    return <Text>{selected?.label || value || ''}</Text>
  }

  const filteredOptions = options.filter(option => {
    const term = helpSearch.trim().toLowerCase()
    if (!term) return true
    return (
      option.value.toLowerCase().includes(term) ||
      option.label.toLowerCase().includes(term) ||
      JSON.stringify(option.row || {}).toLowerCase().includes(term)
    )
  })

  return (
    <>
      <FlexBox className="fk-value-help" direction="Column">
        <FlexBox className="fk-value-help-row" alignItems="Center">
          <ComboBox
            id={inputId}
            className="fk-value-help-combobox"
            value={selected?.label || value || ''}
            placeholder={`Select ${label}...`}
            filter="Contains"
            loading={loading}
            valueState={valueState}
            valueStateMessage={valueStateMessage}
            onOpen={ensureLoaded}
            onInput={(e: any) => {
              const text = String(e.target.value || '')
              if (!text.trim()) onChange('')
            }}
            onSelectionChange={(e: any) => {
              const selectedItem = e.detail.item
              if (selectedItem) {
                onChange(selectedItem.value ?? '')
              }
            }}
          >
            {options.map(option => (
              <ComboBoxItem
                key={option.value}
                value={option.value}
                text={option.label || option.value}
                additionalText={option.label !== option.value ? option.value : undefined}
              />
            ))}
          </ComboBox>
          <Button
            className="fk-value-help-button"
            icon={"value-help" as any}
            design="Transparent"
            title={`Value help - ${label}`}
            disabled={loading}
            onClick={() => {
              setHelpSearch('')
              setHelpOpen(true)
              ensureLoaded()
            }}
          />
        </FlexBox>
      {loadError && (
        <Text style={{ fontSize: '0.8rem', color: '#bb0000', marginTop: '4px' }}>
          {loadError}
        </Text>
      )}
      {!loading && openedOnce && options.length === 0 && !loadError && (
        <Text style={{ fontSize: '0.8rem', color: '#6a7075', marginTop: '4px' }}>
          No parent values found
        </Text>
      )}
      </FlexBox>

      <Dialog
        open={helpOpen}
        headerText={`Value Help - ${label}`}
        style={{ width: '640px' }}
        footer={
          <Bar
            design="Footer"
            endContent={
              <Button design="Emphasized" onClick={() => setHelpOpen(false)}>
                Close
              </Button>
            }
          />
        }
      >
        <Text style={{ marginBottom: '0.5rem', color: '#6a7075' }}>
          Parent values for {tableName}.{name}
        </Text>
        <Input
          icon={"search" as any}
          placeholder="Search key or description..."
          value={helpSearch}
          onInput={(e: any) => setHelpSearch(e.target.value)}
          style={{ width: '100%', marginBottom: '0.75rem' }}
        />
        <Table
          style={{ maxHeight: '360px' }}
          headerRow={
            <TableHeaderRow>
              <TableHeaderCell minWidth="180px"><Label>Value</Label></TableHeaderCell>
              <TableHeaderCell minWidth="240px"><Label>Description</Label></TableHeaderCell>
            </TableHeaderRow>
          }
        >
          {filteredOptions.length === 0 ? (
            <TableRow>
              <TableCell {...({ colSpan: 2 } as any)}>
                <Text>{loading ? 'Loading parent values...' : 'No parent values found'}</Text>
              </TableCell>
            </TableRow>
          ) : (
            filteredOptions.map(option => (
              <TableRow
                key={option.value}
                onClick={() => selectValue(option)}
                style={{ cursor: 'pointer' }}
              >
                <TableCell>
                  <Text>{option.value}</Text>
                </TableCell>
                <TableCell>
                  <Text>{option.label || option.value}</Text>
                </TableCell>
              </TableRow>
            ))
          )}
        </Table>
      </Dialog>
    </>
  )
}
