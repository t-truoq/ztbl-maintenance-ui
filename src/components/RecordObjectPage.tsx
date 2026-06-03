import { useState, useEffect, useRef, useId } from 'react'
import {
  ObjectPage,
  ObjectPageTitle,
  ObjectPageSection,
  ObjectPageSubSection,
  Form,
  FormGroup,
  FormItem,
  Button,
  FlexBox,
  Label,
  Input,
  DatePicker,
  CheckBox,
  BusyIndicator,
  Text,
  MessageStrip,
  ObjectStatus,
  Toolbar,
  Bar,
  TableHeaderRow,
  TableHeaderCell,
  Tag,
  Table,
  TableRow,
  TableCell
} from '@ui5/webcomponents-react'
import { formatDateForSap } from '../utils/displayHelpers'
import {
  getFormFields,
  initFormValues,
  validateMandatory,
  isDisplayOnlyField,
  isDomainField,
  normalizeFieldValue,
  getDirtyFieldNames,
  buildKeyRecord
} from '../utils/recordHelpers'
import {
  acquireFieldLock,
  getFieldLocksForRecord,
  releaseSessionLocks,
  touchSessionLocks
} from '../utils/fieldLockService'
import DomainValueHelp from './DomainValueHelp'
import { getAuditLog } from '../services/tableConfigApi'
import { getAuditDisplayCells } from '../utils/auditFormatters'
import { FieldMeta, TableRowData, AuditLogEntry } from '../types'

function fieldName(field: FieldMeta): string {
  return field.field_name || field.FieldName
}

interface FieldLabelProps {
  field: FieldMeta;
}

function FieldLabel({ field }: FieldLabelProps) {
  const name = fieldName(field)
  const title = field.label || field.LabelText || name
  const inputId = `record-field-${name}`
  const feType = field.fe_type || field.FeType

  return (
    <FlexBox direction="Column" gap="2px">
      <Label
        for={inputId}
        showColon
        required={!!(field.is_mandatory || field.MandatoryFlag === 'X')}
        style={{ fontWeight: 'bold' }}
      >
        {title}
        {(field.is_key || field.IsKeyField === 'X') ? ' (Key)' : ''}
      </Label>
      {title !== name && (
        <Text style={{ fontSize: '0.8rem', color: '#6a7075' }}>
          {name}
          {feType ? ` · ${feType}` : ''}
        </Text>
      )}
    </FlexBox>
  )
}

interface RecordObjectPageProps {
  mode: 'view' | 'edit' | 'create';
  configUuid: string;
  allFields: FieldMeta[];
  initialRow: TableRowData | null;
  tableName: string;
  username: string;
  onSave: (formValues: TableRowData, dirtyFieldNames: string[]) => Promise<{ ok: boolean; message?: string }>;
  onClose: () => void;
  onSwitchToEdit: () => void;
  onSwitchToView: () => void;
  onDelete: () => void;
}

export default function RecordObjectPage({
  mode,
  configUuid,
  allFields,
  initialRow,
  tableName,
  username,
  onSave,
  onClose,
  onSwitchToEdit,
  onSwitchToView,
  onDelete
}: RecordObjectPageProps) {
  const isCreate = mode === 'create'
  const isEdit = mode === 'edit'
  const isView = mode === 'view'
  
  // When in view (read-only) mode, we still render the fields. We treat it like editing schema but read-only.
  const formFields = getFormFields(allFields, isCreate ? 'create' : 'edit')
  
  const [values, setValues] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [foreignLocks, setForeignLocks] = useState<Record<string, string>>({})
  const [auditEntries, setAuditEntries] = useState<AuditLogEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const sessionId = useId()
  const baselineRowRef = useRef<TableRowData | null>(null)

  const recordKey =
    !isCreate && initialRow ? buildKeyRecord(allFields, initialRow) : null

  useEffect(() => {
    if (!isCreate && tableName && recordKey) {
      loadAuditLogs()
    } else {
      setAuditEntries([])
    }
  }, [tableName, initialRow, mode])

  async function loadAuditLogs() {
    try {
      setAuditLoading(true)
      const logs = await getAuditLog(tableName)
      if (recordKey) {
        const filtered = logs.filter(entry => {
          return Object.entries(recordKey).every(([k, v]) => {
            const rawVal = String(v)
            const matchStr = `"${k}":"${v}"`
            const matchStr2 = `"${k}":${typeof v === 'number' ? v : `"${v}"`}`
            return (
              (entry.OldValue && (entry.OldValue.includes(matchStr) || entry.OldValue.includes(matchStr2) || entry.OldValue.includes(rawVal))) ||
              (entry.NewValue && (entry.NewValue.includes(matchStr) || entry.NewValue.includes(matchStr2) || entry.NewValue.includes(rawVal)))
            )
          })
        })
        setAuditEntries(filtered)
      } else {
        setAuditEntries([])
      }
    } catch (e) {
      console.error('Failed to load audit logs for record:', e)
      setAuditEntries([])
    } finally {
      setAuditLoading(false)
    }
  }

  function refreshForeignLocks() {
    if (!isEdit || !tableName || !recordKey || !username) {
      setForeignLocks({})
      return
    }
    setForeignLocks(getFieldLocksForRecord(tableName, recordKey, username, sessionId))
  }

  useEffect(() => {
    baselineRowRef.current = isEdit ? initialRow : null
    setValues(initFormValues(formFields, initialRow))
    setValidationError('')
    refreshForeignLocks()

    const onStorage = () => refreshForeignLocks()
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [mode, allFields, initialRow])

  useEffect(() => {
    if (!isEdit) return undefined
    const timer = setInterval(() => {
      touchSessionLocks(sessionId)
      refreshForeignLocks()
    }, 60000)
    return () => clearInterval(timer)
  }, [mode, tableName, recordKey, username])

  useEffect(() => {
    return () => {
      releaseSessionLocks(sessionId)
    }
  }, [sessionId])

  function handleClose() {
    releaseSessionLocks(sessionId)
    onClose()
  }

  function handleCancel() {
    releaseSessionLocks(sessionId)
    if (isEdit) {
      onSwitchToView()
    } else {
      onClose()
    }
  }

  function isLockedByOther(fieldNameKey: string): boolean {
    return Boolean(foreignLocks[fieldNameKey])
  }

  function tryAcquireField(fieldNameKey: string): boolean {
    if (!isEdit || !tableName || !recordKey || !username) return true
    if (isLockedByOther(fieldNameKey)) return false

    const result = acquireFieldLock(tableName, recordKey, fieldNameKey, username, sessionId)
    if (!result.acquired) {
      setForeignLocks(prev => ({ ...prev, [fieldNameKey]: result.heldBy || '' }))
      return false
    }
    refreshForeignLocks()
    return true
  }

  function updateValue(fieldNameKey: string, value: any) {
    if (!tryAcquireField(fieldNameKey)) return
    setValues(prev => ({ ...prev, [fieldNameKey]: value }))
    setValidationError('')
  }

  async function handleSave() {
    const missing = validateMandatory(formFields, values)
    if (missing.length > 0) {
      setValidationError(`Required fields: ${missing.join(', ')}`)
      return
    }

    const normalized: TableRowData = {}
    formFields.forEach(f => {
      const name = fieldName(f)
      normalized[name] = normalizeFieldValue(f, values[name])
    })

    const dirtyFields =
      isEdit
        ? getDirtyFieldNames(formFields, baselineRowRef.current, normalized)
        : []

    if (isEdit && dirtyFields.length === 0) {
      setValidationError('No changes to save')
      return
    }

    if (isEdit && dirtyFields.length > 0) {
      const blockedDirty = dirtyFields.filter(name => isLockedByOther(name))
      if (blockedDirty.length === dirtyFields.length) {
        setValidationError(
          `Cannot save: ${blockedDirty.map(n => foreignLocks[n] || n).join(', ')}`
        )
        return
      }
    }

    setSaving(true)
    try {
      const result = await onSave(normalized, dirtyFields)
      if (result?.ok === false && result.message) {
        setValidationError(result.message)
      } else if (isEdit) {
        onSwitchToView()
      }
    } finally {
      setSaving(false)
    }
  }

  function renderDisplayValue(field: FieldMeta) {
    const name = fieldName(field)
    const value = values[name] ?? ''
    const feType = field.fe_type || field.FeType

    if (feType === 'boolean') {
      return <Text>{value === 'X' ? 'Yes' : 'No'}</Text>
    }
    return <Text>{value}</Text>
  }

  function renderField(field: FieldMeta) {
    const name = fieldName(field)
    const lockedBy = foreignLocks[name]
    const fieldLocked = Boolean(lockedBy)
    const feType = field.fe_type || field.FeType

    // If we're in view-only mode, or if the field is locked by someone else, render it read-only
    if (isView || isDisplayOnlyField(field, isCreate ? 'create' : 'edit') || fieldLocked) {
      return (
        <FlexBox direction="Column" gap="4px">
          {renderDisplayValue(field)}
          {fieldLocked && (
            <Text style={{ fontSize: '0.8rem', color: '#bb0000', fontWeight: 'bold' }}>
              Locked by {lockedBy}
            </Text>
          )}
        </FlexBox>
      )
    }

    const value = values[name] ?? ''
    const inputId = `record-field-${name}`

    if (isDomainField(field)) {
      return (
        <DomainValueHelp
          configUuid={configUuid}
          field={field}
          value={value}
          inputId={inputId}
          readonly={false}
          onChange={v => updateValue(name, v)}
        />
      )
    }

    switch (feType) {
      case 'uuid':
        return (
          <Input
            id={inputId}
            value={value}
            readonly={isEdit && !!(field.is_key || field.IsKeyField === 'X')}
            onInput={(e: any) => updateValue(name, e.target.value)}
            style={{ width: '100%' }}
          />
        )
      case 'date':
        return (
          <DatePicker
            id={inputId}
            value={value}
            onChange={(e: any) => updateValue(name, formatDateForSap(e.target.value))}
            style={{ width: '100%' }}
          />
        )
      case 'boolean':
        return (
          <CheckBox
            id={inputId}
            checked={value === 'X'}
            onChange={(e: any) => updateValue(name, e.target.checked ? 'X' : '')}
          />
        )
      case 'decimal':
        return (
          <Input
            id={inputId}
            type="Number"
            value={value}
            placeholder={field.label || field.LabelText || name}
            onInput={(e: any) => updateValue(name, e.target.value)}
            style={{ width: '100%' }}
          />
        )
      case 'integer':
        return (
          <Input
            id={inputId}
            type="Number"
            value={value}
            placeholder={field.label || field.LabelText || name}
            onInput={(e: any) => updateValue(name, e.target.value)}
            style={{ width: '100%' }}
          />
        )
      case 'time':
        return (
          <Input
            id={inputId}
            value={value}
            placeholder="HH:MM:SS"
            onInput={(e: any) => updateValue(name, e.target.value)}
            style={{ width: '100%' }}
          />
        )
      case 'text':
      default:
        return (
          <Input
            id={inputId}
            value={value}
            maxlength={field.length || field.Length || undefined}
            placeholder={field.label || field.LabelText || name}
            onInput={(e: any) => updateValue(name, e.target.value)}
            style={{ width: '100%' }}
          />
        )
    }
  }

  // Build the title text for the Object Page
  let titleText = 'Create Record'
  if (!isCreate && recordKey) {
    titleText = Object.entries(recordKey)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
  }

  const lockedFieldLabels = Object.entries(foreignLocks).map(
    ([name, user]) => `${name} (${user})`
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--sapBackgroundColor, #f5f6f7)' }}>
      <ObjectPage
        style={{ flex: 1 }}
        titleArea={
          <ObjectPageTitle
            header={titleText}
            subHeader={tableName}
            actionsBar={
              isView ? (
                <Toolbar design="Transparent" style={{ padding: 0 }}>
                  <Button design="Emphasized" icon="edit" onClick={onSwitchToEdit}>
                    Edit
                  </Button>
                  <Button design="Negative" icon="delete" onClick={onDelete}>
                    Delete
                  </Button>
                  <Button design="Transparent" icon="decline" onClick={handleClose}>
                    Close
                  </Button>
                </Toolbar>
              ) : (null as any)
            }
          />
        }
        footerArea={
          (isEdit || isCreate) ? (
            <Bar
              design="FloatingFooter"
              endContent={
                <>
                  <Button design="Emphasized" onClick={handleSave} disabled={saving}>
                    Save
                  </Button>
                  <Button design="Transparent" onClick={handleCancel} disabled={saving}>
                    Cancel
                  </Button>
                </>
              }
            />
          ) : (null as any)
        }
      >
        <ObjectPageSection titleText="General Information" id="general-info">
          <ObjectPageSubSection id="general-info-sub" titleText="Details">
            <FlexBox direction="Column" style={{ width: '100%', gap: '1rem' }}>
              {saving && <BusyIndicator active size="M" />}
              {validationError && (
                <MessageStrip design="Negative" onClose={() => setValidationError('')}>
                  {validationError}
                </MessageStrip>
              )}
              {lockedFieldLabels.length > 0 && (
                <MessageStrip design="Information">
                  Fields locked by another user: {lockedFieldLabels.join(', ')}
                </MessageStrip>
              )}

              <Form layout="S1 M1 L2 XL2" style={{ width: '100%' }}>
                <FormGroup>
                  {formFields.map(field => (
                    <FormItem key={fieldName(field)} labelContent={<FieldLabel field={field} />}>
                      {renderField(field)}
                    </FormItem>
                  ))}
                </FormGroup>
              </Form>
            </FlexBox>
          </ObjectPageSubSection>
        </ObjectPageSection>

        {!isCreate && recordKey ? (
          <ObjectPageSection titleText="Record Status" id="record-status">
            <ObjectPageSubSection id="record-status-sub" titleText="Status Details">
              <Form layout="S1 M1 L2 XL2" style={{ width: '100%' }}>
                <FormGroup>
                  <FormItem labelContent={<Label style={{ fontWeight: 'bold' }}>Active State</Label>}>
                    <ObjectStatus state={initialRow?.ActiveFlag === 'X' || initialRow?.active_flag === 'X' ? 'Positive' : 'None'}>
                      {initialRow?.ActiveFlag === 'X' || initialRow?.active_flag === 'X' ? 'Active' : 'Inactive'}
                    </ObjectStatus>
                  </FormItem>
                  <FormItem labelContent={<Label style={{ fontWeight: 'bold' }}>Lock Status</Label>}>
                    {lockedFieldLabels.length > 0 ? (
                      <ObjectStatus state="Negative" icon="private">
                        Locked (Partial)
                      </ObjectStatus>
                    ) : (
                      <ObjectStatus state="Positive" icon="locked">
                        Unlocked / Editable
                      </ObjectStatus>
                    )}
                  </FormItem>
                </FormGroup>
              </Form>
            </ObjectPageSubSection>
          </ObjectPageSection>
        ) : (null as any)}

        {!isCreate && recordKey ? (
          <ObjectPageSection titleText="Change History" id="change-history">
            <ObjectPageSubSection id="change-history-sub" titleText="Audit Trail">
              {auditLoading && <BusyIndicator active size="S" />}
              {!auditLoading && auditEntries.length === 0 && (
                <Text style={{ color: '#6a7075', fontSize: '0.9rem' }}>No change history found for this record.</Text>
              )}
              {!auditLoading && auditEntries.length > 0 && (
                <Table
                  headerRow={
                    <TableHeaderRow>
                      <TableHeaderCell minWidth="90px"><Label>Action</Label></TableHeaderCell>
                      <TableHeaderCell minWidth="120px"><Label>Field Name</Label></TableHeaderCell>
                      <TableHeaderCell minWidth="120px"><Label>Old Value</Label></TableHeaderCell>
                      <TableHeaderCell minWidth="120px"><Label>New Value</Label></TableHeaderCell>
                      <TableHeaderCell minWidth="100px"><Label>Changed By</Label></TableHeaderCell>
                      <TableHeaderCell minWidth="140px"><Label>Changed At</Label></TableHeaderCell>
                    </TableHeaderRow>
                  }
                >
                  {auditEntries.map(entry => {
                    const { fieldName: fName, oldValue, newValue } = getAuditDisplayCells(entry)
                    const isUpdate = entry.ActionType === 'U'
                    const actionColors: Record<string, any> = { C: '8', U: '6', D: '1' }
                    const actionLabels: Record<string, string> = { C: 'Created', U: 'Updated', D: 'Deleted' }
                    return (
                      <TableRow key={entry.AuditId}>
                        <TableCell>
                          <Tag colorScheme={actionColors[entry.ActionType] || '2'}>
                            {actionLabels[entry.ActionType] || entry.ActionType}
                          </Tag>
                        </TableCell>
                        <TableCell>
                          <Text style={{ fontWeight: 'bold' }}>{fName}</Text>
                          {isUpdate && (oldValue || newValue) && (
                            <Text style={{ fontSize: '0.8rem', color: '#6a7075', marginTop: '2px' }}>
                              {oldValue || '—'} → {newValue || '—'}
                            </Text>
                          )}
                        </TableCell>
                        <TableCell><Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{oldValue || '—'}</Text></TableCell>
                        <TableCell><Text style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{newValue || '—'}</Text></TableCell>
                        <TableCell><Text>{entry.ChangedBy || ''}</Text></TableCell>
                        <TableCell>
                          <Text>
                            {entry.ChangedAt ? String(entry.ChangedAt).substring(0, 19) : ''}
                          </Text>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </Table>
              )}
            </ObjectPageSubSection>
          </ObjectPageSection>
        ) : (null as any)}
      </ObjectPage>
    </div>
  )
}
