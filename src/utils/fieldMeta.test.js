import { describe, it, expect } from 'vitest'
import {
  formatPayload,
  parseTableData,
  parseFieldMetaJson,
  normalizeUuidFromBe,
  abapToIso,
  getFormFieldsFromMeta
} from './fieldMeta.js'
import { buildKeyRecord, isFieldReadonly } from './recordHelpers'

const meta = [
  {
    field_name: 'ENTITY_ID',
    fe_type: 'uuid',
    is_key: true,
    is_hidden: false
  },
  {
    field_name: 'VALID_FROM',
    fe_type: 'date',
    is_key: false,
    is_hidden: false
  },
  {
    field_name: 'ACTIVE',
    fe_type: 'boolean',
    is_key: false,
    is_hidden: false
  },
  {
    field_name: 'AMOUNT',
    fe_type: 'decimal',
    is_key: false,
    is_hidden: false
  },
  {
    field_name: 'QTY',
    fe_type: 'integer',
    is_key: false,
    is_hidden: false
  },
  {
    field_name: 'NAME',
    fe_type: 'text',
    is_key: false,
    is_hidden: false
  }
]

describe('formatPayload', () => {
  it('formats create payload with empty key UUID', () => {
    const json = formatPayload(
      {
        VALID_FROM: '2026-05-21',
        ACTIVE: 'X',
        AMOUNT: 12.5,
        QTY: 3,
        NAME: 'Test'
      },
      meta,
      true
    )
    const payload = JSON.parse(json)
    expect(payload.ENTITY_ID).toBe('')
    expect(payload.VALID_FROM).toBe('20260521')
    expect(payload.ACTIVE).toBe('X')
    expect(payload.AMOUNT).toBe('12.5')
    expect(payload.QTY).toBe('3')
    expect(payload.NAME).toBe('Test')
  })

  it('formats edit UUID as uppercase hex', () => {
    const json = formatPayload(
      { ENTITY_ID: '8b95f36a-4f27-1fd1-95a3-d745d07762dd', NAME: 'X' },
      meta,
      false
    )
    expect(JSON.parse(json).ENTITY_ID).toBe('8B95F36A4F271FD195A3D745D07762DD')
  })
})

describe('parseTableData', () => {
  it('converts ABAP dates and booleans for UI', () => {
    const rows = parseTableData(
      JSON.stringify([
        { VALID_FROM: '20260521', ACTIVE: 'X', ENTITY_ID: '8B95F36A4F271FD195A3D745D07762DD' }
      ]),
      meta
    )
    expect(rows[0].VALID_FROM).toBe('2026-05-21')
    expect(rows[0].ACTIVE).toBe('X')
    expect(rows[0].ENTITY_ID).toBe('8B95F36A4F271FD195A3D745D07762DD')
  })
})

describe('parseFieldMetaJson', () => {
  it('parses snake_case meta from getfieldmeta', () => {
    const list = parseFieldMetaJson(
      JSON.stringify([
        {
          field_name: 'NAME',
          fe_type: 'text',
          display_order: 2,
          is_hidden: false
        },
        {
          field_name: 'ID',
          fe_type: 'uuid',
          display_order: 1,
          is_key: true
        }
      ])
    )
    expect(list[0].field_name).toBe('ID')
    expect(list[1].field_name).toBe('NAME')
  })
})

describe('getFormFieldsFromMeta', () => {
  it('keeps key ID fields visible in record forms', () => {
    const fields = parseFieldMetaJson(
      JSON.stringify([
        { field_name: 'ENTITY_ID', fe_type: 'text', FieldType: 'RAW16', is_key: true },
        { field_name: 'CATEGORY_ID', fe_type: 'text', is_key: true },
        { field_name: 'DESCRIPTION', fe_type: 'text' }
      ])
    )

    expect(getFormFieldsFromMeta(fields, 'create').map(f => f.field_name)).toEqual([
      'ENTITY_ID',
      'CATEGORY_ID',
      'DESCRIPTION'
    ])
    expect(getFormFieldsFromMeta(fields, 'edit').map(f => f.field_name)).toEqual([
      'ENTITY_ID',
      'CATEGORY_ID',
      'DESCRIPTION'
    ])
  })
})

describe('isFieldReadonly', () => {
  it('makes generated key ID fields readonly in create and edit', () => {
    const field = parseFieldMetaJson(
      JSON.stringify({ field_name: 'CATEGORY_ID', fe_type: 'text', is_key: true })
    )[0]

    expect(isFieldReadonly(field, 'create')).toBe(true)
    expect(isFieldReadonly(field, 'edit')).toBe(true)
  })
})

describe('normalizeUuidFromBe', () => {
  it('keeps hex and converts Base64 legacy values', () => {
    expect(normalizeUuidFromBe('8B95F36A4F271FD195A3D745D07762DD')).toBe(
      '8B95F36A4F271FD195A3D745D07762DD'
    )
    expect(normalizeUuidFromBe('i5Xzak8nH9GVo9dF0Hdi3Q==')).toBe(
      '8B95F36A4F271FD195A3D745D07762DD'
    )
  })
})

describe('abapToIso', () => {
  it('maps YYYYMMDD to ISO', () => {
    expect(abapToIso('20241231')).toBe('2024-12-31')
    expect(abapToIso('00000000')).toBe('')
  })
})

describe('buildKeyRecord', () => {
  it('excludes CLIENT and MANDT fields from key data', () => {
    const fields = [
      { field_name: 'CLIENT', is_key: true },
      { field_name: 'MANDT', is_key: true },
      { field_name: 'COURSE_ID', is_key: true }
    ]
    const values = {
      CLIENT: '324',
      MANDT: '324',
      COURSE_ID: '9',
      COURSE_NAME: 'Test Course'
    }
    const key = buildKeyRecord(fields, values)
    expect(key).toEqual({ COURSE_ID: '9' })
  })
})

