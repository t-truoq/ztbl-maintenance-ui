import { describe, it, expect } from 'vitest'
import {
  toAbapDate,
  fromAbapDate,
  toAbapTime,
  toAbapUtclong,
  base64ToHex,
  hexToBase64,
  toAbapUuid,
  isEmptyUuidValue,
  buildFieldMetadata,
  normalizeRecordForAbap,
  formatEtagValueForAbap,
  isJsonFormatError,
  enhanceJsonFormatError
} from './abapFormatter.js'

describe('toAbapDate', () => {
  it('converts ISO date to YYYYMMDD', () => {
    expect(toAbapDate('2026-05-21')).toBe('20260521')
  })

  it('returns 00000000 for empty values', () => {
    expect(toAbapDate('')).toBe('00000000')
    expect(toAbapDate(null)).toBe('00000000')
    expect(toAbapDate(undefined)).toBe('00000000')
  })

  it('passes through already-ABAP dates', () => {
    expect(toAbapDate('20260521')).toBe('20260521')
  })
})

describe('fromAbapDate', () => {
  it('converts YYYYMMDD to ISO for UI', () => {
    expect(fromAbapDate('20260521')).toBe('2026-05-21')
  })

  it('converts full timestamp YYYYMMDDHHMMSS.fraction to ISO format', () => {
    expect(fromAbapDate('20260620125645.5721260')).toBe('2026-06-20 12:56:45')
  })

  it('returns empty for sentinel dates', () => {
    expect(fromAbapDate('00000000')).toBe('')
  })
})

describe('toAbapTime', () => {
  it('converts HH:MM:SS to HHMMSS', () => {
    expect(toAbapTime('14:09:48')).toBe('140948')
  })

  it('converts HH:MM to HHMMSS with zero seconds', () => {
    expect(toAbapTime('14:09')).toBe('140900')
  })

  it('returns 000000 for empty', () => {
    expect(toAbapTime('')).toBe('000000')
  })
})

describe('toAbapUtclong', () => {
  it('formats ISO timestamp with fractional seconds', () => {
    expect(toAbapUtclong('2026-05-21T14:09:48.929Z')).toBe(
      '2026-05-21 14:09:48.9290000'
    )
  })

  it('formats compact timestamp', () => {
    expect(toAbapUtclong('20260521140948.929')).toBe(
      '2026-05-21 14:09:48.9290000'
    )
  })

  it('preserves ABAP format with 7 fractional digits', () => {
    expect(toAbapUtclong('2026-05-21 14:09:48.9298540')).toBe(
      '2026-05-21 14:09:48.9298540'
    )
  })

  it('normalizes UI display timestamp with AM/PM back to ABAP UTCLONG', () => {
    expect(toAbapUtclong('06/20/2026, 12:27:58.642 PM')).toBe(
      '2026-06-20 12:27:58.6420000'
    )
    expect(toAbapUtclong('06/20/2026, 12:27:58 AM')).toBe(
      '2026-06-20 00:27:58.0000000'
    )
  })

  it('returns null for empty', () => {
    expect(toAbapUtclong('')).toBe(null)
    expect(toAbapUtclong(null)).toBe(null)
    expect(toAbapUtclong('0')).toBe(null)
  })
})

describe('base64ToHex / hexToBase64', () => {
  const sampleHex = '8B95F36A4F271FD195A3D745D07762DD'
  const sampleB64 = 'i5Xzak8nH9GVo9dF0Hdi3Q=='

  it('converts Base64 from gettabledata to uppercase hex', () => {
    expect(base64ToHex(sampleB64)).toBe(sampleHex)
  })

  it('round-trips hex to Base64 and back', () => {
    expect(hexToBase64(sampleHex)).toBe(sampleB64)
    expect(base64ToHex(hexToBase64(sampleHex))).toBe(sampleHex)
  })
})

describe('toAbapUuid', () => {
  it('converts Base64 from legacy getTableData to uppercase hex', () => {
    expect(toAbapUuid('i5Xzak8nH9GVo9dF0Hdi3Q==')).toBe('8B95F36A4F271FD195A3D745D07762DD')
  })

  it('normalizes 32-char hex to uppercase', () => {
    expect(toAbapUuid('8b95f36a4f271fd195a3d745d07762dd')).toBe('8B95F36A4F271FD195A3D745D07762DD')
  })

  it('strips hyphens from UUID strings', () => {
    expect(toAbapUuid('8B95F36A-4F27-1FD1-95A3-D745D07762DD')).toBe(
      '8B95F36A4F271FD195A3D745D07762DD'
    )
  })

  it('maps SAP empty UUID sentinels to empty string', () => {
    expect(isEmptyUuidValue('00000000000000000000000000000000')).toBe(true)
    expect(isEmptyUuidValue('AAAAAAAAAAAAAAAAAAAAAA==')).toBe(true)
    expect(toAbapUuid('00000000000000000000000000000000')).toBe('')
    expect(toAbapUuid('AAAAAAAAAAAAAAAAAAAAAA==')).toBe('')
  })
})

describe('normalizeRecordForAbap', () => {
  const metadata = {
    VALID_FROM: { type: 'DATE' },
    CHANGED_AT: { type: 'UTCLONG' },
    ENTITY_ID: { type: 'UUID' }
  }

  it('normalizes mixed field types for create/update payload', () => {
    const record = {
      VALID_FROM: '2026-05-21',
      CHANGED_AT: '2026-05-21T14:09:48.929Z',
      ENTITY_ID: '8B95F36A4F271FD195A3D745D07762DD',
      NAME: 'Test'
    }
    const result = normalizeRecordForAbap(record, metadata)
    expect(result.VALID_FROM).toBe('20260521')
    expect(result.CHANGED_AT).toBe('2026-05-21 14:09:48.9290000')
    expect(result.ENTITY_ID).toBe('8B95F36A4F271FD195A3D745D07762DD')
    expect(result.NAME).toBe('Test')
  })

  it('sends 00000000 for empty DATE on create', () => {
    const result = normalizeRecordForAbap({ VALID_FROM: '' }, { VALID_FROM: { type: 'DATE' } })
    expect(result.VALID_FROM).toBe('00000000')
  })

  it('normalizes ISO CREATED_AT with Z suffix to ABAP UTCLONG', () => {
    const metadata = { CREATED_AT: { type: 'UTCLONG' } }
    const result = normalizeRecordForAbap(
      { CREATED_AT: '2026-05-21T14:09:48.929854Z' },
      metadata
    )
    expect(result.CREATED_AT).toBe('2026-05-21 14:09:48.9298540')
  })

  it('normalizes UUID fields to uppercase hex', () => {
    const metadata = {
      ENTITY_ID: { type: 'UUID' },
      REF_ID: { type: 'TEXT' }
    }
    const result = normalizeRecordForAbap(
      {
        ENTITY_ID: 'i5Xzak8nH9GVo9dF0Hdi3Q==',
        REF_ID: '00000000000000000000000000000000'
      },
      metadata
    )
    expect(result.ENTITY_ID).toBe('8B95F36A4F271FD195A3D745D07762DD')
    expect(result.REF_ID).toBe('')
  })
})

describe('buildFieldMetadata', () => {
  it('maps FieldConfig types to ABAP metadata types', () => {
    const meta = buildFieldMetadata([
      { FieldName: 'VALID_FROM', FieldType: 'DATE' },
      { FieldName: 'CHANGED_AT', FieldType: 'TIMESTAMP' },
      { FieldName: 'CONFIG_UUID', FieldType: 'UUID' }
    ])
    expect(meta.VALID_FROM.type).toBe('DATE')
    expect(meta.CHANGED_AT.type).toBe('UTCLONG')
    expect(meta.CONFIG_UUID.type).toBe('UUID')
  })

  it('treats key fields ending in _ID as UUID', () => {
    const meta = buildFieldMetadata([
      { FieldName: 'ITEM_ID', FieldType: 'CHAR', IsKeyField: 'X' }
    ])
    expect(meta.ITEM_ID.type).toBe('UUID')
  })

  it('treats *_AT fields as UTCLONG regardless of FieldType', () => {
    const meta = buildFieldMetadata([{ FieldName: 'CREATED_AT', FieldType: 'STRING' }])
    expect(meta.CREATED_AT.type).toBe('UTCLONG')
  })
})

describe('formatEtagValueForAbap', () => {
  it('keeps ABAP UTCLONG string from gettabledata', () => {
    expect(formatEtagValueForAbap('2026-05-21 14:09:48.9298540')).toBe(
      '2026-05-21 14:09:48.9298540'
    )
  })

  it('does not send 0 to bypass lock', () => {
    expect(formatEtagValueForAbap(0)).toBe('')
    expect(formatEtagValueForAbap('0')).toBe('')
  })
})

describe('JSON format error helpers', () => {
  it('detects BE invalid JSON format message', () => {
    expect(isJsonFormatError('Invalid format in JSON for field CHANGED_AT')).toBe(true)
    expect(isJsonFormatError('Other error')).toBe(false)
  })

  it('appends user guidance', () => {
    const msg = enhanceJsonFormatError('Invalid format in JSON')
    expect(msg).toContain('YYYYMMDD')
    expect(msg).toContain('Invalid format in JSON')
  })
})
