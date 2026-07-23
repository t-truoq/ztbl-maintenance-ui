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

  it('formats ABAP changed-on timestamps in audit values', () => {
    const parts = getAuditValueParts(JSON.stringify({
      LAST_CHANGED_AT: '20260723155930.934',
      LOCAL_LAST_CHANGED_AT: '0',
      LAST_CHANGED_BY: 'DEV-253'
    }))

    const changedAt = parts.find(part => part.key === 'LAST_CHANGED_AT')?.value || ''
    expect(changedAt).toContain('2026')
    expect(changedAt).toContain('07')
    expect(changedAt).toContain('23')
    expect(changedAt).toContain('59:30')
    expect(changedAt).toContain('.934')
    expect(parts.some(part => part.key === 'LOCAL_LAST_CHANGED_AT')).toBe(false)
    expect(parts.find(part => part.key === 'LAST_CHANGED_BY')?.value).toBe('DEV-253')
  })
})
