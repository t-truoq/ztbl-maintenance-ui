import { describe, expect, it } from 'vitest'
import {
  getDuplicateCheckKeyFields,
  getMaxTextLength,
  shouldCheckDuplicateKey,
  validateFieldLength,
  validateInlineField
} from './validationHelpers'
import type { FieldMeta, TableRowData } from '../types'

function field(overrides: Partial<FieldMeta>): FieldMeta {
  return {
    field_name: 'NAME',
    fe_type: 'text',
    is_key: false,
    is_mandatory: false,
    ...overrides
  } as FieldMeta
}

describe('validationHelpers field length', () => {
  it('returns the configured max length for text fields', () => {
    expect(getMaxTextLength(field({ length: 12 }))).toBe(12)
  })

  it('caps UUID-like fields at 32 characters', () => {
    expect(getMaxTextLength(field({ field_name: 'ENTITY_ID', fe_type: 'uuid', length: 64 }))).toBe(32)
    expect(getMaxTextLength(field({ field_name: 'RAW_ID', FieldType: 'RAW16', Length: 16 }))).toBe(32)
  })

  it('rejects text values longer than the configured length', () => {
    expect(validateFieldLength(field({ length: 4 }), 'ABCDE')).toBe('Maximum length is 4 characters')
  })

  it('allows text values within the configured length', () => {
    expect(validateFieldLength(field({ length: 4 }), 'ABCD')).toBe('')
  })

  it('rejects UUID values longer than 32 hex characters', () => {
    expect(validateFieldLength(field({ fe_type: 'uuid' }), 'A'.repeat(33))).toBe('Maximum length is 32 hex characters')
  })

  it('rejects UUID values containing non-hex characters', () => {
    expect(validateFieldLength(field({ fe_type: 'uuid' }), '8B95-not-hex')).toBe('UUID must contain only hexadecimal characters')
  })
})

describe('validationHelpers duplicate keys', () => {
  const keyFields = [
    field({ field_name: 'MANDT', is_key: true }),
    field({ field_name: 'COURSE_ID', is_key: true }),
    field({ field_name: 'CATEGORY_ID', is_key: true, fe_type: 'fk_select' }),
    field({ field_name: 'ENTITY_UUID', is_key: true, fe_type: 'uuid' })
  ]

  it('excludes client and auto-generated UUID keys from duplicate checks', () => {
    expect(getDuplicateCheckKeyFields(keyFields).map(f => f.field_name)).toEqual([
      'COURSE_ID',
      'CATEGORY_ID'
    ])
  })

  it('skips duplicate checks when all keys are foreign keys', () => {
    expect(shouldCheckDuplicateKey([
      field({ field_name: 'CATEGORY_ID', is_key: true, fe_type: 'fk_select' })
    ])).toBe(false)
  })
})

describe('validateInlineField', () => {
  const fields = [
    field({ field_name: 'COURSE_ID', is_key: true, is_mandatory: true }),
    field({ field_name: 'CATEGORY_ID', is_key: true, fe_type: 'fk_select', is_mandatory: true }),
    field({ field_name: 'NAME', is_mandatory: true, length: 8 }),
    field({ field_name: 'ACTIVE', fe_type: 'boolean', is_mandatory: true })
  ]

  function row(overrides: TableRowData): TableRowData {
    return {
      _isNew: true,
      COURSE_ID: 'C001',
      CATEGORY_ID: 'CAT01',
      NAME: 'Course',
      ACTIVE: '',
      ...overrides
    }
  }

  it('returns no error for unknown fields', () => {
    expect(validateInlineField(0, 'UNKNOWN', 'x', row({}), fields, [], [row({})])).toBe('')
  })

  it('requires mandatory non-boolean fields', () => {
    expect(validateInlineField(0, 'NAME', '', row({ NAME: '' }), fields, [], [row({ NAME: '' })])).toBe('Field is required')
  })

  it('does not require mandatory boolean fields', () => {
    expect(validateInlineField(0, 'ACTIVE', '', row({ ACTIVE: '' }), fields, [], [row({ ACTIVE: '' })])).toBe('')
  })

  it('returns length errors before duplicate-key checks', () => {
    expect(validateInlineField(0, 'NAME', 'Too long value', row({ NAME: 'Too long value' }), fields, [], [row({})])).toBe(
      'Maximum length is 8 characters'
    )
  })

  it('detects duplicate primary keys in committed rows', () => {
    const draft = row({ COURSE_ID: 'C001', CATEGORY_ID: 'CAT01' })
    const existing = row({ _isNew: false, COURSE_ID: 'C001', CATEGORY_ID: 'CAT01' })

    expect(validateInlineField(0, 'COURSE_ID', 'C001', draft, fields, [existing], [draft])).toBe(
      'Primary Key combination already exists!'
    )
  })

  it('detects duplicate primary keys in another new row', () => {
    const first = row({ COURSE_ID: 'C001', CATEGORY_ID: 'CAT01' })
    const second = row({ COURSE_ID: 'C001', CATEGORY_ID: 'CAT01' })

    expect(validateInlineField(0, 'COURSE_ID', 'C001', first, fields, [], [first, second])).toBe(
      'Duplicate key found in another new row!'
    )
  })

  it('waits until all duplicate-check key values are present', () => {
    const draft = row({ COURSE_ID: 'C001', CATEGORY_ID: '' })
    const existing = row({ _isNew: false, COURSE_ID: 'C001', CATEGORY_ID: 'CAT01' })

    expect(validateInlineField(0, 'COURSE_ID', 'C001', draft, fields, [existing], [draft])).toBe('')
  })

  it('rejects invalid text in integer and decimal fields', () => {
    const numFields = [
      field({ field_name: 'QTY', fe_type: 'integer' }),
      field({ field_name: 'PRICE', fe_type: 'decimal' })
    ]
    const numRow = { QTY: 'sdasd', PRICE: 'abc' }
    expect(validateInlineField(0, 'QTY', 'sdasd', numRow, numFields, [], [numRow])).toBe('Must be a valid integer')
    expect(validateInlineField(0, 'PRICE', 'abc', numRow, numFields, [], [numRow])).toBe('Must be a valid number')
    expect(validateInlineField(0, 'QTY', '123', { QTY: '123' }, numFields, [], [{ QTY: '123' }])).toBe('')
    expect(validateInlineField(0, 'PRICE', '12.34', { PRICE: '12.34' }, numFields, [], [{ PRICE: '12.34' }])).toBe('')
  })
})
