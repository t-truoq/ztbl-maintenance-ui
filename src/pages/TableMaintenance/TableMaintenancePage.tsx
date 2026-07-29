import { useCallback, useEffect, useState } from 'react'
import {
  DynamicPage,
  DynamicPageHeader,
  FlexBox,
  Title,
  Text,
  Button,
  BusyIndicator,
  Input,
  MessageStrip,
  TabContainer,
  Tab,
  Tag,
  Toast,
} from '@ui5/webcomponents-react'
import {
  useTableMaintenance,
  TableMaintenancePageProps,
} from './hooks/useTableMaintenance'
import { initFormValues } from '../../utils/recordHelpers'
import { formatHeaderLabel, isYesFlag } from '../../utils/tableHelpers'
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
import { getAiDescription } from '../../services/tableConfigApi'
import { getCredentials } from '../../services/apiClient'
import {
  FULL_TABLE_PERMISSION,
  TablePermissionState,
  getTablePermissions,
  isCurrentUserInAdminList
} from '../../services/authAdminApi'
import { buildAiDescriptionMap, exportDataDictionaryPdf } from '../../utils/aiDescriptions'
import { AiDescriptionMap } from '../../types'

const PENDING_TABLE_PERMISSION: TablePermissionState = {
  ...FULL_TABLE_PERMISSION,
  canView: true
}

export default function TableMaintenancePage(props: TableMaintenancePageProps) {
  const {
    // State
    allFields,
    fields,
    data,
    dataLoading,
    error,
    setError,
    successMsg,
    setSuccessMsg,
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
  const [aiDescriptions, setAiDescriptions] = useState<AiDescriptionMap>({})
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [canRollbackAudit, setCanRollbackAudit] = useState(false)
  const [tablePermission, setTablePermission] = useState<TablePermissionState>(PENDING_TABLE_PERMISSION)
  const [permissionLoading, setPermissionLoading] = useState(true)
  const [permissionTableName, setPermissionTableName] = useState('')
  const filterFields = fields.filter(f => {
    if (showAllFilters) return true
    return f.is_key || f.IsKeyField === 'X'
  })

  useEffect(() => {
    setActiveTab('tableData')
    setAiDescriptions({})
    setAiError('')
  }, [selectedTable?.ConfigUuid])

  useEffect(() => {
    let isCancelled = false

    setCanRollbackAudit(false)
    setTablePermission(PENDING_TABLE_PERMISSION)
    setPermissionLoading(true)
    setPermissionTableName('')

    const effectiveUsername = username || getCredentials()?.username || ''
    if (!effectiveUsername || !selectedTable?.TableName) {
      setPermissionLoading(false)
      return
    }

    const tableNameForPermission = selectedTable.TableName
    Promise.all([
      isCurrentUserInAdminList(effectiveUsername),
      getTablePermissions(effectiveUsername, tableNameForPermission)
    ])
      .then(([isAdmin, permissions]) => {
        if (!isCancelled) {
          setCanRollbackAudit(isAdmin)
          setTablePermission(isAdmin ? FULL_TABLE_PERMISSION : permissions)
          setPermissionTableName(tableNameForPermission)
        }
      })
      .catch(error => {
        if (!isCancelled) {
          console.warn('Cannot load authorization settings:', error)
          const isKnownAdmin = ['DEV-253', 'DEV-213', 'ADMIN', 'DEVELOPER'].includes(effectiveUsername.toUpperCase())
          setCanRollbackAudit(isKnownAdmin)
          setTablePermission(FULL_TABLE_PERMISSION)
          setPermissionTableName(tableNameForPermission)
        }
      })
      .finally(() => {
        if (!isCancelled) setPermissionLoading(false)
      })

    return () => {
      isCancelled = true
    }
  }, [username, selectedTable?.TableName])

  const permissionReady = !permissionLoading && permissionTableName === selectedTable?.TableName
  const canViewTable = permissionReady && tablePermission.canView
  const isAccessDenied = permissionReady && !tablePermission.canView
  const canCreateTable = tablePermission.canCreate
  const canUpdateTable = tablePermission.canUpdate && tablePermission.updateEnabled
  const canDeleteTable = tablePermission.canDelete && tablePermission.deleteEnabled
  const canUploadTable = tablePermission.canUpload
  const accessDeniedPanel = (
    <div className="tab-panel-form">
      <MessageStrip design="Negative" hideCloseButton>
        Access Denied. You do not have permission to view this data. Please contact your administrator if you need access.
      </MessageStrip>
    </div>
  )
  const permissionPendingPanel = (
    <div className="tab-panel-form table-permission-loading">
      <BusyIndicator active size="M" />
      <Text>Loading table access...</Text>
    </div>
  )
  const tableAccessPanel = isAccessDenied ? accessDeniedPanel : permissionPendingPanel

  const handleLoadAiDescriptions = useCallback(async (forceRefresh = false) => {
    if (!selectedTable) return
    const cacheKey = `ztbl-ai-descriptions:${selectedTable.ConfigUuid}:${selectedTable.TableName}`

    if (!forceRefresh) {
      const cached = sessionStorage.getItem(cacheKey)
      if (cached) {
        try {
          setAiDescriptions(JSON.parse(cached))
          setAiError('')
          return
        } catch {
          sessionStorage.removeItem(cacheKey)
        }
      }
    }

    setAiLoading(true)
    setAiError('')
    try {
      const rows = await getAiDescription(selectedTable.ConfigUuid, selectedTable.TableName)
      const descriptions = buildAiDescriptionMap(rows)
      setAiDescriptions(descriptions)
      sessionStorage.setItem(cacheKey, JSON.stringify(descriptions))
      if (rows.length === 0) {
        setAiError('AI did not return any field descriptions for this table.')
      }
    } catch (e: any) {
      setAiError(e?.message || 'Cannot load AI field descriptions.')
    } finally {
      setAiLoading(false)
    }
  }, [selectedTable?.ConfigUuid, selectedTable?.TableName])

  const handleExportDataDictionary = () => {
    if (!selectedTable) return
    exportDataDictionaryPdf(selectedTable, allFields, aiDescriptions)
  }

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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* Permission banner */}
      {isAccessDenied && (
        <div style={{ padding: '1rem', paddingBottom: 0 }}>
          <MessageStrip design="Negative" hideCloseButton>
            Access Denied. You do not have permission to view this data. Please contact your administrator if you need access.
          </MessageStrip>
        </div>
      )}

      {/* Lock banner */}
      {activeTableLock && (
        <div style={{ padding: '1rem', paddingBottom: 0 }}>
          <MessageStrip design="Critical" hideCloseButton>
            Table '{selectedTable.TableName}' is currently being edited by User{' '}
            {activeTableLock.lockedBy}. Editing is temporarily locked.
          </MessageStrip>
        </div>
      )}

      {/* Error / success strips */}
      {(error) && (
        <div style={{ padding: '1rem', paddingBottom: 0 }}>
          <MessageStrip design="Negative" onClose={() => setError('')}>
            {error}
          </MessageStrip>
        </div>
      )}
      {successMsg && (
        <div style={{ padding: '1rem', paddingBottom: 0 }}>
          <MessageStrip design="Positive" onClose={() => setSuccessMsg('')}>
            {successMsg}
          </MessageStrip>
        </div>
      )}

      <div className="maintenance-sticky-title">
        <FlexBox alignItems="Center" gap="8px" className="maintenance-sticky-title-main">
          <Button
            design="Transparent"
            icon={'navigation-left-arrow' as any}
            accessibleName="Back to table overview"
            onClick={() => {
              releaseTableLockIfHeld()
              onSelectTable(null)
            }}
          />
          <Title level="H4" className="maintenance-table-name">{selectedTable.TableName}</Title>
          {isYesFlag(selectedTable.ApprovalRequired) && (
            <Tag colorScheme="6">Approval Required</Tag>
          )}
        </FlexBox>
        <Text className="maintenance-table-description">
          {selectedTable.Description || 'Database Table'}
        </Text>
      </div>

      <DynamicPage
        style={{ flex: 1, minHeight: 0 }}
        hidePinButton
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
                  const label = formatHeaderLabel(f)
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
          className="maintenance-tab-container"
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
            {canViewTable ? (
              <DynamicDataTable
                selectedTable={selectedTable}
                fields={fields}
                filteredData={filteredData}
                dataLoading={dataLoading || permissionLoading}
                isEditingTable={isEditingTable}
                editedData={editedData}
                inlineErrors={inlineErrors}
                activeTableLock={activeTableLock}
                permissions={{
                  canCreate: canCreateTable,
                  canUpdate: canUpdateTable,
                  canDelete: canDeleteTable
                }}
                onCellChange={handleCellChange}
                onAddRow={handleAddRow}
                onRemoveNewRow={handleRemoveNewRow}
                onSaveInlineEdits={handleSaveInlineEdits}
                onCancelInlineEdits={handleCancelInlineEdits}
                onStartEditing={() => {
                  if (!canUpdateTable) return
                  if (tryStartEditingTable()) {
                    setIsEditingTable(true)
                    setEditedData([...filteredData])
                  }
                }}
                onStartCreating={() => {
                  if (!canCreateTable) return
                  if (tryStartEditingTable()) {
                    setIsEditingTable(true)
                    const newRec = initFormValues(allFields, null)
                    newRec._isNew = true
                    setEditedData([...filteredData, newRec])
                  }
                }}
                onRefresh={() => loadTable(selectedTable)}
                onDeleteRows={rows => {
                  if (!canDeleteTable) return
                  openDeleteDialog(rows)
                }}
                aiDescriptions={aiDescriptions}
                aiLoading={aiLoading}
                onRequestAiDescriptions={() => handleLoadAiDescriptions(false)}
              />
            ) : tableAccessPanel}
          </Tab>
          <Tab text="Excel" selected={activeTab === 'excel'}>
            {canViewTable ? (
              <ExcelPipelineTab
                tableName={selectedTable.TableName}
                canUpload={canUploadTable}
                onImported={() => loadTable(selectedTable)}
              />
            ) : tableAccessPanel}
          </Tab>
          <Tab text="Field Schema" selected={activeTab === 'fieldSchema'}>
            {canViewTable ? (
              <FieldSchemaTab
                allFields={allFields}
                aiDescriptions={aiDescriptions}
                aiLoading={aiLoading}
                aiError={aiError}
                onLoadAiDescriptions={() => handleLoadAiDescriptions(true)}
                onExportPdf={handleExportDataDictionary}
              />
            ) : tableAccessPanel}
          </Tab>
          <Tab text="Audit Log" selected={activeTab === 'auditLog'}>
            {canViewTable ? (
              <AuditLogPanel tableName={selectedTable.TableName} canRollback={canRollbackAudit} />
            ) : tableAccessPanel}
          </Tab>
          <Tab text="Dependencies" selected={activeTab === 'dependencies'}>
            {canViewTable && activeTab === 'dependencies' ? (
              <RepositoryInfoTab
                configUuid={selectedTable.ConfigUuid}
                tableName={selectedTable.TableName}
              />
            ) : !canViewTable ? tableAccessPanel : null}
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
    </div>
  )
}
