import { describe, it, expect } from 'vitest'
import { getAuditValueParts, getAuditDisplayCells } from './auditFormatters'

describe('auditFormatters', () => {
  it('parses audit JSON object correctly', () => {
    const json = JSON.stringify({ NAME: 'Header 1', STATUS: 'Active', MANDT: '324' })
    const parts = getAuditValueParts(json)
    expect(parts).toEqual([
      { key: 'NAME', value: 'Header 1' },
      { key: 'STATUS', value: 'Active' }
    ])
  })

  it('filters out technical fields __SNAPSHOT__ and __BATCH__', () => {
    const json = JSON.stringify({ NAME: 'Item A', __SNAPSHOT__: 'true', __BATCH__: '1' })
    const parts = getAuditValueParts(json)
    expect(parts).toEqual([
      { key: 'NAME', value: 'Item A' }
    ])
  })

  it('formats audit display cells for Rollback ActionType (R)', () => {
    const entry = {
      AuditId: 'A1',
      TableName: 'ZTST_HEADER',
      RecordKey: 'KEY1',
      FieldName: '',
      ActionType: 'R',
      OldValue: JSON.stringify({ NAME: 'Old Name' }),
      NewValue: JSON.stringify({ NAME: 'Restored Name' })
    }
    const display = getAuditDisplayCells(entry)
    expect(display.oldValue).toBe('NAME: Old Name')
    expect(display.newValue).toBe('NAME: Restored Name')
  })
})
