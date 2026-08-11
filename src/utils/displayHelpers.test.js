import { describe, it, expect } from 'vitest'
import { formatCellValue, formatTimestampValue } from './displayHelpers'

describe('displayHelpers timestamp formatting', () => {
  it('formats ABAP timestamp fields for table display', () => {
    const value = formatCellValue(
      { field_name: 'LAST_CHANGED_AT', FieldName: 'LAST_CHANGED_AT', fe_type: 'text', FeType: 'text', FieldType: '' },
      '20260723155930.934'
    )

    expect(value).toContain('2026')
    expect(value).toContain('07')
    expect(value).toContain('23')
    expect(value).toContain('59:30')
  })

  it('hides zero placeholder timestamps', () => {
    expect(formatTimestampValue('0', 'LOCAL_LAST_CHANGED_AT')).toBe('')
  })

  it('handles undefined or null field parameter safely without throwing', () => {
    expect(formatCellValue(undefined, 'SCH001')).toBe('SCH001')
    expect(formatCellValue(null, 'SCH001')).toBe('SCH001')
  })
})
