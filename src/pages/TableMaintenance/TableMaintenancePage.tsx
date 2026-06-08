import { useState, useEffect, useRef } from 'react'
import { formatDateForSap } from '../../utils/displayHelpers'
import {
  DynamicPage,
  DynamicPageTitle,
  DynamicPageHeader,
  FlexBox,
  Title,
  Text,
  Button,
  Table,
  TableHeaderRow,
  TableHeaderCell,
  TableRow,
  TableCell,
  Input,
  BusyIndicator,
  MessageStrip,
  Tag,
  Label,
  Toolbar,
  ToolbarSpacer,
  ToolbarSeparator,
  Dialog,
  Bar,
  TabContainer,
  Tab,
  MessageBox,
  MessageBoxType,
  MessageBoxAction,
  Icon,
  ObjectStatus,
  Card,
  CardHeader,
  ComboBox,
  ComboBoxItem,
  DatePicker,
  CheckBox
} from '@ui5/webcomponents-react'
import {
  loadTableContext,
  getTableData,
  createRecord,
  updateRecord,
  deleteRecord,
  parseTableDataJson,
  getFriendlyErrorMessage,
  formatActionErrorMessage,
  normalizeConfigUuid,
  isOptimisticLockError,
  isFKReferenceError,
  parseFKErrorMessage
} from '../../services/tableConfigApi'
import { clearDomainCache } from '../../services/domainCache'
import {
  buildKeyRecord,
  buildRecordKeyString,
  buildFullRecordPayload,
  formatDeleteSummary,
  buildEtagMap,
  resolveEtagForUpdate,
  mergeRecordForConcurrentEdit,
  initFormValues,
  validateMandatory,
  isFieldReadonly,
  isSystemGeneratedField
} from '../../utils/recordHelpers'
import { formatCellValue } from '../../utils/displayHelpers'
import RecordDialog from '../../components/RecordDialog'
import DomainValueHelp from '../../components/DomainValueHelp'
import AuditLogPanel from '../../components/AuditLogPanel'
import { FieldMeta, TableConfig, TableRowData } from '../../types'

function formatHeaderLabel(f: FieldMeta) {
  const rawLabel = f.label || f.LabelText
  if (rawLabel) return rawLabel

  const technicalName = f.field_name || f.FieldName || ''
  return technicalName
    .toLowerCase()
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

interface TableMaintenancePageProps {
  selectedTable: TableConfig | null;
  tables: TableConfig[];
  username: string;
  onRefreshTableList: () => Promise<void>;
  onSelectTable: (table: TableConfig | null) => void;
}

export default function TableMaintenancePage({
  selectedTable,
  tables,
  username,
  onRefreshTableList,
  onSelectTable
}: TableMaintenancePageProps) {
  const [allFields, setAllFields] = useState<FieldMeta[]>([])
  const [fields, setFields] = useState<FieldMeta[]>([])
  const [data, setData] = useState<TableRowData[]>([])
  const [tableDataJson, setTableDataJson] = useState('')
  const [etagMap, setEtagMap] = useState<Record<string, { field: string; value: string }>>({})
  const [editSessionEtag, setEditSessionEtag] = useState<any>(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [appliedSearchQuery, setAppliedSearchQuery] = useState('')
  const [appliedFilterValues, setAppliedFilterValues] = useState<Record<string, string>>({})

  const [isEditingTable, setIsEditingTable] = useState(false)
  const [editedData, setEditedData] = useState<TableRowData[]>([])

  const [recordDialogOpen, setRecordDialogOpen] = useState(false)
  const [recordDialogMode, setRecordDialogMode] = useState<'create' | 'edit'>('create')
  const [editingRow, setEditingRow] = useState<TableRowData | null>(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingRow, setDeletingRow] = useState<TableRowData | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [optimisticLockOpen, setOptimisticLockOpen] = useState(false)
  const [fkErrorOpen, setFkErrorOpen] = useState(false)
  const [fkErrorMessage, setFkErrorMessage] = useState('')

  const latestActiveTableUuidRef = useRef<string | null>(null)

  useEffect(() => {
    if (selectedTable) {
      loadTable(selectedTable)
    } else {
      clearPageData()
    }
  }, [selectedTable])

  useEffect(() => {
    if (!successMsg) return
    const timer = setTimeout(() => setSuccessMsg(''), 3000)
    return () => clearTimeout(timer)
  }, [successMsg])

  useEffect(() => {
    const hideToggle = () => {
      const dynamicPage = document.querySelector('ui5-dynamic-page')
      if (dynamicPage && dynamicPage.shadowRoot) {
        if (dynamicPage.shadowRoot.querySelector('#hide-collapse-style')) return
        const style = document.createElement('style')
        style.id = 'hide-collapse-style'
        style.textContent = `
          ui5-dynamic-page-header-actions {
            display: none !important;
          }
        `
        dynamicPage.shadowRoot.appendChild(style)
      }
    }

    hideToggle()
    const timer = setTimeout(hideToggle, 300)
    return () => clearTimeout(timer)
  }, [selectedTable])

  function clearPageData() {
    setAllFields([])
    setFields([])
    setData([])
    setTableDataJson('')
    setEtagMap({})
    clearDomainCache()
    setSearchQuery('')
    setFilterValues({})
    setAppliedSearchQuery('')
    setAppliedFilterValues({})
    setIsEditingTable(false)
    setEditedData([])
  }

  function showError(message: string) {
    setSuccessMsg('')
    setError(message)
  }

  function showSuccess(message: string) {
    setError('')
    setSuccessMsg(message)
  }

  async function loadTable(table: TableConfig) {
    const normalizedUuid = normalizeConfigUuid(table.ConfigUuid)
    latestActiveTableUuidRef.current = normalizedUuid

    // Clear old data immediately to avoid displaying stale data while loading
    setAllFields([])
    setFields([])
    setData([])
    setTableDataJson('')
    setEtagMap({})
    setSearchQuery('')
    setFilterValues({})
    setAppliedSearchQuery('')
    setAppliedFilterValues({})
    setIsEditingTable(false)
    setEditedData([])

    try {
      setDataLoading(true)
      setError('')
      setSuccessMsg('')

      const { fieldMeta, tableData, rows } = await loadTableContext(
        normalizedUuid,
        table.TableName
      )

      if (latestActiveTableUuidRef.current !== normalizedUuid) {
        return
      }

      setAllFields(fieldMeta)
      setFields(fieldMeta.filter(f => !f.is_hidden && f.HiddenFlag !== 'X'))

      const dataJson = tableData.data_json || ''
      setData(rows)
      setTableDataJson(dataJson)
      setEtagMap(dataJson ? buildEtagMap(dataJson, fieldMeta, rows) : {})
    } catch (e: any) {
      if (latestActiveTableUuidRef.current === normalizedUuid) {
        showError(getFriendlyErrorMessage(e))
        clearPageData()
      }
    } finally {
      if (latestActiveTableUuidRef.current === normalizedUuid) {
        setDataLoading(false)
      }
    }
  }

  async function handleOptimisticLockRefresh() {
    setOptimisticLockOpen(false)
    setRecordDialogOpen(false)
    setEditingRow(null)
    setEditSessionEtag(null)
    if (selectedTable) {
      await loadTable(selectedTable)
      await onRefreshTableList()
    }
  }

  function openEditDialog(row: TableRowData) {
    setRecordDialogMode('edit')
    setEditingRow(row)
    const recordKey = buildKeyRecord(allFields, row)
    const keyStr = buildRecordKeyString(allFields, row)
    const stored = etagMap[keyStr] ?? null
    setEditSessionEtag(
      resolveEtagForUpdate(allFields, row, tableDataJson, recordKey, stored)
    )
    setRecordDialogOpen(true)
  }

  function openDeleteDialog(row: TableRowData) {
    setDeletingRow(row)
    setDeleteDialogOpen(true)
  }

  const handleCellChange = (rowIndex: number, fieldName: string, newValue: any) => {
    setEditedData(prev => {
      const updated = [...prev]
      updated[rowIndex] = {
        ...updated[rowIndex],
        [fieldName]: newValue
      }
      return updated
    })
  }

  const handleAddRow = () => {
    const newRecord = initFormValues(allFields, null)
    newRecord._isNew = true
    setEditedData(prev => [...prev, newRecord])
  }

  const handleCancelInlineEdits = () => {
    setIsEditingTable(false)
    setEditedData([])
    setError('')
  }

  const handleRemoveNewRow = (rowIndex: number) => {
    setEditedData(prev => prev.filter((_, idx) => idx !== rowIndex))
  }

  async function handleSaveInlineEdits() {
    if (!selectedTable) return
    setError('')
    setSuccessMsg('')

    // 1. Validation
    const validationErrors: string[] = []
    editedData.forEach((row, idx) => {
      const missing = validateMandatory(fields, row)
      if (missing.length > 0) {
        validationErrors.push(`Row #${idx + 1}: Missing required fields: ${missing.join(', ')}`)
      }
    })

    if (validationErrors.length > 0) {
      showError(validationErrors.join(' | '))
      return
    }

    try {
      setDataLoading(true)

      // 2. Identify new and modified rows
      const newRows = editedData.filter(r => r._isNew)
      const modifiedRows = editedData.filter(row => {
        if (row._isNew) return false
        const keyStr = buildRecordKeyString(allFields, row)
        const originalRow = data.find(orig => buildRecordKeyString(allFields, orig) === keyStr)
        if (!originalRow) return true
        return fields.some(f => {
          if (isSystemGeneratedField(f)) return false
          const name = f.field_name || f.FieldName
          return row[name] !== originalRow[name]
        })
      })

      if (newRows.length === 0 && modifiedRows.length === 0) {
        showSuccess('No changes to save')
        setIsEditingTable(false)
        setEditedData([])
        return
      }

      // 3. Execute creates SEQUENTIALLY to avoid SAP resource lock conflicts
      // (SAP backend locks the config instance between requests; parallel creates
      //  trigger MC_CSP_USR_RUNTIME/004 "instance is locked" errors)
      for (const row of newRows) {
        const payload = buildFullRecordPayload(allFields, row, null)
        const res = await createRecord(selectedTable.ConfigUuid, selectedTable.TableName, payload)
        if (res.success === false) {
          throw new Error(res.message || 'Failed to create record')
        }
      }

      // 4. Execute updates in parallel (updates use ETags and don't share the same lock contention)
      const updatePromises = modifiedRows.map(async (row) => {
        const recordKey = buildKeyRecord(allFields, row)
        const keyStr = buildRecordKeyString(allFields, row)
        const storedEtag = etagMap[keyStr] ?? null
        const etagInfo = resolveEtagForUpdate(allFields, row, tableDataJson, recordKey, storedEtag)
        const res = await updateRecord(
          selectedTable.ConfigUuid,
          selectedTable.TableName,
          recordKey,
          row,
          etagInfo.field || '',
          etagInfo.value || ''
        )
        if (res.success === false) {
          throw new Error(res.message || 'Failed to update record')
        }
        return res
      })

      await Promise.all(updatePromises)

      // 5. Success cleanup
      showSuccess(`Saved successfully (${newRows.length} created, ${modifiedRows.length} updated)`)
      setIsEditingTable(false)
      setEditedData([])
      await loadTable(selectedTable)
      await onRefreshTableList()
    } catch (e: any) {
      showError(getFriendlyErrorMessage(e))
    } finally {
      setDataLoading(false)
    }
  }

  const renderCellEditControl = (row: TableRowData, rowIndex: number, f: FieldMeta) => {
    const name = f.field_name || f.FieldName
    const val = row[name] ?? ''

    const isNewRow = !!row._isNew
    const mode = isNewRow ? 'create' : 'edit'

    const readonly = isFieldReadonly(f, mode) || isSystemGeneratedField(f) || (mode === 'edit' && (f.is_key || f.IsKeyField === 'X'))

    if (readonly) {
      return <Text style={{ color: '#6a7075' }}>{formatCellValue(f, val)}</Text>
    }

    const feType = f.fe_type || f.FeType

    if (feType === 'date') {
      // Use native HTML date input in table cells — the UI5 DatePicker's calendar button
      // is rendered outside its host element and gets clipped by the table cell's overflow:hidden.
      // A native <input type="date"> embeds the calendar icon inside the input itself (no overflow needed).
      const nativeVal = val ? String(val).substring(0, 10) : ''
      return (
        <input
          type="date"
          value={nativeVal}
          onChange={(e) => handleCellChange(rowIndex, name, formatDateForSap(e.target.value))}
          style={{
            width: '100%',
            height: '36px',
            padding: '0 8px',
            border: '1px solid var(--sapField_BorderColor, #89919a)',
            borderRadius: '4px',
            background: 'var(--sapField_Background, #fff)',
            color: 'var(--sapTextColor, #32363a)',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
            boxSizing: 'border-box',
            outline: 'none',
            cursor: 'pointer',
          }}
          onFocus={(e) => {
            e.target.style.border = '2px solid var(--sapField_Hover_BorderColor, #0a6ed1)'
          }}
          onBlur={(e) => {
            e.target.style.border = '1px solid var(--sapField_BorderColor, #89919a)'
          }}
        />
      )
    }

    if (feType === 'boolean') {
      const isChecked = val === 'X' || val === true
      return (
        <CheckBox
          checked={isChecked}
          onChange={(e: any) => handleCellChange(rowIndex, name, e.target.checked ? 'X' : '')}
        />
      )
    }

    if (feType === 'domain') {
      return (
        <DomainValueHelp
          configUuid={selectedTable!.ConfigUuid}
          field={f}
          value={val}
          onChange={(newVal) => handleCellChange(rowIndex, name, newVal)}
          readonly={false}
        />
      )
    }

    return (
      <Input
        value={val}
        onInput={(e: any) => handleCellChange(rowIndex, name, e.target.value)}
        style={{ width: '100%' }}
      />
    )
  }

  function handleGo() {
    setAppliedSearchQuery(searchQuery)
    setAppliedFilterValues(filterValues)
  }

  function handleClear() {
    setSearchQuery('')
    setFilterValues({})
    setAppliedSearchQuery('')
    setAppliedFilterValues({})
  }

  async function fetchRowByKey(table: TableConfig, recordKey: TableRowData) {
    const dataResult = await getTableData(table.ConfigUuid, table.TableName)
    const dataJson = dataResult.data_json || ''
    const rows = parseTableDataJson(dataJson, allFields)
    const keyStr = JSON.stringify(recordKey)
    const row = rows.find(r => JSON.stringify(buildKeyRecord(allFields, r)) === keyStr) || null
    return { row, dataJson }
  }

  async function updateRecordWithEtag(recordKey: TableRowData, fullRecord: TableRowData, etagInfo: any) {
    const { field, value, candidates } = etagInfo
    const etagValue = value || candidates?.[0] || ''

    if (!selectedTable) return { success: false, message: 'No table selected' }

    return updateRecord(
      selectedTable.ConfigUuid,
      selectedTable.TableName,
      recordKey,
      fullRecord,
      field || '',
      etagValue
    )
  }

  async function saveEditWithMerge(
    formValues: Record<string, any>,
    dirtyFieldNames: string[],
    retryOnLock = true,
    baselineRow: TableRowData | null = null,
    sessionEtag: any = null
  ): Promise<{ ok: boolean; message?: string }> {
    if (!selectedTable) return { ok: false, message: 'No table selected' }

    const baseline = baselineRow || editingRow
    if (!baseline) return { ok: false, message: 'No editing baseline' }

    const recordKey = buildKeyRecord(allFields, baseline)
    const { row: freshRow, dataJson } = await fetchRowByKey(selectedTable, recordKey)
    if (!freshRow) {
      const message = 'Record not found. It may have been deleted.'
      showError(message)
      return { ok: false, message }
    }

    const { fullRecord, blocked, hasChanges } = mergeRecordForConcurrentEdit(
      allFields,
      baseline,
      freshRow,
      formValues,
      dirtyFieldNames,
      dataJson,
      recordKey
    )

    if (!hasChanges) {
      const message =
        blocked.length > 0
          ? `Cannot save: ${blocked.map(b => b.label).join(', ')} already changed by another user`
          : 'No changes to save'
      showError(message)
      return { ok: false, message }
    }

    const etagForLock =
      sessionEtag ??
      editSessionEtag ??
      etagMap[buildRecordKeyString(allFields, baseline)] ??
      null
    const etagInfo = resolveEtagForUpdate(
      allFields,
      baseline,
      tableDataJson,
      recordKey,
      etagForLock
    )
    const result = await updateRecordWithEtag(recordKey, fullRecord, etagInfo)

    if (result.success === false && retryOnLock && isOptimisticLockError(result.message)) {
      const freshEtag = resolveEtagForUpdate(allFields, freshRow, dataJson, recordKey)
      return saveEditWithMerge(
        formValues,
        dirtyFieldNames,
        false,
        freshRow,
        freshEtag
      )
    }

    if (result.success === false) {
      if (isOptimisticLockError(result.message)) {
        setOptimisticLockOpen(true)
        return { ok: false, message: result.message }
      }
      const message = formatActionErrorMessage(result.message || 'Update failed')
      showError(message)
      return { ok: false, message }
    }

    setRecordDialogOpen(false)
    setEditSessionEtag(null)
    let msg = result.message || 'Record updated'
    if (blocked.length > 0) {
      msg += `. Skipped (locked by others): ${blocked.map(b => b.label).join(', ')}`
    }
    showSuccess(msg)
    await loadTable(selectedTable)
    await onRefreshTableList()
    return { ok: true }
  }

  async function handleSaveRecord(formValues: Record<string, any>, dirtyFieldNames: string[] = []): Promise<{ ok: boolean; message?: string }> {
    if (!selectedTable) return { ok: false, message: 'No table selected' }
    try {
      if (recordDialogMode === 'create') {
        const recordPayload = buildFullRecordPayload(allFields, formValues, null)
        const result = await createRecord(
          selectedTable.ConfigUuid,
          selectedTable.TableName,
          recordPayload
        )
        if (result.success === false) {
          const message = formatActionErrorMessage(result.message || 'Operation failed')
          showError(message)
          return { ok: false, message }
        }
        setRecordDialogOpen(false)
        showSuccess(result.message || 'Record created')
        await loadTable(selectedTable)
        await onRefreshTableList()
        return { ok: true }
      }

      const editResult = await saveEditWithMerge(formValues, dirtyFieldNames)
      if (editResult?.ok === false && editResult.message) {
        return { ok: false, message: editResult.message }
      }
      return editResult ?? { ok: true }
    } catch (e: any) {
      const message = getFriendlyErrorMessage(e)
      showError(message)
      return { ok: false, message }
    }
  }

  async function handleConfirmDelete() {
    if (!deletingRow || !selectedTable) return
    setDeleteLoading(true)
    try {
      const recordKey = buildKeyRecord(allFields, deletingRow)
      const result = await deleteRecord(
        selectedTable.ConfigUuid,
        selectedTable.TableName,
        recordKey
      )
      if (result.success === false) {
        setDeleteDialogOpen(false)
        if (isFKReferenceError(result.message)) {
          setFkErrorMessage(parseFKErrorMessage(result.message))
          setFkErrorOpen(true)
        } else {
          showError(result.message || 'Delete failed')
        }
        return
      }
      setDeleteDialogOpen(false)
      setDeletingRow(null)
      showSuccess(result.message || 'Record deleted')
      await loadTable(selectedTable)
      await onRefreshTableList()
    } catch (e: any) {
      showError(getFriendlyErrorMessage(e))
    } finally {
      setDeleteLoading(false)
    }
  }

  if (!selectedTable) {
    return (
      <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', background: '#f4f6f8', minHeight: '100%', boxSizing: 'border-box' }}>
        {/* Welcome Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #1d2d50 0%, #133b5c 100%)',
          color: '#fff',
          borderRadius: '8px',
          padding: '2rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div>
            <Title level="H2" style={{ color: '#fff', margin: 0 }}>Welcome to Dynamic Table Maintenance</Title>
            <Text style={{ color: '#dbe2ef', marginTop: '0.5rem', display: 'block' }}>
              Select a table below or from the sidebar navigation to manage database records.
            </Text>
          </div>
          <div style={{ textAlign: 'right', minWidth: '180px' }}>
            <Label style={{ color: '#a3b7dc', display: 'block' }}>System Context</Label>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1rem' }}>DEV · Client 324</Text>
            <Text style={{ color: '#a3b7dc', fontSize: '0.85rem', display: 'block', marginTop: '4px' }}>User: {username}</Text>
          </div>
        </div>

        {/* Searchable ComboBox Z-Table Selector */}
        <Card style={{ border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
          <div style={{ padding: '1.5rem' }}>
            <FlexBox direction="Column" gap="8px">
              <Label style={{ fontSize: '0.95rem', fontWeight: 'bold' }} showColon>Select Z-Table to Maintain</Label>
              <FlexBox gap="12px" alignItems="Center" wrap="Wrap">
                <ComboBox
                  placeholder="Type to search and select a table..."
                  style={{ width: '400px' }}
                  filter="Contains"
                  onSelectionChange={(e: any) => {
                    const selected = e.detail.item
                    if (selected) {
                      const match = tables.find(t => t.TableName === selected.text)
                      if (match) onSelectTable(match)
                    }
                  }}
                >
                  {tables.map(t => (
                    <ComboBoxItem
                      key={t.ConfigUuid}
                      text={t.TableName}
                    />
                  ))}
                </ComboBox>
                <Text style={{ color: '#6a7075', fontSize: '0.85rem' }}>
                  Quick Search: Type standard table name (e.g. Z251, ZTPC)
                </Text>
              </FlexBox>
            </FlexBox>
          </div>
        </Card>

        {/* Dashboard Title & Stats */}
        <FlexBox justifyContent="SpaceBetween" alignItems="Center" style={{ marginTop: '0.5rem' }}>
          <Title level="H3">Overview: Registered Tables ({tables.length})</Title>
          <Button icon="refresh" design="Transparent" onClick={onRefreshTableList}>
            Refresh Config
          </Button>
        </FlexBox>

        {/* Tables Grid */}
        {tables.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '30vh', background: '#fff', borderRadius: '8px', border: '1px solid #d9d9d9' }}>
            <Text>No active tables registered in the configuration</Text>
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.5rem'
          }}>
            {tables.map(t => (
              <Card
                key={t.ConfigUuid}
                onClick={() => onSelectTable(t)}
                style={{ cursor: 'pointer', border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.02)', transition: 'transform 0.15s, box-shadow 0.15s' }}
                onMouseOver={(e: any) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.06)'
                }}
                onMouseOut={(e: any) => {
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.02)'
                }}
              >
                <CardHeader
                  titleText={t.TableName}
                  subtitleText={t.Description || 'Database Table'}
                />
                <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {t.ApprovalRequired === 'X' && (
                    <FlexBox gap="8px" wrap="Wrap">
                      <Tag colorScheme="6">
                        Approval Required
                      </Tag>
                    </FlexBox>
                  )}

                  <div style={{ borderTop: '1px solid #f0f0f0', marginTop: '0.25rem', paddingTop: '0.5rem' }}>
                    <FlexBox direction="Column" gap="4px">
                      <Label style={{ fontSize: '0.75rem', color: '#6a7075' }}>Config UUID</Label>
                      <Text style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: '#32363a' }}>{t.ConfigUuid}</Text>
                    </FlexBox>
                  </div>

                  <FlexBox justifyContent="End" style={{ marginTop: '0.25rem' }}>
                    <Button
                      design="Emphasized"
                      icon="navigation-right-arrow"
                      onClick={(e: any) => {
                        e.stopPropagation()
                        onSelectTable(t)
                      }}
                    >
                      Maintain Data
                    </Button>
                  </FlexBox>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    )
  }

  const filteredData = data.filter(row => {
    const matchesSearch = appliedSearchQuery.trim() === '' || Object.values(row).some(v =>
      String(v).toLowerCase().includes(appliedSearchQuery.toLowerCase())
    )

    const matchesKeys = Object.entries(appliedFilterValues).every(([field, val]) => {
      if (!val.trim()) return true
      const cellVal = String(row[field] ?? '')
      return cellVal.toLowerCase().includes(val.toLowerCase())
    })

    return matchesSearch && matchesKeys
  })

  const fieldsWithWidths = fields.map(f => {
    const headerLabel = formatHeaderLabel(f)
    const feType = f.fe_type || f.FeType
    const isDate = feType === 'date'
    const isDomain = feType === 'domain'
    const minColWidth = Math.max(isDate ? 220 : isDomain ? 200 : 150, headerLabel.length * 10 + 50)
    return { field: f, minColWidth, headerLabel }
  })

  const totalTableWidth = fieldsWithWidths.reduce((sum, item) => sum + item.minColWidth, 100)
  const columnsStyle = fieldsWithWidths.map(item => `${item.minColWidth}px`).join(' ') + ' 100px'

  const dataTable = (
    <>
      <Toolbar design="Transparent">
        <Title level="H4">
          Records ({isEditingTable ? editedData.length : filteredData.length})
        </Title>
        <ToolbarSpacer />
        {isEditingTable ? (
          <>
            <Button design="Emphasized" icon={"save" as any} onClick={handleSaveInlineEdits}>
              Save
            </Button>
            <Button design="Transparent" icon={"decline" as any} onClick={handleCancelInlineEdits}>
              Cancel
            </Button>
            <Button design="Transparent" icon={"add" as any} onClick={handleAddRow}>
              Add Row
            </Button>
          </>
        ) : (
          <>
            <Button
              design="Emphasized"
              icon={"edit" as any}
              onClick={() => {
                setIsEditingTable(true)
                setEditedData([...filteredData])
              }}
            >
              Edit
            </Button>
            <Button
              design="Transparent"
              icon={"add" as any}
              onClick={() => {
                setIsEditingTable(true)
                const copy = [...filteredData]
                const newRec = initFormValues(allFields, null)
                newRec._isNew = true
                setEditedData([...copy, newRec])
              }}
            >
              Create
            </Button>
            <Button
              design="Transparent"
              icon={"refresh" as any}
              onClick={() => loadTable(selectedTable)}
              disabled={dataLoading}
            >
              Refresh
            </Button>
          </>
        )}
        <ToolbarSeparator />
        <Input
          placeholder="Search..."
          icon={"search" as any}
          value={searchQuery}
          onInput={(e: any) => setSearchQuery(e.target.value)}
          style={{ width: '250px' }}
          disabled={isEditingTable}
        />
      </Toolbar>

      {dataLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem' }}>
          <BusyIndicator active size="S" />
        </div>
      )}

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
                    <Label title={`${headerLabel} (${technicalName})`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {headerLabel}
                    </Label>
                    {(f.is_key || f.IsKeyField === 'X') && (
                      <Icon name="key" style={{ minWidth: '12px', width: '12px', height: '12px', color: '#e09d00' }} />
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
                  return (
                    <TableCell key={name} style={{ minWidth: `${minColWidth}px` }}>
                      {renderCellEditControl(row, i, f)}
                    </TableCell>
                  )
                })}
                <TableCell>
                  {row._isNew ? (
                    <Button
                      design="Transparent"
                      icon={"delete" as any}
                      accessibleName="Remove new record"
                      onClick={() => handleRemoveNewRow(i)}
                    />
                  ) : (
                    <Button
                      design="Transparent"
                      icon={"delete" as any}
                      accessibleName="Delete record"
                      onClick={() => openDeleteDialog(row)}
                    />
                  )}
                </TableCell>
              </TableRow>
            ))
          )
        ) : filteredData.length === 0 ? (
          <TableRow>
            <TableCell {...({ colSpan: fields.length + 1 } as any)}>
              <Text>No data available</Text>
            </TableCell>
          </TableRow>
        ) : (
          filteredData.map((row, i) => (
            <TableRow
              key={i}
              interactive
              onClick={() => openEditDialog(row)}
              style={{ gridTemplateColumns: columnsStyle }}
            >
              {fieldsWithWidths.map(({ field: f, minColWidth }) => {
                const name = f.field_name || f.FieldName
                const val = row[name]

                if (name.toUpperCase() === 'STATUS') {
                  const valStr = String(val ?? '').toUpperCase()
                  const isActive = valStr === 'A' || valStr === 'ACTIVE' || valStr === 'X'
                  const isInactive = valStr === 'I' || valStr === 'INACTIVE'
                  return (
                    <TableCell key={name} style={{ minWidth: `${minColWidth}px` }}>
                      <ObjectStatus state={isActive ? "Positive" : (isInactive ? "Negative" : "None")}>
                        {isActive ? "Active" : (isInactive ? "Inactive" : valStr || "—")}
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
                  icon={"edit" as any}
                  accessibleName="Edit record"
                  onClick={(e: any) => {
                    e.stopPropagation()
                    openEditDialog(row)
                  }}
                />
                <Button
                  design="Transparent"
                  icon={"delete" as any}
                  accessibleName="Delete record"
                  onClick={(e: any) => {
                    e.stopPropagation()
                    openDeleteDialog(row)
                  }}
                />
              </TableCell>
            </TableRow>
          ))
        )}
      </Table>
    </>
  )

  return (
    <>
      {(error || successMsg) && (
        <div style={{ padding: '1rem' }}>
          {error && (
            <MessageStrip design="Negative" onClose={() => setError('')}>
              {error}
            </MessageStrip>
          )}
          {successMsg && (
            <MessageStrip design="Positive" style={{ marginTop: error ? '0.5rem' : 0 }}>
              {successMsg}
            </MessageStrip>
          )}
        </div>
      )}

      <DynamicPage
        titleArea={
          <DynamicPageTitle
            heading={
              <FlexBox alignItems="Center" gap="8px">
                <Button
                  icon="nav-back"
                  design="Transparent"
                  title="Back to Table Selection"
                  onClick={() => onSelectTable(null as any)}
                />
                <Title>{selectedTable.TableName}</Title>
              </FlexBox>
            }
            subheading={<Text>{selectedTable.Description || 'Database Table'}</Text>}
          />
        }
        headerArea={
          <DynamicPageHeader style={{ padding: '0px' }}>
            <FlexBox
              alignItems="End"
              justifyContent="SpaceBetween"
              wrap="Wrap"
              style={{
                background: 'var(--sapObjectHeader_Background, #f4f6f8)',
                borderBottom: '1px solid var(--sapGroup_BorderColor, #e5e5e5)',
                padding: '12px 24px',
                gap: '16px',
                width: '100%',
                boxSizing: 'border-box'
              }}
            >
              {/* Inputs Group */}
              <FlexBox gap="16px" wrap="Wrap" alignItems="Center">
                {/* General Search Input */}
                <FlexBox direction="Column" gap="4px">
                  <Label style={{ fontSize: '0.875rem' }}>Filters</Label>
                  <Input
                    placeholder="Search records..."
                    value={searchQuery}
                    onInput={(e: any) => setSearchQuery(e.target.value)}
                    icon={<Icon name="search" />}
                    style={{ width: '250px' }}
                  />
                </FlexBox>

                {/* Key Fields Filter Inputs */}
                {fields
                  .filter(f => f.is_key || f.IsKeyField === 'X')
                  .map(f => {
                    const name = f.field_name || f.FieldName
                    const label = f.label || f.LabelText || name
                    return (
                      <FlexBox key={name} direction="Column" gap="4px">
                        <Label style={{ fontSize: '0.875rem' }}>{label}</Label>
                        <Input
                          placeholder={`Filter by ${label}...`}
                          value={filterValues[name] ?? ''}
                          onInput={(e: any) => {
                            setFilterValues(prev => ({ ...prev, [name]: e.target.value }))
                          }}
                          style={{ minWidth: '220px' }}
                        />
                      </FlexBox>
                    )
                  })}
              </FlexBox>

              {/* Action Buttons Group inline with inputs */}
              <FlexBox gap="8px" alignItems="Center" style={{ marginLeft: 'auto' }}>
                <Button design="Emphasized" onClick={handleGo}>
                  Go
                </Button>
                <Button design="Transparent" onClick={handleClear}>
                  Clear
                </Button>
              </FlexBox>
            </FlexBox>
          </DynamicPageHeader>
        }
      >
        <TabContainer>
          <Tab text="Table Data" selected>
            {dataTable}
          </Tab>
          <Tab text="Field Schema">
            <Text style={{ marginBottom: '0.75rem', color: '#6a7075' }}>
              From getFieldMeta (DD03L + field config). Used for column labels,
              form inputs, and CRUD formatting.
            </Text>
            <Table
              headerRow={
                <TableHeaderRow>
                  <TableHeaderCell minWidth="140px">
                    <Label>Field</Label>
                  </TableHeaderCell>
                  <TableHeaderCell minWidth="100px">
                    <Label>FE type</Label>
                  </TableHeaderCell>
                  <TableHeaderCell minWidth="80px">
                    <Label>ABAP</Label>
                  </TableHeaderCell>
                  <TableHeaderCell minWidth="180px">
                    <Label>Label</Label>
                  </TableHeaderCell>
                  <TableHeaderCell minWidth="80px">
                    <Label>Key</Label>
                  </TableHeaderCell>
                  <TableHeaderCell minWidth="120px">
                    <Label>Domain</Label>
                  </TableHeaderCell>
                  <TableHeaderCell minWidth="80px">
                    <Label>Hidden</Label>
                  </TableHeaderCell>
                </TableHeaderRow>
              }
            >
              {allFields.length === 0 ? (
                <TableRow>
                  <TableCell {...({ colSpan: 7 } as any)}>
                    <Text>No field metadata loaded.</Text>
                  </TableCell>
                </TableRow>
              ) : (
                allFields.map(f => {
                  const name = f.field_name || f.FieldName
                  return (
                    <TableRow key={name}>
                      <TableCell>
                        <Text>{name}</Text>
                      </TableCell>
                      <TableCell>
                        <Text>{f.fe_type || f.FeType || '—'}</Text>
                      </TableCell>
                      <TableCell>
                        <Text>{f.abap_type || '—'}</Text>
                      </TableCell>
                      <TableCell>
                        <Text>{f.label || f.LabelText || name}</Text>
                      </TableCell>
                      <TableCell>
                        <Text>
                          {f.is_key || f.IsKeyField === 'X' ? 'Yes' : ''}
                        </Text>
                      </TableCell>
                      <TableCell>
                        <Text>{f.domain_name || f.DomainName || ''}</Text>
                      </TableCell>
                      <TableCell>
                        <Text>
                          {f.is_hidden || f.HiddenFlag === 'X' ? 'Yes' : ''}
                        </Text>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </Table>
          </Tab>
          <Tab text="Audit Log">
            <AuditLogPanel tableName={selectedTable.TableName} />
          </Tab>
        </TabContainer>
      </DynamicPage>

      <RecordDialog
        open={recordDialogOpen}
        mode={recordDialogMode}
        configUuid={selectedTable?.ConfigUuid || ''}
        allFields={allFields}
        initialRow={editingRow}
        tableName={selectedTable?.TableName || ''}
        username={username}
        onSave={handleSaveRecord}
        onClose={() => {
          setRecordDialogOpen(false)
          setEditSessionEtag(null)
        }}
      />

      <Dialog
        {...({
          open: deleteDialogOpen,
          headerText: "Delete Record",
          onAfterClose: () => !deleteLoading && setDeletingRow(null),
          footer: (
            <Bar
              design="Footer"
              endContent={
                <>
                  <Button
                    design="Transparent"
                    onClick={() => setDeleteDialogOpen(false)}
                    disabled={deleteLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    design="Negative"
                    icon={"delete" as any}
                    onClick={handleConfirmDelete}
                    disabled={deleteLoading}
                  >
                    Delete
                  </Button>
                </>
              }
            />
          )
        } as any)}
      >
        {deleteLoading && <BusyIndicator active size="M" />}
        <Text style={{ whiteSpace: 'pre-line' }}>
          Are you sure you want to delete this record?
          {'\n\n'}
          {deletingRow && formatDeleteSummary(allFields, deletingRow)}
        </Text>
      </Dialog>

      <MessageBox
        open={optimisticLockOpen}
        type={MessageBoxType.Error}
        titleText="Concurrent Modification"
        actions={[MessageBoxAction.Cancel, 'Refresh']}
        emphasizedAction="Refresh"
        onClose={(action) => {
          if (action === 'Refresh') {
            handleOptimisticLockRefresh()
          } else {
            setOptimisticLockOpen(false)
          }
        }}
      >
        This record was modified by another user while you were editing. Refresh to see the latest data, then save only the fields you still need to change.
      </MessageBox>

      <MessageBox
        open={fkErrorOpen}
        type={MessageBoxType.Error}
        titleText="Cannot Delete Record"
        actions={[MessageBoxAction.OK]}
        onClose={() => setFkErrorOpen(false)}
      >
        {fkErrorMessage}
      </MessageBox>
    </>
  )
}

