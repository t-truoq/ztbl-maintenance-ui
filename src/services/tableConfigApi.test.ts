import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet, mockPostWithCsrf } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPostWithCsrf: vi.fn()
}))

vi.mock('./apiClient', () => ({
  SAP_CLIENT: '324',
  api: {
    get: mockGet
  },
  apiPostWithCsrf: mockPostWithCsrf,
  getFriendlyErrorMessage: (error: any) => error?.message || 'Unknown error'
}))

vi.mock('./domainCache', () => ({
  getCachedDomainValues: () => null,
  setCachedDomainValues: vi.fn()
}))

vi.mock('./fkValueCache', () => ({
  getCachedFkValues: () => null,
  setCachedFkValues: vi.fn()
}))

import {
  bulkDeleteRecords,
  bulkUpdateRecords,
  createRecord,
  bulkCreateRecords,
  deleteRecord,
  formatActionErrorMessage,
  getActionMessage,
  getPendingApprovalRecords,
  getTables,
  isPendingApprovalStatus,
  isFKReferenceError,
  isOptimisticLockError,
  loadTableContext,
  normalizeConfigUuid,
  parseBulkActionResults,
  parseFKErrorMessage,
  parseTableDataJson,
  sanitizeApprovalLockMessage,
  updateRecord
} from './tableConfigApi'

describe('tableConfigApi helpers', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPostWithCsrf.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('normalizes compact config UUIDs to OData key format', () => {
    expect(normalizeConfigUuid('8B95F36A4F271FD195A3D745D07762DD')).toBe(
      '8B95F36A-4F27-1FD1-95A3-D745D07762DD'
    )
    expect(normalizeConfigUuid('8B95F36A-4F27-1FD1-95A3-D745D07762DD')).toBe(
      '8B95F36A-4F27-1FD1-95A3-D745D07762DD'
    )
  })

  it('parses table data JSON and fixes unquoted ABAP timestamps', () => {
    const rows = parseTableDataJson('[{"ID":"1","CHANGED_AT":20260723155930.934}]')

    expect(rows).toEqual([{ ID: '1', CHANGED_AT: '20260723155930.934' }])
  })

  it('returns action messages from common response wrappers', () => {
    expect(getActionMessage({ message: 'Saved' })).toBe('Saved')
    expect(getActionMessage({ value: { message: 'Saved from value' } })).toBe('Saved from value')
    expect(getActionMessage({ data: { value: { message: 'Saved from data value' } } })).toBe('Saved from data value')
  })

  it('parses bulk action results safely', () => {
    expect(parseBulkActionResults({
      results_json: JSON.stringify([
        { record_index: 1, success: 'X', message: 'OK' },
        { record_index: 2, success: false, message: 'Failed' }
      ])
    })).toEqual([
      { record_index: 1, success: true, message: 'OK' },
      { record_index: 2, success: false, message: 'Failed' }
    ])
    expect(parseBulkActionResults({ results_json: 'not json' })).toEqual([])
  })

  it('detects optimistic-lock and FK reference errors', () => {
    expect(isOptimisticLockError('Optimistic lock failed')).toBe(true)
    expect(isFKReferenceError('Record is referenced by table ZCHILD')).toBe(true)
    expect(parseFKErrorMessage('Record is referenced by table ZCHILD')).toBe(
      'This record is referenced by table ZCHILD. Please delete the related records first.'
    )
  })

  it('enhances JSON format action errors', () => {
    expect(formatActionErrorMessage('Invalid format in JSON for field CHANGED_AT')).toContain('YYYYMMDD')
  })
})

describe('tableConfigApi table loading', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPostWithCsrf.mockReset()
  })

  it('loads only active table config rows and de-duplicates by normalized UUID', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        value: [
          { TableName: 'Z251_SCHEDULE', ConfigUuid: '8B95F36A4F271FD195A3D745D07762DD', ActiveFlag: 'X', IsActiveEntity: true },
          { TableName: 'Z251_DUP', ConfigUuid: '8B95F36A-4F27-1FD1-95A3-D745D07762DD', ActiveFlag: 'X', IsActiveEntity: true },
          { TableName: 'Z_INACTIVE', ConfigUuid: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', ActiveFlag: '', IsActiveEntity: true },
          { TableName: 'Z_DRAFT', ConfigUuid: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB', ActiveFlag: 'X', IsActiveEntity: false }
        ]
      }
    })

    await expect(getTables()).resolves.toEqual([
      {
        TableName: 'Z251_DUP',
        ConfigUuid: '8B95F36A-4F27-1FD1-95A3-D745D07762DD',
        ActiveFlag: 'X',
        IsActiveEntity: true
      }
    ])
  })

  it('loads only minimal pending approval fields for a table', async () => {
    mockGet.mockResolvedValueOnce({
      data: {
        value: [{
          AprvlId: 'PRIVATE-ID',
          TableName: 'Z253_CAT',
          RecordKey: '{"CATEGORY_ID":"PC09"}',
          Status: 'PENDING',
          ActionType: 'U',
          SubmittedBy: 'DEV-253',
          OldData: '{"STATUS":"A"}',
          NewData: '{"STATUS":"I"}'
        }]
      }
    })

    await expect(getPendingApprovalRecords('Z253_CAT')).resolves.toEqual([{
      TableName: 'Z253_CAT',
      RecordKey: '{"CATEGORY_ID":"PC09"}',
      Status: 'PENDING',
      ActionType: 'U'
    }])

    expect(mockGet).toHaveBeenCalledWith('/ApprovalItem', expect.objectContaining({
      params: expect.objectContaining({
        '$filter': "TableName eq 'Z253_CAT' and Status eq 'PENDING'",
        '$select': 'TableName,RecordKey,Status,ActionType'
      })
    }))
  })

  it('recognizes active approval statuses without assuming one backend code', () => {
    expect(isPendingApprovalStatus('PENDING')).toBe(true)
    expect(isPendingApprovalStatus('WAITING')).toBe(true)
    expect(isPendingApprovalStatus('SUBMITTED')).toBe(true)
    expect(isPendingApprovalStatus('APPROVED')).toBe(false)
    expect(isPendingApprovalStatus('REJECTED')).toBe(false)
  })

  it('removes the submitting account from approval lock messages', () => {
    expect(sanitizeApprovalLockMessage(
      'Skipped row 000001: Record đang chờ duyệt bởi DEV-213. Không thể tạo request mới.'
    )).toBe(
      'Skipped row 000001: Record is waiting for ADMIN approval. Cannot create a new request.'
    )
  })

  it('loads table context with metadata and parsed rows', async () => {
    mockPostWithCsrf
      .mockResolvedValueOnce({
        data: {
          meta_json: JSON.stringify([
            { field_name: 'COURSE_ID', fe_type: 'text', is_key: true, display_order: 1 },
            { field_name: 'VALID_FROM', fe_type: 'date', display_order: 2 }
          ])
        }
      })
      .mockResolvedValueOnce({
        data: {
          data_json: JSON.stringify([{ COURSE_ID: 'C001', VALID_FROM: '20260521' }])
        }
      })
    mockGet.mockResolvedValueOnce({ data: { value: [] } })

    const result = await loadTableContext('8B95F36A4F271FD195A3D745D07762DD', 'Z251_SCHEDULE')

    expect(result.fieldMeta.map(f => f.field_name)).toEqual(['COURSE_ID', 'VALID_FROM'])
    expect(result.rows).toEqual([{ COURSE_ID: 'C001', VALID_FROM: '2026-05-21' }])
  })

  it('merges FieldConfig with boolean ReadonlyFlag into table metadata correctly', async () => {
    mockPostWithCsrf
      .mockResolvedValueOnce({
        data: {
          meta_json: JSON.stringify([
            { FIELD_NAME: 'EMP_ID', FE_TYPE: 'text', IS_KEY: true, IS_MANDATORY: true, DISPLAY_ORDER: 2 },
            { FIELD_NAME: 'FULL_NAME', FE_TYPE: 'text', IS_KEY: false, IS_MANDATORY: false, DISPLAY_ORDER: 3 },
            { FIELD_NAME: 'ROLE', FE_TYPE: 'text', IS_KEY: false, IS_MANDATORY: false, DISPLAY_ORDER: 4 }
          ])
        }
      })
      .mockResolvedValueOnce({
        data: { data_json: '[]' }
      })
    mockGet.mockResolvedValueOnce({
      data: {
        value: [
          { TableName: 'YSAP21_EMPLOYEE', FieldName: 'EMP_ID', IsKeyField: true, MandatoryFlag: true, ReadonlyFlag: false, HiddenFlag: false, DisplayOrder: 2 },
          { TableName: 'YSAP21_EMPLOYEE', FieldName: 'FULL_NAME', IsKeyField: false, MandatoryFlag: false, ReadonlyFlag: true, HiddenFlag: true, DisplayOrder: 3 },
          { TableName: 'YSAP21_EMPLOYEE', FieldName: 'ROLE', IsKeyField: false, MandatoryFlag: false, ReadonlyFlag: true, HiddenFlag: false, DisplayOrder: 4 }
        ]
      }
    })

    const result = await loadTableContext('8B95F36A4F271FD195A3D745D07762DD', 'YSAP21_EMPLOYEE')
    const roleField = result.fieldMeta.find(f => f.field_name === 'ROLE')
    const fullNameField = result.fieldMeta.find(f => f.field_name === 'FULL_NAME')

    expect(roleField?.is_readonly).toBe(true)
    expect(roleField?.ReadonlyFlag).toBe('X')
    expect(fullNameField?.is_hidden).toBe(true)
    expect(fullNameField?.HiddenFlag).toBe('X')
  })
})

describe('tableConfigApi CRUD payloads', () => {
  beforeEach(() => {
    mockPostWithCsrf.mockReset()
  })

  it('creates records with client-safe record_data JSON', async () => {
    mockPostWithCsrf.mockResolvedValueOnce({ data: { success: true, message: 'Created' } })

    await createRecord('8B95F36A4F271FD195A3D745D07762DD', 'Z251_SCHEDULE', {
      MANDT: '324',
      COURSE_ID: 'C001',
      NAME: 'Course'
    })

    const [, body] = mockPostWithCsrf.mock.calls[0]
    expect(body).toMatchObject({
      table_name: 'Z251_SCHEDULE',
      record_key: '',
      records_data: ''
    })
    expect(JSON.parse(body.record_data)).toEqual({ COURSE_ID: 'C001', NAME: 'Course' })
  })

  it('bulk creates records with client-safe records_data JSON', async () => {
    mockPostWithCsrf.mockResolvedValueOnce({ data: { success: true, message: 'Bulk Created' } })

    await bulkCreateRecords('8B95F36A4F271FD195A3D745D07762DD', 'Z251_SCHEDULE', [
      { MANDT: '324', COURSE_ID: 'C001', NAME: 'Course 1' },
      { CLIENT: '324', COURSE_ID: 'C002', NAME: 'Course 2' }
    ])

    const [, body] = mockPostWithCsrf.mock.calls[0]
    expect(body).toMatchObject({
      table_name: 'Z251_SCHEDULE',
      record_key: '',
      record_data: ''
    })
    expect(JSON.parse(body.records_data)).toEqual([
      { COURSE_ID: 'C001', NAME: 'Course 1' },
      { COURSE_ID: 'C002', NAME: 'Course 2' }
    ])
  })

  it('updates records with key, record data, and formatted ETag value', async () => {
    mockPostWithCsrf.mockResolvedValueOnce({ data: { success: true } })

    await updateRecord(
      '8B95F36A4F271FD195A3D745D07762DD',
      'Z251_SCHEDULE',
      { MANDT: '324', COURSE_ID: 'C001' },
      { CLIENT: '324', COURSE_ID: 'C001', NAME: 'Changed' },
      'CHANGED_AT',
      '2026-05-21T14:09:48.929Z'
    )

    const [, body] = mockPostWithCsrf.mock.calls[0]
    expect(JSON.parse(body.record_key)).toEqual({ COURSE_ID: 'C001' })
    expect(JSON.parse(body.record_data)).toEqual({ COURSE_ID: 'C001', NAME: 'Changed' })
    expect(body.etag_field).toBe('CHANGED_AT')
    expect(body.etag_value).toBe('2026-05-21 14:09:48.9290000')
  })

  it('deletes records with a client-safe key payload', async () => {
    mockPostWithCsrf.mockResolvedValueOnce({ data: { success: true } })

    await deleteRecord('8B95F36A4F271FD195A3D745D07762DD', 'Z251_SCHEDULE', {
      CLIENT: '324',
      COURSE_ID: 'C001'
    })

    const [, body] = mockPostWithCsrf.mock.calls[0]
    expect(JSON.parse(body.record_key)).toEqual({ COURSE_ID: 'C001' })
    expect(body.record_data).toBe('')
  })

  it('strips client fields from bulk update and delete records', async () => {
    mockPostWithCsrf
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({ data: { success: true } })

    await bulkUpdateRecords('UUID', 'Z251_SCHEDULE', [
      { MANDT: '324', COURSE_ID: 'C001', NAME: 'Changed' }
    ])
    await bulkDeleteRecords('UUID', 'Z251_SCHEDULE', [
      { CLIENT: '324', COURSE_ID: 'C001' }
    ])

    expect(JSON.parse(mockPostWithCsrf.mock.calls[0][1].records_data)).toEqual([
      { COURSE_ID: 'C001', NAME: 'Changed' }
    ])
    expect(JSON.parse(mockPostWithCsrf.mock.calls[1][1].records_data)).toEqual([
      { COURSE_ID: 'C001' }
    ])
  })
})
