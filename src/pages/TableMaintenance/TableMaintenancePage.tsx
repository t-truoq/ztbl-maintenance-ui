import { useEffect, useState } from 'react'
import {
  DynamicPage,
  DynamicPageTitle,
  DynamicPageHeader,
  FlexBox,
  Title,
  Text,
  Button,
  Input,
  MessageStrip,
  TabContainer,
  Tab,
  Toast,
} from '@ui5/webcomponents-react'
import {
  useTableMaintenance,
  TableMaintenancePageProps,
} from './hooks/useTableMaintenance'
import { initFormValues } from '../../utils/recordHelpers'
import WelcomeDashboard from '../../components/WelcomeDashboard'
import DynamicDataTable from '../../components/DynamicDataTable'
import ExcelPipelineTab from '../../components/ExcelPipelineTab'
import FieldSchemaTab from '../../components/FieldSchemaTab'
import AuditLogPanel from '../../components/AuditLogPanel'
import RepositoryInfoTab from '../../components/RepositoryInfoTab'
import RecordDialog from '../../components/RecordDialog'
import DeleteConfirmDialog from '../../components/dialogs/DeleteConfirmDialog'
import OptimisticLockDialog from '../../components/dialogs/OptimisticLockDialog'
import FKErrorDialog from '../../components/dialogs/FKErrorDialog'
import ApprovalSuccessDialog from '../../components/dialogs/ApprovalSuccessDialog'

export default function TableMaintenancePage(props: TableMaintenancePageProps) {
  const {
    // State
    allFields,
    fields,
    data,
    dataLoading,
    error,
    setError,
    searchQuery,
    setSearchQuery,
    filterValues,
    setFilterValues,
    isEditingTable,
    setIsEditingTable,
    editedData,
    setEditedData,
    inlineErrors,
    recordDialogOpen,
    setRecordDialogOpen,
    recordDialogMode,
    editingRow,
    deleteDialogOpen,
    setDeleteDialogOpen,
    deletingRows,
    setDeletingRows,
    deleteLoading,
    optimisticLockOpen,
    setOptimisticLockOpen,
    fkErrorOpen,
    setFkErrorOpen,
    fkErrorMessage,
    toastOpen,
    setToastOpen,
    toastMessage,
    approvalInfo,
    setApprovalInfo,
    activeTableLock,
    filteredData,
    // Handlers
    loadTable,
    handleCellChange,
    handleAddRow,
    handleCancelInlineEdits,
    handleRemoveNewRow,
    handleSaveInlineEdits,
    openEditDialog,
    openDeleteDialog,
    handleGo,
    handleClear,
    handleSaveRecord,
    handleConfirmDelete,
    handleOptimisticLockRefresh,
    releaseTableLockIfHeld,
    tryStartEditingTable,
    setEditSessionEtag,
  } = useTableMaintenance(props)

  const { selectedTable, tables, username, onRefreshTableList, onSelectTable } = props
  const [showAllFilters, setShowAllFilters] = useState(false)
  const [activeTab, setActiveTab] = useState('tableData')
  const filterFields = fields.filter(f => {
    if (showAllFilters) return true
    return f.is_key || f.IsKeyField === 'X'
  })

  useEffect(() => {
    setActiveTab('tableData')
  }, [selectedTable?.ConfigUuid])

  // ── Welcome dashboard (no table selected) ─────────────────────────────────
  if (!selectedTable) {
    return (
      <WelcomeDashboard
        tables={tables}
        username={username}
        onSelectTable={onSelectTable}
        onRefreshTableList={onRefreshTableList}
      />
    )
  }

  // ── Main table maintenance view ────────────────────────────────────────────
  return (
    <>
      {/* Lock banner */}
      {activeTableLock && (
        <div style={{ padding: '1rem', paddingBottom: 0 }}>
          <MessageStrip design="Critical" hideCloseButton>
            Bảng '{selectedTable.TableName}' đang được chỉnh sửa bởi User{' '}
            {activeTableLock.lockedBy}. Chức năng chỉnh sửa tạm thời bị khóa.
          </MessageStrip>
        </div>
      )}

      {/* Error / success strips */}
      {(error) && (
        <div style={{ padding: '1rem' }}>
          {error && (
            <MessageStrip design="Negative" onClose={() => setError('')}>
              {error}
            </MessageStrip>
          )}
        </div>
      )}

      <DynamicPage
        hidePinButton
        titleArea={
          <DynamicPageTitle
            heading={
              <FlexBox alignItems="Center" gap="8px">
                <Button
                  design="Transparent"
                  icon={'navigation-left-arrow' as any}
                  accessibleName="Back to table overview"
                  onClick={() => {
                    releaseTableLockIfHeld()
                    onSelectTable(null)
                  }}
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
                boxSizing: 'border-box',
              }}
            >
              {/* Filter inputs */}
              <FlexBox gap="16px" wrap="Wrap" alignItems="Center">
                <FlexBox direction="Column" gap="4px">
                  <span style={{ fontSize: '0.875rem' }}>Filters</span>
                  <Input
                    placeholder="Search records..."
                    value={searchQuery}
                    onInput={(e: any) => setSearchQuery(e.target.value)}
                    style={{ minWidth: '220px' }}
                  />
                </FlexBox>

                {/* Field filters */}
                {filterFields.map(f => {
                  const name = f.field_name || f.FieldName
                  const label = f.label || f.LabelText || name
                  return (
                    <FlexBox key={name} direction="Column" gap="4px">
                      <span style={{ fontSize: '0.875rem' }}>{label}</span>
                      <Input
                        placeholder={`Filter by ${label}...`}
                        value={filterValues[name] ?? ''}
                        onInput={(e: any) =>
                          setFilterValues(prev => ({ ...prev, [name]: e.target.value }))
                        }
                        style={{ minWidth: '220px' }}
                      />
                    </FlexBox>
                  )
                })}
              </FlexBox>

              {/* Go / Clear buttons */}
              <FlexBox gap="8px" alignItems="Center" style={{ marginLeft: 'auto' }}>
                <Button design="Emphasized" onClick={handleGo}>
                  Go
                </Button>
                <Button
                  design="Transparent"
                  onClick={() => setShowAllFilters(prev => !prev)}
                >
                  {showAllFilters ? 'Basic Filters' : 'More Filters'}
                </Button>
                <Button design="Transparent" onClick={handleClear}>
                  Clear
                </Button>
              </FlexBox>
            </FlexBox>
          </DynamicPageHeader>
        }
      >
        <TabContainer
          onTabSelect={(e: any) => {
            const text = e.detail?.tab?.text
            if (text === 'Field Schema') setActiveTab('fieldSchema')
            else if (text === 'Excel') setActiveTab('excel')
            else if (text === 'Audit Log') setActiveTab('auditLog')
            else if (text === 'Dependencies') setActiveTab('dependencies')
            else setActiveTab('tableData')
          }}
        >
          <Tab text="Table Data" selected={activeTab === 'tableData'}>
            <DynamicDataTable
              selectedTable={selectedTable}
              fields={fields}
              filteredData={filteredData}
              dataLoading={dataLoading}
              isEditingTable={isEditingTable}
              editedData={editedData}
              inlineErrors={inlineErrors}
              activeTableLock={activeTableLock}
              onCellChange={handleCellChange}
              onAddRow={handleAddRow}
              onRemoveNewRow={handleRemoveNewRow}
              onSaveInlineEdits={handleSaveInlineEdits}
              onCancelInlineEdits={handleCancelInlineEdits}
              onStartEditing={() => {
                if (tryStartEditingTable()) {
                  setIsEditingTable(true)
                  setEditedData([...filteredData])
                }
              }}
              onStartCreating={() => {
                if (tryStartEditingTable()) {
                  setIsEditingTable(true)
                  const newRec = initFormValues(allFields, null)
                  newRec._isNew = true
                  setEditedData([...filteredData, newRec])
                }
              }}
              onRefresh={() => loadTable(selectedTable)}
              onDeleteRows={openDeleteDialog}
            />
          </Tab>
          <Tab text="Excel" selected={activeTab === 'excel'}>
            <ExcelPipelineTab
              tableName={selectedTable.TableName}
              onImported={() => loadTable(selectedTable)}
            />
          </Tab>
          <Tab text="Field Schema" selected={activeTab === 'fieldSchema'}>
            <FieldSchemaTab allFields={allFields} />
          </Tab>
          <Tab text="Audit Log" selected={activeTab === 'auditLog'}>
            <AuditLogPanel tableName={selectedTable.TableName} />
          </Tab>
          <Tab text="Dependencies" selected={activeTab === 'dependencies'}>
            {activeTab === 'dependencies' && (
              <RepositoryInfoTab
                configUuid={selectedTable.ConfigUuid}
                tableName={selectedTable.TableName}
              />
            )}
          </Tab>
        </TabContainer>
      </DynamicPage>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <RecordDialog
        open={recordDialogOpen}
        mode={recordDialogMode}
        configUuid={selectedTable.ConfigUuid}
        allFields={allFields}
        initialRow={editingRow}
        tableName={selectedTable.TableName}
        username={username}
        data={data}
        onSave={handleSaveRecord}
        onClose={() => {
          setRecordDialogOpen(false)
          setEditSessionEtag(null)
          releaseTableLockIfHeld()
        }}
      />

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        deletingRows={deletingRows}
        allFields={allFields}
        deleteLoading={deleteLoading}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteDialogOpen(false)
          setDeletingRows([])
          releaseTableLockIfHeld()
        }}
      />

      <OptimisticLockDialog
        open={optimisticLockOpen}
        onRefresh={handleOptimisticLockRefresh}
        onCancel={() => setOptimisticLockOpen(false)}
      />

      <FKErrorDialog
        open={fkErrorOpen}
        message={fkErrorMessage}
        onClose={() => setFkErrorOpen(false)}
      />

      <ApprovalSuccessDialog
        open={!!approvalInfo}
        approvalInfo={approvalInfo}
        tableName={selectedTable.TableName}
        onClose={() => setApprovalInfo(null)}
      />

      <Toast open={toastOpen} onClose={() => setToastOpen(false)} duration={3000}>
        <div style={{ wordBreak: 'break-all', whiteSpace: 'normal', overflowWrap: 'break-word', display: 'block', textAlign: 'center' }}>
          {toastMessage}
        </div>
      </Toast>
    </>
  )
}
