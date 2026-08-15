import { describe, expect, it } from 'vitest'
import { deduplicateExcelMessages, orderExcelPreviewFields } from './excelPreviewHelpers'

describe('orderExcelPreviewFields', () => {
  it('keeps preview columns in Excel schema order instead of diff encounter order', () => {
    expect(orderExcelPreviewFields(
      ['NAME', 'MANDT', 'ENTITY_ID', 'STATUS'],
      ['MANDT', 'ENTITY_ID', 'NAME', 'STATUS']
    )).toEqual(['MANDT', 'ENTITY_ID', 'NAME', 'STATUS'])
  })

  it('deduplicates fields case-insensitively and appends unknown backend fields', () => {
    expect(orderExcelPreviewFields(
      ['NAME', 'name', 'BACKEND_NOTE', 'ACTION'],
      ['ENTITY_ID', 'NAME']
    )).toEqual(['NAME', 'BACKEND_NOTE'])
  })

  it('uses exactly the uploaded headers even when a field has no diff row', () => {
    expect(orderExcelPreviewFields(
      ['NAME', 'BACKEND_ONLY'],
      ['ACTION', 'MANDT', 'ENTITY_ID', 'NAME', 'STATUS'],
      true
    )).toEqual(['MANDT', 'ENTITY_ID', 'NAME', 'STATUS'])
  })
})

describe('deduplicateExcelMessages', () => {
  it('removes duplicate delete clauses contained in the same backend message', () => {
    expect(deduplicateExcelMessages([
      'Record will be deleted',
      'Record will be deleted; Record will be deleted.'
    ])).toEqual(['Record will be deleted'])
  })

  it('keeps distinct message clauses', () => {
    expect(deduplicateExcelMessages([
      'Record will be updated; 2 field(s) changed.'
    ])).toEqual(['Record will be updated', '2 field(s) changed.'])
  })
})
