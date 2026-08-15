import { describe, it, expect } from 'vitest'
import {
  extractBulkCount,
  getAuditItemDisplayActionType,
  findBulkChildren,
  getBulkActionType,
  getRecordKey,
  hasAuditItemSummary,
  isBulkAuditEntry,
  isRollbackAuditAction,
  canRollbackAuditEntry,
  normalizeAuditActionType,
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
    ])).toBe('C')
    expect(getBulkActionType(bulkEntry, [
      { ActionType: 'C' },
      { ActionType: 'U' }
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

  it('restores the original item action when rollback items are returned as R', () => {
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
    )).toBe('D')
    expect(getAuditItemDisplayActionType(
      rollbackEntry,
      { ItemNo: 2, RecordKey: '{"CATEGORY_ID":"3"}', ActionType: 'R' },
      [rollbackEntry, sourceEntry]
    )).toBe('C')
    expect(getAuditItemDisplayActionType(
      rollbackEntry,
      { ItemNo: 2, RecordKey: '{"CATEGORY_ID":"3"}', ActionType: 'D' },
      [rollbackEntry, sourceEntry]
    )).toBe('C')
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
