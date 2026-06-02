import { useState, useCallback } from 'react'
import {
  FlexBox,
  ComboBox,
  ComboBoxItem,
  Button,
  Dialog,
  Bar,
  Input,
  Table,
  TableHeaderRow,
  TableHeaderCell,
  TableRow,
  TableCell,
  Label,
  Text,
  BusyIndicator
} from '@ui5/webcomponents-react'
import { getDomainValues } from '../services/tableConfigApi'
import { getSapErrorMessage } from '../services/apiClient'
import { getDomainKey } from '../utils/recordHelpers'
import { FieldMeta } from '../types'


interface DomainValueHelpProps {
  configUuid: string;
  field: FieldMeta;
  value: string;
  onChange: (value: string) => void;
  readonly: boolean;
  inputId?: string;
}

export default function DomainValueHelp({
  configUuid,
  field,
  value,
  onChange,
  readonly,
  inputId
}: DomainValueHelpProps) {
  const domainKey = getDomainKey(field)
  const [options, setOptions] = useState<Array<{ value: string; description: string }>>([])
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)
  const [helpSearch, setHelpSearch] = useState('')
  const [filterText, setFilterText] = useState('')

  const loadOptions = useCallback(
    async () => {
      if (!configUuid || !domainKey) return
      setLoading(true)
      setLoadError('')
      try {
        const rows = await getDomainValues(configUuid, domainKey, '')
        setOptions(rows)
      } catch (e: any) {
        setLoadError(getSapErrorMessage(e))
        setOptions([])
      } finally {
        setLoading(false)
      }
    },
    [configUuid, domainKey]
  )

  function selectValue(val: string) {
    onChange(val)
    setHelpOpen(false)
    setHelpSearch('')
    setFilterText('')
  }

  function handleComboInput(e: any) {
    const text = e.target.value ?? ''
    setFilterText(text)
    if (!text) onChange('')
  }

  const label = field.LabelText || field.FieldName

  if (readonly) {
    const text = options.find(o => o.value === value)?.description || value
    return <Text>{text || value || ''}</Text>
  }

  const filteredOptions = options.filter(o => {
    const term = (helpSearch || '').trim().toLowerCase()
    if (!term) return true
    return (
      o.value.toLowerCase().includes(term) ||
      (o.description || '').toLowerCase().includes(term)
    )
  })

  return (
    <>
      <FlexBox alignItems="Center" style={{ gap: '0.35rem', width: '100%' }}>
        <ComboBox
          id={inputId}
          style={{ flex: 1, minWidth: 0 }}
          value={value}
          placeholder={`Type to search ${label}...`}
          filter="Contains"
          loading={loading}
          onOpen={() => {
            if (options.length === 0) loadOptions()
          }}
          onInput={handleComboInput}
          onSelectionChange={(e: any) => {
            const selected = e.detail.item
            if (selected) {
              selectValue(selected.value ?? '')
            }
          }}
        >
          {options.map(o => (
            <ComboBoxItem
              key={`${o.value}-${o.description}`}
              value={o.value}
              text={`${o.value} — ${o.description || o.value}`}
            />
          ))}
        </ComboBox>
        <Button
          icon={"value-help" as any}
          design="Transparent"
          title="Value help (F4)"
          disabled={loading || !domainKey}
          onClick={() => {
            setHelpSearch(filterText || '')
            setHelpOpen(true)
            if (options.length === 0) loadOptions()
          }}
        />
      </FlexBox>

      {loadError && (
        <Text style={{ fontSize: '0.8rem', color: '#bb0000', marginTop: '4px' }}>
          {loadError}
        </Text>
      )}

      <Dialog
        open={helpOpen}
        headerText={`Value Help — ${label}`}
        style={{ width: '560px' }}
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
          Domain: {domainKey}
        </Text>
        <Input
          icon={"search" as any}
          placeholder="Type to search (client-side)..."
          value={helpSearch}
          onInput={(e: any) => setHelpSearch(e.target.value)}
          style={{ width: '100%', marginBottom: '0.75rem' }}
        />
        {loading && <BusyIndicator active size="M" />}
        {!loading && (
          <Table
            style={{ maxHeight: '320px' }}
            headerRow={
              <TableHeaderRow>
                <TableHeaderCell minWidth="120px"><Label>Value</Label></TableHeaderCell>
                <TableHeaderCell minWidth="200px"><Label>Description</Label></TableHeaderCell>
              </TableHeaderRow>
            }
          >
            {filteredOptions.length === 0 ? (
              <TableRow>
                <TableCell {...({ colSpan: 2 } as any)}>
                  <Text>No values found</Text>
                </TableCell>
              </TableRow>
            ) : (
              filteredOptions.map(o => (
                <TableRow
                  key={o.value}
                  onClick={() => selectValue(o.value)}
                  style={{ cursor: 'pointer' }}
                >
                  <TableCell>
                    <Text>{o.value}</Text>
                  </TableCell>
                  <TableCell>
                    <Text>{o.description || ''}</Text>
                  </TableCell>
                </TableRow>
              ))
            )}
          </Table>
        )}
      </Dialog>
    </>
  )
}
