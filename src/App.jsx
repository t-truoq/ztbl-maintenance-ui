import React, { useState, useEffect } from 'react'
import {
  ShellBar,
  SideNavigation,
  SideNavigationItem,
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
  Avatar,
  Dialog,
  Bar,
  TabContainer,
  Tab,
  MessageBox,
  MessageBoxType,
  MessageBoxAction
} from '@ui5/webcomponents-react'
import {
  getTables,
  loadTableContext,
  getTableData,
  getDomainValues,
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
} from './services/sapApi'
import { clearDomainCache } from './services/domainCache'
import {
  buildKeyRecord,
  buildRecordKeyString,
  buildFullRecordPayload,
  formatDeleteSummary,
  buildEtagMap,
  resolveEtagForUpdate,
  mergeRecordForConcurrentEdit
} from './utils/recordHelpers'
import { formatCellValue } from './utils/displayHelpers'
import RecordDialog from './components/RecordDialog'
import AuditLogPanel from './components/AuditLogPanel'

function clearAppData(setters) {
  const {
    setTables,
    setSelectedTable,
    setAllFields,
    setFields,
    setData,
    setTableDataJson,
    setEtagMap,
    setEditSessionEtag,
    setError,
    setSuccessMsg,
    setSearchQuery,
    setRecordDialogOpen,
    setEditingRow,
    setDeleteDialogOpen,
    setDeletingRow
  } = setters
  setTables([])
  setSelectedTable(null)
  setAllFields([])
  setFields([])
  setData([])
  setTableDataJson('')
  setEtagMap({})
  setEditSessionEtag(null)
  setError('')
  setSuccessMsg('')
  setSearchQuery('')
  setRecordDialogOpen(false)
  setEditingRow(null)
  setDeleteDialogOpen(false)
  setDeletingRow(null)
  clearDomainCache()
}

export default function App({ credentials, onLogout }) {
  const [tables, setTables] = useState([])
  const [selectedTable, setSelectedTable] = useState(null)
  const [allFields, setAllFields] = useState([])
  const [fields, setFields] = useState([])
  const [data, setData] = useState([])
  const [tableDataJson, setTableDataJson] = useState('')
  const [etagMap, setEtagMap] = useState({})
  const [editSessionEtag, setEditSessionEtag] = useState(null)
  const [loading, setLoading] = useState(false)
  const [dataLoading, setDataLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const [recordDialogOpen, setRecordDialogOpen] = useState(false)
  const [recordDialogMode, setRecordDialogMode] = useState('create')
  const [editingRow, setEditingRow] = useState(null)

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingRow, setDeletingRow] = useState(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  const [optimisticLockOpen, setOptimisticLockOpen] = useState(false)
  const [fkErrorOpen, setFkErrorOpen] = useState(false)
  const [fkErrorMessage, setFkErrorMessage] = useState('')

  useEffect(() => { loadTables() }, [])

  useEffect(() => {
    const handler = () => {
      clearAppData({
        setTables,
        setSelectedTable,
        setAllFields,
        setFields,
        setData,
        setTableDataJson,
        setEtagMap,
        setEditSessionEtag,
        setError,
        setSuccessMsg,
        setSearchQuery,
        setRecordDialogOpen,
        setEditingRow,
        setDeleteDialogOpen,
        setDeletingRow
      })
      onLogout?.()
    }
    window.addEventListener('sap-session-expired', handler)
    return () => window.removeEventListener('sap-session-expired', handler)
  }, [onLogout])

  useEffect(() => {
    if (!successMsg) return
    const timer = setTimeout(() => setSuccessMsg(''), 3000)
    return () => clearTimeout(timer)
  }, [successMsg])

  function showError(message) {
    setSuccessMsg('')
    setError(message)
  }

  function showSuccess(message) {
    setError('')
    setSuccessMsg(message)
  }

  async function loadTables() {
    try {
      setLoading(true)
      const result = await getTables()
      setTables(result)
    } catch (e) {
      showError(getFriendlyErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }

  async function reloadTableData(table, fieldConfig = null) {
    setDataLoading(true)
    try {
      const dataResult = await getTableData(table.ConfigUuid, table.TableName)
      const dataJson = dataResult.data_json || ''
      const fieldsForEtag = fieldConfig || allFields
      if (dataJson) {
        const rows = parseTableDataJson(dataJson, fieldsForEtag)
        setData(rows)
        setTableDataJson(dataJson)
        setEtagMap(buildEtagMap(dataJson, fieldsForEtag, rows))
      } else {
        setData([])
        setTableDataJson('')
        setEtagMap({})
      }
    } catch (e) {
      showError(getFriendlyErrorMessage(e))
      setData([])
      setTableDataJson('')
      setEtagMap({})
    } finally {
      setDataLoading(false)
    }
  }

  async function handleSelectTable(table) {
    try {
      setLoading(true)
      setDataLoading(true)
      setError('')
      setSuccessMsg('')
      const normalizedUuid = normalizeConfigUuid(table.ConfigUuid)
      setSelectedTable({ ...table, ConfigUuid: normalizedUuid })
      setSearchQuery('')
      clearDomainCache()

      const { fieldMeta, tableData, rows } = await loadTableContext(
        normalizedUuid,
        table.TableName
      )

      setAllFields(fieldMeta)
      setFields(fieldMeta.filter(f => !f.is_hidden && f.HiddenFlag !== 'X'))

      const dataJson = tableData.data_json || ''
      setData(rows)
      setTableDataJson(dataJson)
      setEtagMap(dataJson ? buildEtagMap(dataJson, fieldMeta, rows) : {})

      // Fetch domain values in the background to prevent blocking table rendering
      const domainFields = fieldMeta.filter(f => f.fe_type === 'domain' && f.domain_name)
      Promise.all(
        domainFields.map(f => getDomainValues(normalizedUuid, f.domain_name, ''))
      ).catch(e => console.warn('Background domain prefetch error:', e))
    } catch (e) {
      showError(getFriendlyErrorMessage(e))
      setAllFields([])
      setFields([])
      setData([])
      setTableDataJson('')
      setEtagMap({})
    } finally {
      setLoading(false)
      setDataLoading(false)
    }
  }

  function handleLogout() {
    clearAppData({
      setTables,
      setSelectedTable,
      setAllFields,
      setFields,
      setData,
      setTableDataJson,
      setEtagMap,
      setEditSessionEtag,
      setError,
      setSuccessMsg,
      setSearchQuery,
      setRecordDialogOpen,
      setEditingRow,
      setDeleteDialogOpen,
      setDeletingRow
    })
    onLogout?.()
  }

  async function handleOptimisticLockRefresh() {
    setOptimisticLockOpen(false)
    setRecordDialogOpen(false)
    setEditingRow(null)
    setEditSessionEtag(null)
    if (selectedTable) await handleSelectTable(selectedTable)
  }

  function openCreateDialog() {
    setRecordDialogMode('create')
    setEditingRow(null)
    setEditSessionEtag(null)
    setRecordDialogOpen(true)
  }

  function openEditDialog(row) {
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

  function openDeleteDialog(row) {
    setDeletingRow(row)
    setDeleteDialogOpen(true)
  }

  async function fetchRowByKey(table, recordKey) {
    const dataResult = await getTableData(table.ConfigUuid, table.TableName)
    const dataJson = dataResult.data_json || ''
    const rows = parseTableDataJson(dataJson, allFields)
    const keyStr = JSON.stringify(recordKey)
    const row = rows.find(r => JSON.stringify(buildKeyRecord(allFields, r)) === keyStr) || null
    return { row, dataJson }
  }

  async function updateRecordWithEtag(recordKey, fullRecord, etagInfo) {
    const { field, value, candidates } = etagInfo
    const etagValue = value || candidates?.[0] || ''

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
    formValues,
    dirtyFieldNames,
    retryOnLock = true,
    baselineRow = null,
    sessionEtag = null
  ) {
    const baseline = baselineRow || editingRow
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
    await handleSelectTable(selectedTable)
    return { ok: true }
  }

  async function handleSaveRecord(formValues, dirtyFieldNames = []) {
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
        await handleSelectTable(selectedTable)
        return { ok: true }
      }

      const editResult = await saveEditWithMerge(formValues, dirtyFieldNames)
      if (editResult?.ok === false && editResult.message) {
        return { ok: false, message: editResult.message }
      }
      return editResult ?? { ok: true }
    } catch (e) {
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
      await handleSelectTable(selectedTable)
    } catch (e) {
      showError(getFriendlyErrorMessage(e))
    } finally {
      setDeleteLoading(false)
    }
  }

  const userInitials = credentials?.username
    ? credentials.username.slice(0, 2).toUpperCase()
    : 'U'

  const filteredData = data.filter(row =>
    Object.values(row).some(v =>
      String(v).toLowerCase().includes(searchQuery.toLowerCase())
    )
  )

  const dataTable = (
    <>
      <Toolbar design="Solid">
        <Button design="Emphasized" icon="add" onClick={openCreateDialog}>
          Create
        </Button>
        <ToolbarSeparator />
        <Button
          icon="refresh"
          onClick={() => handleSelectTable(selectedTable)}
          disabled={dataLoading}
        >
          Refresh
        </Button>
        <ToolbarSpacer />
        <Input
          placeholder="Search..."
          icon="search"
          value={searchQuery}
          onInput={e => setSearchQuery(e.target.value)}
          style={{ width: '250px' }}
        />
        <Text style={{ fontSize: '13px', color: '#6a7075', marginLeft: '0.5rem' }}>
          {filteredData.length} of {data.length} records
        </Text>
      </Toolbar>

      {dataLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem' }}>
          <BusyIndicator active size="Small" />
        </div>
      )}



      <Table
        headerRow={
          <TableHeaderRow>
            {fields.map(f => (
              <TableHeaderCell key={f.field_name || f.FieldName} minWidth="120px">
                <Label>
                  {f.label || f.LabelText || f.field_name || f.FieldName}
                  {(f.is_key || f.IsKeyField === 'X') && ' 🔑'}
                </Label>
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
            <TableCell colSpan={fields.length + 1}>
              <Text>No data available</Text>
            </TableCell>
          </TableRow>
        ) : (
          filteredData.map((row, i) => (
            <TableRow key={i}>
              {fields.map(f => {
                const name = f.field_name || f.FieldName
                return (
                  <TableCell key={name}>
                    <Text>{formatCellValue(f, row[name])}</Text>
                  </TableCell>
                )
              })}
              <TableCell>
                <Button
                  design="Transparent"
                  icon="edit"
                  accessibleName="Edit record"
                  onClick={() => openEditDialog(row)}
                />
                <Button
                  design="Transparent"
                  icon="delete"
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
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>

      <div style={{ display: 'flex', alignItems: 'stretch', background: '#fff' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <ShellBar
            primaryTitle="Dynamic Table Maintenance"
            secondaryTitle={`${credentials?.username || ''} · Client 324`}
            profile={<Avatar initials={userInitials} colorScheme="Accent6" />}
          />
        </div>
        <FlexBox
          alignItems="Center"
          style={{ padding: '0 1rem', borderLeft: '1px solid #e5e5e5' }}
        >
          <Button icon="log" design="Transparent" onClick={handleLogout}>
            Logout
          </Button>
        </FlexBox>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        <div style={{ width: '260px', borderRight: '1px solid #d9d9d9', background: '#fff', overflowY: 'auto' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0' }}>
            <Label>Registered Tables ({tables.length})</Label>
          </div>
          <SideNavigation>
            {tables.map(t => (
              <SideNavigationItem
                key={t.ConfigUuid}
                text={t.TableName}
                icon="table-view"
                selected={selectedTable?.ConfigUuid === t.ConfigUuid}
                onClick={() => handleSelectTable(t)}
              />
            ))}
          </SideNavigation>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', background: '#f5f6f7' }}>

          {loading && !selectedTable && (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
              <BusyIndicator active size="Medium" />
            </div>
          )}

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

          {!selectedTable && !loading && (
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
          )}

          {selectedTable && (
            <DynamicPage
              headerTitle={
                <DynamicPageTitle
                  heading={<Title>{selectedTable.TableName}</Title>}
                  subheading={<Text>{selectedTable.Description}</Text>}
                />
              }
              headerContent={
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
                        <TableCell colSpan={7}>
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
          )}

        </div>
      </div>

      <RecordDialog
        open={recordDialogOpen}
        mode={recordDialogMode}
        configUuid={selectedTable?.ConfigUuid}
        allFields={allFields}
        initialRow={editingRow}
        tableName={selectedTable?.TableName}
        username={credentials?.username}
        onSave={handleSaveRecord}
        onClose={() => {
          setRecordDialogOpen(false)
          setEditSessionEtag(null)
        }}
      />

      <Dialog
        open={deleteDialogOpen}
        headerText="Delete Record"
        onAfterClose={() => !deleteLoading && setDeletingRow(null)}
        footer={
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
                  icon="delete"
                  onClick={handleConfirmDelete}
                  disabled={deleteLoading}
                >
                  Delete
                </Button>
              </>
            }
          />
        }
      >
        {deleteLoading && <BusyIndicator active size="Medium" />}
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
        actions={[MessageBoxAction.CANCEL, 'Refresh']}
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
    </div>
  )
}
