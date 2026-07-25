import { describe, expect, it } from 'vitest'
import { extractApprovalCode, formatHeaderLabel } from './tableHelpers'

describe('formatHeaderLabel', () => {
  it('uses explicit field labels before technical names', () => {
    expect(formatHeaderLabel({ field_name: 'COURSE_ID', label: 'Course' })).toBe('Course')
    expect(formatHeaderLabel({ FieldName: 'COURSE_ID', LabelText: 'Course ID' })).toBe('Course ID')
  })

  it('formats technical field names when no label exists', () => {
    expect(formatHeaderLabel({ field_name: 'LAST_CHANGED_AT' })).toBe('Last Changed At')
  })

  it('returns an empty label for missing field names', () => {
    expect(formatHeaderLabel({})).toBe('')
  })
})

describe('extractApprovalCode', () => {
  it('extracts approval IDs from direct response properties', () => {
    expect(extractApprovalCode({ approval_request_id: '1000000306' })).toBe('1000000306')
    expect(extractApprovalCode({ ApprovalRequestId: '1000000307' })).toBe('1000000307')
  })

  it('extracts approval IDs from nested value and data wrappers', () => {
    expect(extractApprovalCode({ value: { req_id: '1000000308' } })).toBe('1000000308')
    expect(extractApprovalCode({ data: { approvalCode: '1000000309' } })).toBe('1000000309')
  })

  it('extracts numeric approval IDs from backend messages', () => {
    expect(extractApprovalCode({ message: 'Approval request 1000000310 was submitted.' })).toBe('1000000310')
    expect(extractApprovalCode({ value: { message: 'Request #1000000311 is waiting.' } })).toBe('1000000311')
  })

  it('returns null when no approval code exists', () => {
    expect(extractApprovalCode(null)).toBe(null)
    expect(extractApprovalCode({ message: 'Record saved without approval.' })).toBe(null)
  })
})
