import { describe, expect, it, vi } from 'vitest'
import {
  filterDiffForCommit,
  normalizeExcelConfirmResult,
  normalizeExcelDiffRows,
  translateExcelMessage,
  type ExcelDiffRow
} from './excelPipelineApi'

vi.mock('./apiClient', () => ({
  SAP_CLIENT: '100',
  getCredentials: () => null,
  getFriendlyErrorMessage: (error: any) => error?.message || 'Unknown error',
  isCsrfError: () => false
}))

function diffRow(overrides: Partial<ExcelDiffRow>): ExcelDiffRow {
  return {
    row_no: 1,
    table_name: 'Z251_SCHEDULE',
    record_key: '1',
    field_name: 'STATUS',
    old_value: 'A',
    new_value: 'B',
    status: 'CHANGED',
    message: '',
    ...overrides
  }
}

describe('excelPipelineApi diff helpers', () => {
  it('keeps only rows for the active table', () => {
    const rows = normalizeExcelDiffRows(
      [
        diffRow({ table_name: 'Z251_SCHEDULE' }),
        diffRow({ table_name: 'Z253_CAT' }),
        diffRow({ table_name: '', record_key: 'blank-table-row' })
      ],
      'Z251_SCHEDULE'
    )

    expect(rows.map(row => row.record_key)).toEqual(['1', 'blank-table-row'])
    expect(rows.every(row => row.table_name === 'Z251_SCHEDULE')).toBe(true)
  })

  it('commits only changed or new rows from the active table', () => {
    const rows = [
      diffRow({ status: 'CHANGED', table_name: 'Z251_SCHEDULE' }),
      diffRow({ status: 'NEW', table_name: 'Z251_SCHEDULE', record_key: '2' }),
      diffRow({ status: 'UNCHANGED', table_name: 'Z251_SCHEDULE', record_key: '3' }),
      diffRow({ status: 'ERROR', table_name: 'Z251_SCHEDULE', record_key: '4' }),
      diffRow({ status: 'CHANGED', table_name: 'Z253_CAT', record_key: '5' })
    ]

    expect(filterDiffForCommit(rows, 'Z251_SCHEDULE').map(row => row.record_key)).toEqual(['1', '2'])
  })

  it('translates common Vietnamese backend messages to English', () => {
    expect(translateExcelMessage('Không thay đổi')).toBe('No changes')
    expect(translateExcelMessage('Giá trị thay đổi')).toBe('Value changed')
    expect(translateExcelMessage('User DEV-213 không có quyền UPLOAD trên ZTPC_HEADER')).toBe(
      'User DEV-213 does not have permission to UPLOAD on ZTPC_HEADER.'
    )
  })

  it('normalizes approval import result messages', () => {
    const result = normalizeExcelConfirmResult({
      id: 'X',
      inserted_count: 0,
      updated_count: 1,
      unchanged_count: 0,
      skipped_count: 0,
      error_count: 0,
      message: 'Row 8: Request submitted for approval (ID: 8B95F36A4F271FE19EC0D1524746A2C5); Đã gửi duyệt: C=0, U=1, E=0. Chờ Approve trên UI.'
    })

    expect(result.message).toBe(
      'Row 8: Approval request submitted (ID: 8B95F36A4F271FE19EC0D1524746A2C5). Submitted for approval: created 0, updated 1, errors 0. Waiting for approval in the UI.'
    )
  })
})
