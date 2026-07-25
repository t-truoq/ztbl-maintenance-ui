import { describe, expect, it, vi } from 'vitest'
import {
  filterDiffForCommit,
  isExcelConfirmFailure,
  isExcelFilenameAllowed,
  normalizeExcelConfirmResult,
  normalizeExcelDiffRows,
  normalizeExcelFileName,
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
  it('allows browser download suffixes for active table Excel files', () => {
    expect(isExcelFilenameAllowed('Z251_SCHEDULE.xlsx', 'Z251_SCHEDULE')).toBe(true)
    expect(isExcelFilenameAllowed('Z251_SCHEDULE (1).xlsx', 'Z251_SCHEDULE')).toBe(true)
    expect(isExcelFilenameAllowed('Z251_SCHEDULE (12).xlsx', 'Z251_SCHEDULE')).toBe(true)
    expect(isExcelFilenameAllowed(' z251_schedule (2).XLSX ', 'Z251_SCHEDULE')).toBe(true)
  })

  it('allows exported template workbooks for the active table', () => {
    expect(isExcelFilenameAllowed('Z251_SCHEDULE_TEMPLATE.xlsx', 'Z251_SCHEDULE')).toBe(true)
    expect(isExcelFilenameAllowed('Z251_SCHEDULE_TEMPLATE (1).xlsx', 'Z251_SCHEDULE')).toBe(true)
    expect(normalizeExcelFileName('Z251_SCHEDULE_TEMPLATE (12).xlsx')).toBe('Z251_SCHEDULE')
  })

  it('rejects Excel filenames that do not match the active table', () => {
    expect(isExcelFilenameAllowed('Z253_CAT.xlsx', 'Z251_SCHEDULE')).toBe(false)
    expect(isExcelFilenameAllowed('Z253_CAT_TEMPLATE.xlsx', 'Z251_SCHEDULE')).toBe(false)
    expect(isExcelFilenameAllowed('Z251_SCHEDULE (copy).xlsx', 'Z251_SCHEDULE')).toBe(false)
    expect(isExcelFilenameAllowed('Z251_SCHEDULE.xls', 'Z251_SCHEDULE')).toBe(false)
    expect(normalizeExcelFileName('Z251_SCHEDULE (12).xlsx')).toBe('Z251_SCHEDULE')
  })

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

  it('commits only changed, new, or deleted rows from the active table', () => {
    const rows = [
      diffRow({ status: 'CHANGED', table_name: 'Z251_SCHEDULE' }),
      diffRow({ status: 'NEW', table_name: 'Z251_SCHEDULE', record_key: '2' }),
      diffRow({ status: 'DELETE', table_name: 'Z251_SCHEDULE', record_key: '3' }),
      diffRow({ status: 'DELETED', table_name: 'Z251_SCHEDULE', record_key: '4' }),
      diffRow({ status: 'UNCHANGED', table_name: 'Z251_SCHEDULE', record_key: '5' }),
      diffRow({ status: 'WARNING', table_name: 'Z251_SCHEDULE', record_key: 'warning' }),
      diffRow({ status: 'ERROR', table_name: 'Z251_SCHEDULE', record_key: '6' }),
      diffRow({ status: 'CHANGED', table_name: 'Z253_CAT', record_key: '7' })
    ]

    expect(filterDiffForCommit(rows, 'Z251_SCHEDULE').map(row => row.record_key)).toEqual(['1', '2', '3', '4'])
  })

  it('preserves backend domain validation errors', () => {
    const rows = normalizeExcelDiffRows([
      diffRow({
        status: 'ERROR',
        field_name: '-',
        old_value: '-',
        new_value: '-',
        message: "Field COMPANY_CODE value 'ZFS5' is not allowed by domain BUKRS."
      })
    ], 'Z251_SCHEDULE')

    expect(rows[0].status).toBe('ERROR')
    expect(filterDiffForCommit(rows, 'Z251_SCHEDULE')).toEqual([])
  })

  it('translates common Vietnamese backend messages to English', () => {
    expect(translateExcelMessage('Kh\u00f4ng thay \u0111\u1ed5i')).toBe('No changes')
    expect(translateExcelMessage('Gi\u00e1 tr\u1ecb thay \u0111\u1ed5i')).toBe('Value changed')
    expect(translateExcelMessage('User DEV-213 kh\u00f4ng c\u00f3 quy\u1ec1n UPLOAD tr\u00ean ZTPC_HEADER')).toBe(
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
      message: 'Row 8: Request submitted for approval (ID: 8B95F36A4F271FE19EC0D1524746A2C5); \u0110\u00e3 g\u1eedi duy\u1ec7t: C=0, U=1, E=0. Ch\u1edd Approve tr\u00ean UI.'
    })

    expect(result.message).toBe(
      'Row 8: Approval request submitted (ID: 8B95F36A4F271FE19EC0D1524746A2C5). Submitted for approval: created 0, updated 1, errors 0. Waiting for approval in the UI.'
    )
  })

  it('marks no-valid-row confirm results as failures and translates skipped approval locks', () => {
    const result = normalizeExcelConfirmResult({
      id: 'X',
      inserted_count: 0,
      updated_count: 0,
      unchanged_count: 0,
      skipped_count: 2,
      error_count: 0,
      message: 'Row 9 skipped: Record \u0111ang ch\u1edd duy\u1ec7t b\u1edfi DEV-253. Kh\u00f4ng th\u1ec3 t\u1ea1o request m\u1edbi.; Row 10 skipped: Record \u0111ang ch\u1edd duy\u1ec7t b\u1edfi DEV-253. Kh\u00f4ng th\u1ec3 t\u1ea1o request m\u1edbi.; No valid Excel row to submit for approval.; \u0110\u00e3 g\u1eedi duy\u1ec7t: C=0, U/D=0, E=0. Ch\u1edd Approve tr\u00ean UI.'
    })

    expect(result.message).toBe(
      'Row 9 skipped: Record is pending approval by DEV-253. Cannot create a new request.; Row 10 skipped: Record is pending approval by DEV-253. Cannot create a new request.; No valid Excel row to submit for approval.; Submitted for approval: created 0, updated/deleted 0, errors 0. Waiting for approval in the UI.'
    )
    expect(isExcelConfirmFailure(result)).toBe(true)
  })
})
