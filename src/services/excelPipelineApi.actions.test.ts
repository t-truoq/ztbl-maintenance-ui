import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGet, mockPost, mockIsCsrfError } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  mockIsCsrfError: vi.fn()
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: mockGet,
      post: mockPost,
      defaults: { headers: { common: {} } }
    }))
  }
}))

vi.mock('./apiClient', () => ({
  SAP_CLIENT: '324',
  getCredentials: () => ({ token: 'TOKEN' }),
  getFriendlyErrorMessage: (error: any) => error?.message || 'Unknown error',
  isCsrfError: mockIsCsrfError
}))

import {
  confirmImport,
  downloadExcel,
  getExcelErrorMessage,
  getInfoRows,
  uploadExcel
} from './excelPipelineApi'

function diffRow(overrides: Record<string, any>) {
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

describe('excelPipelineApi action requests', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPost.mockReset()
    mockIsCsrfError.mockReset()
    mockIsCsrfError.mockReturnValue(false)
    mockGet.mockResolvedValue({ headers: { 'x-csrf-token': 'csrf-1' } })
    vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  })

  it('downloads an Excel template with the active table name', async () => {
    mockPost.mockResolvedValueOnce({
      status: 200,
      data: {
        id: 'X',
        file_base64: 'BASE64',
        message: 'Downloaded'
      }
    })

    await expect(downloadExcel('Z251_SCHEDULE', true)).resolves.toEqual({
      id: 'X',
      file_base64: 'BASE64',
      message: 'Downloaded'
    })

    expect(mockPost.mock.calls[0][1]).toEqual({
      id: 'X',
      table_name: 'Z251_SCHEDULE',
      template_only: true
    })
  })

  it('uploads an Excel workbook and normalizes returned diff rows', async () => {
    mockPost.mockResolvedValueOnce({
      status: 200,
      data: {
        value: [
          diffRow({ status: ' new ', table_name: '' }),
          diffRow({ status: 'CHANGED', table_name: 'Z999_OTHER', record_key: 'other' })
        ]
      }
    })

    await expect(uploadExcel('Z251_SCHEDULE', 'BASE64')).resolves.toEqual([
      diffRow({ status: 'NEW', table_name: 'Z251_SCHEDULE' })
    ])

    expect(mockPost.mock.calls[0][1]).toEqual({
      id: 'X',
      table_name: 'Z251_SCHEDULE',
      file_base64: 'BASE64'
    })
  })

  it('confirms only commit-eligible rows for the active table', async () => {
    mockPost.mockResolvedValueOnce({
      status: 200,
      data: {
        id: 'X',
        inserted_count: 1,
        updated_count: 1,
        unchanged_count: 0,
        skipped_count: 0,
        error_count: 0,
        message: 'Done'
      }
    })

    await confirmImport('Z251_SCHEDULE', [
      diffRow({ id: 'local-1', status: 'NEW', record_key: '1' }),
      diffRow({ id: 'local-2', status: 'CHANGED', record_key: '2' }),
      diffRow({ id: 'local-3', status: 'ERROR', record_key: '3' }),
      diffRow({ id: 'local-4', status: 'UNCHANGED', record_key: '4' }),
      diffRow({ id: 'local-5', status: 'DELETE', table_name: 'Z999_OTHER', record_key: '5' })
    ])

    const payload = JSON.parse(mockPost.mock.calls[0][1].diff_json)
    expect(payload).toEqual([
      diffRow({ status: 'NEW', table_name: 'Z251_SCHEDULE', record_key: '1' }),
      diffRow({ status: 'CHANGED', table_name: 'Z251_SCHEDULE', record_key: '2' })
    ])
    expect(payload[0]).not.toHaveProperty('id')
  })

  it('normalizes approval-required confirm messages', async () => {
    mockPost.mockResolvedValueOnce({
      status: 200,
      data: {
        id: 'X',
        inserted_count: 0,
        updated_count: 1,
        unchanged_count: 0,
        skipped_count: 0,
        error_count: 0,
        message: 'Row 8: Request submitted for approval (ID: 8B95F36A4F271FE19EC0D1524746A2C5); \u0110\u00e3 g\u1eedi duy\u1ec7t: C=0, U=1, E=0. Ch\u1edd Approve tr\u00ean UI.'
      }
    })

    const result = await confirmImport('Z251_SCHEDULE', [diffRow({ status: 'CHANGED' })])

    expect(result.message).toContain('Approval request submitted')
    expect(result.message).toContain('Waiting for approval in the UI.')
  })

  it('retries an action after a CSRF failure', async () => {
    mockIsCsrfError
      .mockReturnValueOnce(true)
      .mockReturnValue(false)
    mockPost
      .mockRejectedValueOnce({ response: { status: 403, data: { message: 'CSRF token missing' } } })
      .mockResolvedValueOnce({
        status: 200,
        data: { id: 'X', file_base64: 'BASE64', message: 'Downloaded after retry' }
      })
    mockGet.mockResolvedValueOnce({ headers: { 'x-csrf-token': 'csrf-retry' } })

    await expect(downloadExcel('Z251_SCHEDULE', false)).resolves.toMatchObject({
      message: 'Downloaded after retry'
    })

    expect(mockPost).toHaveBeenCalledTimes(2)
    expect(mockPost.mock.calls[1][2].headers['X-CSRF-Token']).toBe('csrf-retry')
  })
})

describe('excelPipelineApi helper behavior', () => {
  it('extracts info rows from parse summaries', () => {
    expect(getInfoRows([
      diffRow({ row_no: 0, status: 'INFO', message: 'Summary' }),
      diffRow({ row_no: 1, status: 'CHANGED' })
    ])).toEqual([
      diffRow({ row_no: 0, status: 'INFO', message: 'Summary' })
    ])
  })

  it('returns a permission message for non-CSRF 403 Excel errors', () => {
    mockIsCsrfError.mockReturnValue(false)

    expect(getExcelErrorMessage({ response: { status: 403, data: {} } })).toContain(
      'You do not have permission to perform this Excel action'
    )
  })

  it('reads SAP Excel errors from nested message shapes', () => {
    expect(getExcelErrorMessage({
      response: {
        data: {
          error: {
            message: { value: 'Invalid workbook' }
          }
        }
      }
    })).toBe('Invalid workbook')
  })
})
