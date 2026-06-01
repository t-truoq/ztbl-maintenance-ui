import React, { useState, useEffect, useRef, useId } from 'react'
import {
  Dialog,
  Bar,
  Button,
  FlexBox,
  Label,
  Input,
  DatePicker,
  CheckBox,
  BusyIndicator,
  Text,
  MessageStrip
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

function fieldName(field) {
  return field.field_name || field.FieldName
}

function FieldLabel({ field }) {
  const name = fieldName(field)
  const title = field.label || field.LabelText || name
  const inputId = `record-field-${name}`
  const feType = field.fe_type || field.FeType

  return (
    <FlexBox direction="Column" gap="2px">
      <Label
        for={inputId}
        showColon
        required={field.is_mandatory || field.MandatoryFlag === 'X'}
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

export default function RecordDialog({
  open,
  mode,
  configUuid,
  allFields,
  initialRow,
  tableName,
  username,
  onSave,
  onClose
}) {
  const formFields = getFormFields(allFields, mode)
  const [values, setValues] = useState({})
  const [saving, setSaving] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [foreignLocks, setForeignLocks] = useState({})
  const sessionId = useId()
  const baselineRowRef = useRef(null)

  const recordKey =
    mode === 'edit' && initialRow ? buildKeyRecord(allFields, initialRow) : null

  function refreshForeignLocks() {
    if (mode !== 'edit' || !tableName || !recordKey || !username) {
      setForeignLocks({})
      return
    }
    setForeignLocks(getFieldLocksForRecord(tableName, recordKey, username, sessionId))
  }

  useEffect(() => {
    if (!open) return
    baselineRowRef.current = mode === 'edit' ? initialRow : null
    setValues(initFormValues(formFields, initialRow))
    setValidationError('')
    refreshForeignLocks()

    const onStorage = () => refreshForeignLocks()
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [open, mode, allFields, initialRow])

  useEffect(() => {
    if (!open || mode !== 'edit') return undefined
    const timer = setInterval(() => {
      touchSessionLocks(sessionId)
      refreshForeignLocks()
    }, 60000)
    return () => clearInterval(timer)
  }, [open, mode, tableName, recordKey, username])

  useEffect(() => {
    if (!open) {
      releaseSessionLocks(sessionId)
    }
  }, [open, sessionId])

  function handleClose() {
    releaseSessionLocks(sessionId)
    onClose()
  }

  function isLockedByOther(fieldName) {
    return Boolean(foreignLocks[fieldName])
  }

  function tryAcquireField(fieldName) {
    if (mode !== 'edit' || !tableName || !recordKey || !username) return true
    if (isLockedByOther(fieldName)) return false

    const result = acquireFieldLock(tableName, recordKey, fieldName, username, sessionId)
    if (!result.acquired) {
      setForeignLocks(prev => ({ ...prev, [fieldName]: result.heldBy }))
      return false
    }
    refreshForeignLocks()
    return true
  }

  function updateValue(fieldName, value) {
    if (!tryAcquireField(fieldName)) return
    setValues(prev => ({ ...prev, [fieldName]: value }))
    setValidationError('')
  }

  async function handleSave() {
    const missing = validateMandatory(formFields, values)
    if (missing.length > 0) {
      setValidationError(`Required fields: ${missing.join(', ')}`)
      return
    }

    const normalized = {}
    formFields.forEach(f => {
      const name = fieldName(f)
      normalized[name] = normalizeFieldValue(f, values[name])
    })

    const dirtyFields =
      mode === 'edit'
        ? getDirtyFieldNames(formFields, baselineRowRef.current, normalized)
        : []

    if (mode === 'edit' && dirtyFields.length === 0) {
      setValidationError('No changes to save')
      return
    }

    if (mode === 'edit' && dirtyFields.length > 0) {
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
      }
    } finally {
      setSaving(false)
    }
  }

  function renderDisplayValue(field) {
    const name = fieldName(field)
    const value = values[name] ?? ''
    const feType = field.fe_type || field.FeType

    if (feType === 'boolean') {
      return <Text>{value === 'X' ? 'Yes' : 'No'}</Text>
    }
    return <Text>{value}</Text>
  }

  function renderField(field) {
    const name = fieldName(field)
    const lockedBy = foreignLocks[name]
    const fieldLocked = Boolean(lockedBy)
    const feType = field.fe_type || field.FeType

    if (isDisplayOnlyField(field, mode) || fieldLocked) {
      return (
        <FlexBox direction="Column" gap="4px">
          {renderDisplayValue(field)}
          {fieldLocked && (
            <Text style={{ fontSize: '0.8rem', color: '#bb0000' }}>
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
            readonly={mode === 'edit' && (field.is_key || field.IsKeyField === 'X')}
            onInput={e => updateValue(name, e.target.value)}
          />
        )
      case 'date':
        return (
          <DatePicker
            id={inputId}
            value={value}
            onChange={e => updateValue(name, formatDateForSap(e.target.value))}
          />
        )
      case 'boolean':
        return (
          <CheckBox
            id={inputId}
            checked={value === 'X'}
            onChange={e => updateValue(name, e.target.checked ? 'X' : '')}
          />
        )
      case 'decimal':
        return (
          <Input
            id={inputId}
            type="Number"
            value={value}
            placeholder={field.label || field.LabelText || name}
            onInput={e => updateValue(name, e.target.value)}
          />
        )
      case 'integer':
        return (
          <Input
            id={inputId}
            type="Number"
            value={value}
            placeholder={field.label || field.LabelText || name}
            onInput={e => updateValue(name, e.target.value)}
          />
        )
      case 'time':
        return (
          <Input
            id={inputId}
            value={value}
            placeholder="HH:MM:SS"
            onInput={e => updateValue(name, e.target.value)}
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
            onInput={e => updateValue(name, e.target.value)}
          />
        )
    }
  }

  const lockedFieldLabels = Object.entries(foreignLocks).map(
    ([name, user]) => `${name} (${user})`
  )

  return (
    <Dialog
      open={open}
      headerText={mode === 'create' ? 'Create Record' : 'Edit Record'}
      style={{ width: '720px' }}
      footer={
        <Bar
          design="Footer"
          endContent={
            <>
              <Button design="Transparent" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
              <Button design="Emphasized" onClick={handleSave} disabled={saving}>
                Save
              </Button>
            </>
          }
        />
      }
    >
      {saving && (
        <BusyIndicator active size="Medium" style={{ marginBottom: '1rem' }} />
      )}
      {validationError && (
        <Text style={{ color: '#bb0000', marginBottom: '0.5rem' }}>{validationError}</Text>
      )}
      {lockedFieldLabels.length > 0 && (
        <MessageStrip design="Information" style={{ marginBottom: '0.75rem' }}>
          Fields locked by another user: {lockedFieldLabels.join(', ')}
        </MessageStrip>
      )}

      <FlexBox direction="Column" style={{ gap: '1rem', padding: '0.25rem 0' }}>
        {formFields.map(field => {
          const feType = field.fe_type || field.FeType
          return (
            <FlexBox
              key={fieldName(field)}
              direction="Column"
              style={{ gap: '0.35rem' }}
            >
              {feType !== 'boolean' && !isDomainField(field) && <FieldLabel field={field} />}
              {isDomainField(field) && <FieldLabel field={field} />}
              {renderField(field)}
            </FlexBox>
          )
        })}
      </FlexBox>
    </Dialog>
  )
}
