import { describe, expect, it } from 'vitest'
import { findImportHeaderOrder } from './excelImportHeaders'

describe('findImportHeaderOrder', () => {
  it('reads the actual header row after the workbook instruction row', () => {
    expect(findImportHeaderOrder([
      ['C = Create', 'Required key', 'Technical field', 'Enter one of the allowed values'],
      ['ACTION', 'MANDT', 'ENTITY_ID', 'NAME', 'STATUS', null]
    ])).toEqual(['ACTION', 'MANDT', 'ENTITY_ID', 'NAME', 'STATUS'])
  })
})
