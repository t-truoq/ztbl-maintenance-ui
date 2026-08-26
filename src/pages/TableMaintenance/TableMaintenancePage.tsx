import { useCallback, useEffect, useState } from 'react'
import {
  DynamicPage,
  DynamicPageHeader,
  FlexBox,
  Title,
  Button,
  Input,
  MessageStrip,
  TabContainer,
  Tab,
  Tag,
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
import AppLoadingState from '../../components/AppLoadingState'
import { getAiDescription } from '../../services/tableConfigApi'
import { getCredentials, getFriendlyErrorMessage } from '../../services/apiClient'
import {
  FULL_TABLE_PERMISSION,
  NO_TABLE_PERMISSION,
  TablePermissionState,
  getTablePermissions,
  isCurrentUserInAdminList
} from '../../services/authAdminApi'
import { buildAiDescriptionMap, exportDataDictionaryPdf } from '../../utils/aiDescriptions'
import { AiDescriptionMap } from '../../types'

/* ============================================================================
 * PHAN 1: KHAI BAO PROPS VA KHOI TAO HOOK USE_TABLE_MAINTENANCE
 * ============================================================================ */

const PENDING_TABLE_PERMISSION: TablePermissionState = {
  ...FULL_TABLE_PERMISSION,
  canView: true
}

export default function TableMaintenancePage(props: TableMaintenancePageProps) {
  // Goi Hook bo nao de lay toan bo state va cac ham xu ly CRUD
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
    pendingApprovalRecords,
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

  /* ============================================================================
   * PHAN 2: QUAN LY STATE NOI BO, BO LOC DONG VA QUYEN TRUY CAP
   * ============================================================================ */

  const { selectedTable, tables, username, onRefreshTableList, onSelectTable } = props
  const [showAllFilters, setShowAllFilters] = useState(false)
  const [activeTab, setActiveTab] = useState('tableData')
  const [aiDescriptions, setAiDescriptions] = useState<AiDescriptionMap>({})
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [canRollbackAudit, setCanRollbackAudit] = useState(true)
  const [tablePermission] = useState<TablePermissionState>(FULL_TABLE_PERMISSION)

  // Loc danh sach cot hien thi o thanh Header (Mac dinh chi hien thi cac cot Khoa chinh Key)
  const filterFields = fields.filter(f => {
    if (showAllFilters) return true
    return f.is_key || f.IsKeyField === 'X'
  })

  // Reset trang thai tab va cache AI khi chuyen sang bang khac
  useEffect(() => {
    setActiveTab('tableData')
    setAiDescriptions({})
    setAiError('')
  }, [selectedTable?.ConfigUuid])

  // Tu dong tat Toast message sau 6 giay
  useEffect(() => {
    if (!toastOpen) return undefined
    const timer = window.setTimeout(() => setToastOpen(false), 6000)
    return () => window.clearTimeout(timer)
  }, [toastOpen, toastMessage, setToastOpen])
  // Check user admin to rollback audit log
  useEffect(() => {
    const effectiveUsername = username || getCredentials()?.username || ''
    if (effectiveUsername) {
      isCurrentUserInAdminList(effectiveUsername).then(isAdmin => {
        setCanRollbackAudit(isAdmin)
      }).catch(() => {
        setCanRollbackAudit(true)
      })
    }
  }, [username])

  const canViewTable = true
  const isAccessDenied = false
  const canCreateTable = true
  const canUpdateTable = true
  const canDeleteTable = true
  const canUploadTable = true
  const tableAccessPanel = null

  /* ============================================================================
   * PHAN 3: XU LY MO TA AI CHO CAC TRUONG (AI FIELD DESCRIPTIONS)
   * ============================================================================ */

  /**
   * [HAM handleLoadAiDescriptions]: Goi API getAiDescription de lay mo ta tu Gemini AI.
   * Co co che luu cache vao sessionStorage de khong goi lai lan 2.
   */
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

  /* ============================================================================
   * PHAN 4: RENDER WELCOME DASHBOARD KHI CHUA CHON BANG
   * ============================================================================ */

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

  /* ============================================================================
   * PHAN 5: RENDER GIAO DIEN CHINH (HEADER DYNAMICPAGE, FILTER BAR, TABCONTAINER)
   * ============================================================================ */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, overflow: 'hidden' }}>
      {/* ── Banner Canh bao Chặn Quyền (Access Denied) ───────────────── */}
      {isAccessDenied && (
        <div style={{ padding: '1rem', paddingBottom: 0 }}>
          <MessageStrip design="Negative" hideCloseButton>
            Access Denied. You do not have permission to view this data. Please contact your administrator if you need access.
          </MessageStrip>
        </div>
      )}

      {/* ── Banner Canh bao Bang dang bi nguoi khac Khoa ────────────── */}
      {activeTableLock && (
        <div style={{ padding: '1rem', paddingBottom: 0 }}>
          <MessageStrip design="Critical" hideCloseButton>
            Table '{selectedTable.TableName}' is currently being edited by User{' '}
            {activeTableLock.lockedBy}. Editing is temporarily locked.
          </MessageStrip>
        </div>
      )}

      {/* ── Thong bao Loi / Thanh cong ──────────────────────────────── */}
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
      {toastOpen && toastMessage && (
        <div style={{ padding: '1rem', paddingBottom: 0 }}>
          <MessageStrip design="Positive" onClose={() => setToastOpen(false)}>
            {toastMessage}
          </MessageStrip>
        </div>
      )}

      {/* ── Thanh Tieu de Bang (Sticky Header) ───────────────────────── */}
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
      </div>

      {/* ── DynamicPage Fiori voi Thanh Bo Loc (Filter Bar) ─────────── */}
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
              {/* Cac o nhap bo loc */}
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

                {/* Loc theo tung truong du lieu */}
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

              {/* Nut Go / Clear */}
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
        {/* ── He thong 5 Tabs Chuc nang ──────────────────────────────── */}
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
          {/* TAB 1: TABLE DATA (Grid du lieu dong) */}
          <Tab text="Table Data" selected={activeTab === 'tableData'}>
            {canViewTable ? (
              <DynamicDataTable
                selectedTable={selectedTable}
                fields={fields}
                filteredData={filteredData}
                dataLoading={dataLoading}
                isEditingTable={isEditingTable}
                editedData={editedData}
                inlineErrors={inlineErrors}
                activeTableLock={activeTableLock}
                pendingApprovalRecords={pendingApprovalRecords}
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
                    setEditedData([newRec, ...filteredData])
                  }
                }}
                onRefresh={() => loadTable(selectedTable)}
                onDeleteRows={rows => {
                  if (!canDeleteTable) return
                  openDeleteDialog(rows)
                }}
                onEditRecord={row => {
                  if (!canUpdateTable) return
                  openEditDialog(row)
                }}
                onSaveRecord={handleSaveRecord}
                aiDescriptions={aiDescriptions}
                aiLoading={aiLoading}
                onRequestAiDescriptions={() => handleLoadAiDescriptions(false)}
              />
            ) : tableAccessPanel}
          </Tab>

          {/* TAB 2: EXCEL PIPELINE (Import / Export) */}
          <Tab text="Excel" selected={activeTab === 'excel'}>
            {canViewTable ? (
              <ExcelPipelineTab
                tableName={selectedTable.TableName}
                allFields={allFields}
                canUpload={canUploadTable}
                onImported={() => loadTable(selectedTable)}
              />
            ) : tableAccessPanel}
          </Tab>

          {/* TAB 3: FIELD SCHEMA (Tu dien Schema & Xuat PDF) */}
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

          {/* TAB 4: AUDIT LOG (Vet kiem toan & Hoan tac Rollback) */}
          <Tab text="Audit Log" selected={activeTab === 'auditLog'}>
            {canViewTable ? (
              <AuditLogPanel tableName={selectedTable.TableName} canRollback={canRollbackAudit} />
            ) : tableAccessPanel}
          </Tab>

          {/* TAB 5: DEPENDENCIES (Quan he phu thuoc Repository Objects) */}
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

      {/* ============================================================================
       * PHAN 6: HE THONG HOP THOAI DIALOGS
       * ============================================================================ */}

      {/* Form Dialog Them / Sua 1 ban ghi */}
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

      {/* Hop thoai Xac nhan Xoa ban ghi */}
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

      {/* Hop thoai Bao loi Xung dot ETag (Optimistic Lock) */}
      <OptimisticLockDialog
        open={optimisticLockOpen}
        onRefresh={handleOptimisticLockRefresh}
        onCancel={() => setOptimisticLockOpen(false)}
      />

      {/* Hop thoai Bao loi Khoa ngoai FK (Foreign Key Reference) */}
      <FKErrorDialog
        open={fkErrorOpen}
        message={fkErrorMessage}
        onClose={() => setFkErrorOpen(false)}
      />

      {/* Hop thoai Thong bao Yeu cau Phe duyet thanh cong */}
      <ApprovalSuccessDialog
        open={!!approvalInfo}
        approvalInfo={approvalInfo}
        tableName={selectedTable.TableName}
        onClose={() => setApprovalInfo(null)}
      />

    </div>
  )
}
