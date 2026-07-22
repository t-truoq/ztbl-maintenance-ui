import { describe, it, expect } from 'vitest'
import {
  extractBulkCount,
  findBulkChildren,
  getBulkActionType,
  getRecordKey,
  isBulkAuditEntry,
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
    expect(extractBulkCount(bulkEntry)).toBe('2 item(s)')
  })

  it('matches bulk child entries by audit id prefix/user/time and skips unrelated rows', () => {
    const entries = [
      bulkEntry,
      {
        AuditId: 'BULK-AUDIT-1234567890-A',
        TableName: 'Z253_CAT',
        RecordKey: JSON.stringify({ MANDT: '324', CATEGORY_ID: 'C004' }),
        FieldName: '',
        ActionType: 'C',
        NewValue: JSON.stringify({ CATEGORY_ID: 'C004' }),
        ChangedBy: 'DEV-213',
        ChangedAt: '2026-07-23T01:04:15'
      },
      {
        AuditId: 'OTHER',
        TableName: 'Z253_CAT',
        RecordKey: JSON.stringify({ CATEGORY_ID: 'C005' }),
        FieldName: '',
        ActionType: 'D',
        ChangedBy: 'DEV-999',
        ChangedAt: '2026-07-23T01:04:15'
      }
    ]

    const children = findBulkChildren(bulkEntry, entries)

    expect(children).toHaveLength(1)
    expect(children[0]).toMatchObject({
      ItemNo: 1,
      RecordKey: JSON.stringify({ MANDT: '324', CATEGORY_ID: 'C004' }),
      ActionType: 'C'
    })
    expect(getRecordKey(children[0])).toBe('CATEGORY_ID: C004')
    expect(getBulkActionType(bulkEntry, children)).toBe('C')
  })

  it('uses generic bulk badge when child actions are mixed', () => {
    expect(getBulkActionType(bulkEntry, [
      { ActionType: 'C' },
      { ActionType: 'U' }
    ])).toBe('B')
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
