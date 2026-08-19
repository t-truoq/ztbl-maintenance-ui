import { describe, it, expect } from 'vitest'
import { getAuditDisplayCells } from './auditFormatters'
import {
  extractBulkCount,
  getAuditDetailFieldSummary,
  getAuditActionLabel,
  getAuditItemDisplayActionType,
  getAuditOperationLabel,
  findBulkChildren,
  getBulkActionType,
  getRecordKey,
  hasAuditItemSummary,
  isBulkAuditEntry,
  isRollbackAuditAction,
  canRollbackAuditEntry,
  normalizeAuditActionType,
  normalizeAuditLogEntries,
  paginateAuditEntries
} from './auditLogHelpers'

describe('auditLogHelpers bulk flow', () => {
  const bulkEntry = {
    AuditId: 'BULK-AUDIT-1234567890',
    TableName: 'Z253_CAT',
    RecordKey: 'BULK',
    FieldName: '',
    ActionType: 'B',
    NewValue: 'Bulk audit: 2 item(s)',
    ChangedBy: 'DEV-213',
    ChangedAt: '2026-07-23T01:04:14'
  }

  it('detects bulk entries and extracts count from summary text', () => {
    expect(isBulkAuditEntry(bulkEntry)).toBe(true)
    expect(hasAuditItemSummary(bulkEntry)).toBe(true)
    expect(extractBulkCount(bulkEntry)).toBe('2 item(s)')
  })

  it('groups flattened AuditLog rows with the same AuditId into one Fiori operation', () => {
    const result = normalizeAuditLogEntries([
      { AuditId: 'A-1', TableName: 'ZTEST', RecordKey: '001', FieldName: 'STATUS', ActionType: 'U', OldValue: 'A', NewValue: 'B' },
      { AuditId: 'A-1', TableName: 'ZTEST', RecordKey: '002', FieldName: 'STATUS', ActionType: 'D', OldValue: 'A', NewValue: '' }
    ])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ AuditId: 'A-1', RecordKey: 'BULK', ActionType: 'B' })
    expect(result[0]._Items).toHaveLength(2)
    expect(result[0]._Items[0]).toMatchObject({ RecordKey: '001', ActionType: 'U' })
    expect(result[0]._Items[1]).toMatchObject({ RecordKey: '002', ActionType: 'D' })
  })

  it('keeps the original audit and the new rollback audit as separate records', () => {
    const result = normalizeAuditLogEntries([
      { AuditId: 'ORIGINAL-1', TableName: 'ZTEST', RecordKey: '001', FieldName: 'STATUS', ActionType: 'D', RollbackAuditId: 'ROLLBACK-1' },
      { AuditId: 'ROLLBACK-1', TableName: 'ZTEST', RecordKey: '001', FieldName: 'STATUS', ActionType: 'R' }
    ])

    expect(result).toHaveLength(2)
    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({ AuditId: 'ORIGINAL-1', ActionType: 'D', RollbackAuditId: 'ROLLBACK-1' }),
      expect.objectContaining({ AuditId: 'ROLLBACK-1', ActionType: 'R' })
    ]))
  })

  it('detects rollback summaries with item counts without requiring BULK record key', () => {
    const rollbackEntry = {
      AuditId: 'ROLLBACK-AUDIT-1234567890',
      TableName: 'Z253_CAT',
      RecordKey: JSON.stringify({ CATEGORY_ID: 'C004' }),
      FieldName: '',
      ActionType: 'R',
      NewValue: 'Bulk audit: 000001 item(s)',
      ChangedBy: 'DEV-253',
      ChangedAt: '2026-07-23T16:05:51'
    }

    expect(isBulkAuditEntry(rollbackEntry)).toBe(false)
    expect(hasAuditItemSummary(rollbackEntry)).toBe(true)
    expect(extractBulkCount(rollbackEntry)).toBe('1 item(s)')
  })

  it('returns bulk child entries from _Items property', () => {
    const entryWithItems = {
      ...bulkEntry,
      _Items: [
        {
          AuditId: 'BULK-AUDIT-1234567890',
          ItemNo: 1,
          TableName: 'Z253_CAT',
          RecordKey: JSON.stringify({ MANDT: '324', CATEGORY_ID: 'C004' }),
          FieldName: '',
          ActionType: 'C',
          NewValue: JSON.stringify({ CATEGORY_ID: 'C004' })
        }
      ]
    }

    const children = findBulkChildren(entryWithItems, [entryWithItems])

    expect(children).toHaveLength(1)
    expect(children[0]).toMatchObject({
      ItemNo: 1,
      RecordKey: JSON.stringify({ MANDT: '324', CATEGORY_ID: 'C004' }),
      ActionType: 'C'
    })
    expect(getRecordKey(children[0])).toBe('CATEGORY_ID: C004')
    expect(getBulkActionType(entryWithItems, children)).toBe('C')
  })

  it('uses the actual badge for homogeneous items and bulk for mixed actions', () => {
    expect(getBulkActionType(bulkEntry, [
      { ActionType: 'U' }
    ])).toBe('U')
    expect(getBulkActionType(bulkEntry, [
      { ActionType: 'C' },
      { ActionType: 'C' }
    ])).toBe('B')
    expect(getBulkActionType(bulkEntry, [
      { ActionType: 'C' },
      { ActionType: 'U' }
    ])).toBe('B')
    expect(getBulkActionType(bulkEntry, [
      { ActionType: 'D' },
      { ActionType: 'D' },
      { ActionType: 'D' }
    ])).toBe('B')
  })

  it('shows the actual action type for each rollback child item', () => {
    const rollbackEntry = {
      ...bulkEntry,
      ActionType: 'R'
    }

    expect(getAuditItemDisplayActionType(rollbackEntry, { ActionType: 'C' })).toBe('C')
    expect(getAuditItemDisplayActionType(rollbackEntry, { ActionType: 'D' })).toBe('D')
    expect(getAuditItemDisplayActionType(bulkEntry, { ActionType: 'D' })).toBe('D')
  })

  it('preserves the child action exactly as returned by the backend', () => {
    const rollbackEntry = {
      ...bulkEntry,
      AuditId: 'ROLLBACK-2',
      ActionType: 'R'
    }
    const sourceEntry = {
      ...bulkEntry,
      AuditId: 'SOURCE-1',
      RollbackAuditId: 'ROLLBACK-2',
      _Items: [
        { ItemNo: 1, RecordKey: '{"CATEGORY_ID":"5"}', ActionType: 'D' },
        { ItemNo: 2, RecordKey: '{"CATEGORY_ID":"3"}', ActionType: 'C' }
      ]
    }

    expect(getAuditItemDisplayActionType(
      rollbackEntry,
      { ItemNo: 1, RecordKey: '{"CATEGORY_ID":"5"}', ActionType: 'R' },
      [rollbackEntry, sourceEntry]
    )).toBe('R')
    expect(getAuditItemDisplayActionType(
      rollbackEntry,
      { ItemNo: 2, RecordKey: '{"CATEGORY_ID":"3"}', ActionType: 'R' },
      [rollbackEntry, sourceEntry]
    )).toBe('R')
    expect(getAuditItemDisplayActionType(
      rollbackEntry,
      { ItemNo: 2, RecordKey: '{"CATEGORY_ID":"3"}', ActionType: 'D' },
      [rollbackEntry, sourceEntry]
    )).toBe('D')
  })

  it('keeps record-key columns visible without counting them as changed fields', () => {
    expect(getAuditDetailFieldSummary(
      ['ENTITY_ID'],
      ['ENTITY_ID', 'NAME', 'STATUS', 'NAME', 'entity_id']
    )).toEqual({
      detailFields: ['ENTITY_ID', 'NAME', 'STATUS'],
      changedFieldCount: 2
    })
  })

  it('excludes every composite record-key field from the changed field count', () => {
    expect(getAuditDetailFieldSummary(
      ['COMPANY_CODE', 'DOCUMENT_ID'],
      ['company_code', 'DOCUMENT_ID', 'NAME']
    )).toEqual({
      detailFields: ['COMPANY_CODE', 'DOCUMENT_ID', 'NAME'],
      changedFieldCount: 1
    })
  })

  it('keeps the executed actions for the four-item rollback audit fixture', () => {
    const rollbackEntry = {
      ...bulkEntry,
      AuditId: '8B95F36A4F271FE1A68CFB88621AF3A2',
      ActionType: 'R'
    }
    const items = [
      { RecordKey: '{"ENTITY_ID":"8B95F36A4F271FE1A68CDA02FFFB7078"}', OldValue: '{"NAME":"data2","STATUS":"F"}', NewValue: '', ActionType: 'D' },
      { RecordKey: '{"ENTITY_ID":"8B95F36A4F271FE1A68CDA02FFFB5078"}', OldValue: '{"NAME":"AA","STATUS":"D"}', NewValue: '', ActionType: 'D' },
      { RecordKey: '{"ENTITY_ID":"8B95F36A4F271FD1A68B31325C8A0358"}', OldValue: '', NewValue: '{"NAME":"TEST","STATUS":"A"}', ActionType: 'C' },
      { RecordKey: '{"ENTITY_ID":"8B95F36A4F271FD1A4EA6B7DED31FF97"}', OldValue: '{"NAME":"data"}', NewValue: '{"NAME":"a"}', ActionType: 'U' }
    ]
    const actions = items.map(item => getAuditItemDisplayActionType(rollbackEntry, item))
    const displays = items.map((item, index) => getAuditDisplayCells(item, actions[index]))

    expect(actions).toEqual([
      'D', 'D', 'C', 'U'
    ])
    expect(displays[0]).toMatchObject({ oldValue: 'NAME: data2 | STATUS: F', newValue: '' })
    expect(displays[1]).toMatchObject({ oldValue: 'NAME: AA | STATUS: D', newValue: '' })
    expect(displays[2]).toMatchObject({ oldValue: '', newValue: 'NAME: TEST | STATUS: A' })
    expect(displays[3]).toMatchObject({ oldValue: 'NAME: data', newValue: 'NAME: a' })
  })

  it('normalizes rollback action values returned by the backend', () => {
    const rollbackEntry = {
      ...bulkEntry,
      RecordKey: 'ENTITY_ID: 1',
      ActionType: 'ROLLBACK'
    }

    expect(normalizeAuditActionType('rollback')).toBe('R')
    expect(isRollbackAuditAction('ROLLBACK')).toBe(true)
    expect(hasAuditItemSummary(rollbackEntry)).toBe(true)
    expect(getBulkActionType(rollbackEntry, [{ ActionType: 'C' }, { ActionType: 'D' }])).toBe('R')
    expect(getAuditItemDisplayActionType(rollbackEntry, { ActionType: 'C' })).toBe('C')
  })

  it('uses one operation contract for backend aliases and UI labels', () => {
    expect([
      normalizeAuditActionType('01'),
      normalizeAuditActionType('updated'),
      normalizeAuditActionType('DELETE'),
      normalizeAuditActionType('R BULK'),
      normalizeAuditActionType('Bulk CRUD Operation')
    ]).toEqual(['C', 'U', 'D', 'R', 'B'])
    expect(['C', 'U', 'D', 'R', 'B'].map(getAuditOperationLabel)).toEqual([
      'Create', 'Update', 'Delete', 'Rollback', 'Bulk'
    ])
    expect(['C', 'U', 'D', 'R', 'B'].map(getAuditActionLabel)).toEqual([
      'Created', 'Updated', 'Deleted', 'Rolled back', 'Bulk'
    ])
  })

  it('only allows rollback when the operation control explicitly enables it', () => {
    expect(canRollbackAuditEntry({ _OperationControl: { rollback: true } })).toBe(true)
    expect(canRollbackAuditEntry({ _OperationControl: { rollback: 'true' } })).toBe(true)
    expect(canRollbackAuditEntry({ _OperationControl: { rollback: false } })).toBe(false)
  })

  it('does not allow an audit entry with RollbackAuditId to be rolled back again', () => {
    expect(canRollbackAuditEntry({
      RollbackAuditId: '8B95F36A4F271FD1A29827CC29B3AE99',
      _OperationControl: { rollback: true }
    })).toBe(false)
  })

  it('hides rollback for the backend payload when rollback is disabled', () => {
    expect(canRollbackAuditEntry({
      AuditId: '8B95F36A4F271A2CBBF0BA607EEF',
      TableName: 'Z253_CAT',
      RecordKey: 'BULK',
      ActionType: 'U',
      RollbackAuditId: '8B95F36A4F271A2CBBF0BA607EEF',
      _OperationControl: { rollback: false }
    })).toBe(false)
  })
})

describe('paginateAuditEntries', () => {
  it('returns a safe page and display range', () => {
    const result = paginateAuditEntries([1, 2, 3, 4, 5], 1, 2)
    expect(result.pageItems).toEqual([3, 4])
    expect(result.totalPages).toBe(3)
    expect(result.safePageIndex).toBe(1)
    expect(result.start).toBe(3)
    expect(result.end).toBe(4)
  })

  it('clamps out-of-range pages and handles empty lists', () => {
    expect(paginateAuditEntries([1, 2], 99, 10)).toMatchObject({
      pageItems: [1, 2],
      totalPages: 1,
      safePageIndex: 0,
      start: 1,
      end: 2
    })
    expect(paginateAuditEntries([], 2, 10)).toMatchObject({
      pageItems: [],
      totalPages: 1,
      safePageIndex: 0,
      start: 0,
      end: 0
    })
  })
})
