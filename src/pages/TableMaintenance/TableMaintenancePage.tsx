import { useState, useEffect, useRef } from 'react'
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
  Toast
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
  mergeRecordForConcurrentEdit
} from '../../utils/recordHelpers'
import { formatCellValue } from '../../utils/displayHelpers'
import RecordDialog from '../../components/RecordDialog'
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
  username: string;
  onRefreshTableList: () => Promise<void>;
}

export default function TableMaintenancePage({
  selectedTable,
  username,
  onRefreshTableList
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

  const [toastText, setToastText] = useState('')
  const [toastOpen, setToastOpen] = useState(false)

  function showToast(msg: string) {
    setToastText(msg)
    setToastOpen(true)
  }

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

  function clearPageData() {
    setAllFields([])
    setFields([])
    setData([])
    setTableDataJson('')
    setEtagMap({})
    clearDomainCache()
  }

  function showError(message: string) {
    setSuccessMsg('')
    setError(message)
  }

  function showSuccess(message: string) {
    setError('')
    setSuccessMsg(message)
    showToast(message)
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

  function openCreateDialog() {
    setRecordDialogMode('create')
    setEditingRow(null)
    setEditSessionEtag(null)
    setRecordDialogOpen(true)
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
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '60vh',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <Title level="H3">Select a table to maintain</Title>
        <Text>Choose a table from the left navigation</Text>
      </div>
    )
  }

  const filteredData = data.filter(row =>
    Object.values(row).some(v =>
      String(v).toLowerCase().includes(searchQuery.toLowerCase())
    )
  )

  const dataTable = (
    <>
      <Toolbar design="Solid">
        <Button design="Emphasized" icon={"add" as any} onClick={openCreateDialog}>
          Create
        </Button>
        <ToolbarSeparator />
        <Button
          icon={"refresh" as any}
          onClick={async () => {
            try {
              await loadTable(selectedTable)
              showToast('Table data refreshed')
            } catch {}
          }}
          disabled={dataLoading}
        >
          Refresh
        </Button>
        <ToolbarSpacer />
        <Input
          placeholder="Search..."
          icon={"search" as any}
          value={searchQuery}
          onInput={(e: any) => setSearchQuery(e.target.value)}
          style={{ width: '250px' }}
        />
        <Text style={{ fontSize: '13px', color: '#6a7075', marginLeft: '0.5rem' }}>
          {filteredData.length} of {data.length} records
        </Text>
      </Toolbar>

      {dataLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem' }}>
          <BusyIndicator active size="S" />
        </div>
      )}

      <Table
        headerRow={
          <TableHeaderRow>
            {fields.map(f => (
              <TableHeaderCell key={f.field_name || f.FieldName} minWidth="120px">
                <FlexBox alignItems="Center" gap="4px">
                  <Label>{formatHeaderLabel(f)}</Label>
                  {(f.is_key || f.IsKeyField === 'X') && (
                    <Icon name="key" style={{ width: '12px', height: '12px', color: '#e09d00' }} />
                  )}
                </FlexBox>
              </TableHeaderCell>
            ))}
            <TableHeaderCell minWidth="100px">
              <Label>Actions</Label>
            </TableHeaderCell>
          </TableHeaderRow>
        }
      >
        {filteredData.length === 0 ? (
          <TableRow>
            <TableCell {...({ colSpan: fields.length + 1 } as any)}>
              <Text>No data available</Text>
            </TableCell>
          </TableRow>
        ) : (
          filteredData.map((row, i) => (
            <TableRow key={i}>
              {fields.map(f => {
                const name = f.field_name || f.FieldName
                const val = row[name]

                if (name.toUpperCase() === 'STATUS') {
                  const valStr = String(val ?? '').toUpperCase()
                  const isActive = valStr === 'A' || valStr === 'ACTIVE' || valStr === 'X'
                  return (
                    <TableCell key={name}>
                      <ObjectStatus state={isActive ? "Positive" : "None"}>
                        {isActive ? "Active" : (valStr === 'I' || valStr === 'INACTIVE' ? "Inactive" : valStr || "—")}
                      </ObjectStatus>
                    </TableCell>
                  )
                }

                return (
                  <TableCell key={name}>
                    <Text>{formatCellValue(f, val)}</Text>
                  </TableCell>
                )
              })}
              <TableCell>
                <Button
                  design="Transparent"
                  icon={"edit" as any}
                  accessibleName="Edit record"
                  onClick={() => openEditDialog(row)}
                />
                <Button
                  design="Transparent"
                  icon={"delete" as any}
                  accessibleName="Delete record"
                  onClick={() => openDeleteDialog(row)}
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
        {...({
          headerTitle: (
            <DynamicPageTitle
              heading={<Title>{selectedTable.TableName}</Title>}
              subheading={<Text>{selectedTable.Description}</Text>}
            />
          ),
          headerContent: (
            <DynamicPageHeader>
              <FlexBox gap="2rem" alignItems="Center">
                <FlexBox direction="Column" gap="4px">
                  <Label>Table Name</Label>
                  <Text>{selectedTable.TableName}</Text>
                </FlexBox>
                <FlexBox direction="Column" gap="4px">
                  <Label>Records</Label>
                  <Text>{filteredData.length}</Text>
                </FlexBox>
                <FlexBox direction="Column" gap="4px">
                  <Label>Status</Label>
                  <Tag colorScheme={selectedTable.ActiveFlag === 'X' ? '8' : '2'}>
                    {selectedTable.ActiveFlag === 'X' ? 'Active' : 'Inactive'}
                  </Tag>
                </FlexBox>
                <FlexBox direction="Column" gap="4px">
                  <Label>Approval Required</Label>
                  <Tag colorScheme={selectedTable.ApprovalRequired === 'X' ? '6' : '1'}>
                    {selectedTable.ApprovalRequired === 'X' ? 'Yes' : 'No'}
                  </Tag>
                </FlexBox>
              </FlexBox>
            </DynamicPageHeader>
          )
        } as any)}
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

      <Toast
        open={toastOpen}
        duration={4500}
        onClose={() => setToastOpen(false)}
        style={{
          minWidth: '580px',
          maxWidth: '90vw',
          width: 'auto',
          textAlign: 'center'
        }}
      >
        <div style={{ wordBreak: 'break-all', whiteSpace: 'normal' }}>
          {toastText}
        </div>
      </Toast>
    </>
  )
}

