/**
 * SM30-style field metadata + payload formatting (FE contract with BE).
 */

import { fromAbapDate, toAbapDate } from './abapFormatter'

/** @typedef {'text'|'date'|'time'|'uuid'|'boolean'|'decimal'|'integer'|'domain'} FeType */

/**
 * @typedef {object} FieldMeta
 * @property {string} field_name
 * @property {string} [abap_type]
 * @property {FeType} fe_type
 * @property {number} [length]
 * @property {number} [decimals]
 * @property {boolean} [is_key]
 * @property {boolean} [is_mandatory]
 * @property {string} [label]
 * @property {string} [domain_name]
 * @property {number} [display_order]
 * @property {boolean} [is_hidden]
 */

export function abapToIso(abapDate) {
  return fromAbapDate(abapDate)
}

export function isoFromAbap(abapDate) {
  return fromAbapDate(abapDate)
}

/**
 * Parse getfieldmeta meta_json; sort by display_order.
 * @param {string} metaJson
 * @returns {FieldMeta[]}
 */
export function parseFieldMetaJson(metaJson) {
  if (!metaJson?.trim()) return []
  try {
    const list = JSON.parse(metaJson)
    const rows = Array.isArray(list) ? list : [list]
    return rows
      .map(normalizeFieldMetaRow)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
  } catch (e) {
    console.error('parseFieldMetaJson failed:', e.message)
    return []
  }
}

function isTruthyFlag(value) {
  return value === true || value === 'X' || value === 'x' || value === 1
}

/** Infer fe_type when getFieldMeta unavailable — uses field_list + sample row */
export function inferFeTypeFromNameAndValue(fieldName, sampleValue) {
  const name = (fieldName || '').toUpperCase()
  const str = sampleValue === undefined || sampleValue === null ? '' : String(sampleValue).trim()

  if (name === 'CLIENT' || name === 'MANDT') return 'text'
  if (name.includes('UUID') || name === 'ENTITY_ID' || name === 'GUID') return 'uuid'
  if (name.endsWith('_ID') && /^[0-9A-F]{32}$/i.test(str.replace(/-/g, ''))) return 'uuid'
  if (/^[0-9A-F]{32}$/i.test(str.replace(/-/g, '')) && str.length >= 32) return 'uuid'
  if (/^\d{4}-\d{2}-\d{2}/.test(str) || /VALID_|_DATE$|_ON$/.test(name)) return 'date'
  if (/^\d{2}:\d{2}/.test(str) || name.endsWith('_TIME')) return 'time'
  if (str === 'X' || str === '') {
    if (/^IS_|^ACTIVE|^STATUS/i.test(name) && str.length <= 1) return 'boolean'
  }
  if (/^-?\d+$/.test(str) && /QTY|COUNT|INTEGER/i.test(name)) return 'integer'
  if (/^-?\d+(\.\d+)?$/.test(str) && /AMOUNT|PRICE|RATE/i.test(name)) return 'decimal'
  return 'text'
}

/**
 * Fallback metadata from getTableData.field_list (+ optional data_json sample).
 * @param {string} fieldList comma-separated
 * @param {string} [dataJson]
 * @param {(s: string) => string} [fixJsonFn]
 */
export function buildFieldMetaFromFieldList(fieldList, dataJson = '', fixJsonFn = s => s) {
  if (!fieldList?.trim()) return []

  const names = fieldList.split(',').map(s => s.trim()).filter(Boolean)
  let sample = {}

  if (dataJson?.trim()) {
    try {
      const fixed = fixJsonFn(dataJson)
      const rows = JSON.parse(fixed)
      sample = Array.isArray(rows) ? rows[0] || {} : rows
    } catch {
      /* ignore malformed sample */
    }
  }

  return names.map((name, idx) =>
    normalizeFieldMetaRow({
      field_name: name,
      fe_type: inferFeTypeFromNameAndValue(name, sample[name]),
      display_order: idx + 1,
      is_key: name === 'ENTITY_ID' || (name.endsWith('_ID') && name !== 'MANDT'),
      is_mandatory: false,
      label: name,
      is_hidden: name === 'CLIENT' || name === 'MANDT'
    })
  )
}

/** @param {Record<string, unknown>} raw */
export function normalizeFieldMetaRow(raw) {
  const fieldName = String(raw.field_name ?? raw.FieldName ?? '')
  const feType = normalizeFeType(raw.fe_type ?? raw.FeType ?? raw.FieldType)

  return {
    field_name: fieldName,
    abap_type: String(raw.abap_type ?? raw.AbapType ?? ''),
    fe_type: feType,
    length: Number(raw.length ?? raw.Length ?? 0),
    decimals: Number(raw.decimals ?? raw.Decimals ?? 0),
    is_key: isTruthyFlag(raw.is_key) || raw.IsKeyField === 'X',
    is_mandatory: isTruthyFlag(raw.is_mandatory) || raw.MandatoryFlag === 'X',
    label: String(raw.label ?? raw.LabelText ?? fieldName),
    domain_name: String(raw.domain_name ?? raw.DomainName ?? ''),
    display_order: Number(raw.display_order ?? raw.DisplayOrder ?? 0),
    is_hidden: isTruthyFlag(raw.is_hidden) || raw.HiddenFlag === 'X',
    /** Legacy aliases for existing UI helpers */
    FieldName: fieldName,
    FeType: feType,
    FieldType: feTypeToLegacyFieldType(feType),
    LabelText: String(raw.label ?? raw.LabelText ?? fieldName),
    IsKeyField: isTruthyFlag(raw.is_key) || raw.IsKeyField === 'X' ? 'X' : '',
    MandatoryFlag: isTruthyFlag(raw.is_mandatory) || raw.MandatoryFlag === 'X' ? 'X' : '',
    HiddenFlag: isTruthyFlag(raw.is_hidden) || raw.HiddenFlag === 'X' ? 'X' : '',
    DomainName: String(raw.domain_name ?? raw.DomainName ?? ''),
    DisplayOrder: Number(raw.display_order ?? raw.DisplayOrder ?? 0),
    Length: Number(raw.length ?? raw.Length ?? 0),
    Decimals: Number(raw.decimals ?? raw.Decimals ?? 0)
  }
}

/** @param {unknown} value */
function normalizeFeType(value) {
  const t = String(value ?? 'text').toLowerCase()
  const map = {
    text: 'text',
    char: 'text',
    string: 'text',
    date: 'date',
    time: 'time',
    uuid: 'uuid',
    raw16: 'uuid',
    raw: 'uuid',
    boolean: 'boolean',
    check: 'boolean',
    decimal: 'decimal',
    curr: 'decimal',
    integer: 'integer',
    int: 'integer',
    domain: 'domain',
    doma: 'domain'
  }
  return /** @type {FeType} */ (map[t] || 'text')
}

/** @param {FeType} feType */
function feTypeToLegacyFieldType(feType) {
  switch (feType) {
    case 'date':
      return 'DATE'
    case 'time':
      return 'TIME'
    case 'uuid':
      return 'UUID'
    case 'boolean':
      return 'CHECK'
    case 'decimal':
      return 'DECIMAL'
    case 'integer':
      return 'INTEGER'
    case 'domain':
      return 'DOMAIN'
    default:
      return 'CHAR'
  }
}

/**
 * @param {string} dataJson
 * @param {FieldMeta[]} meta
 * @returns {Record<string, unknown>[]}
 */
export function parseTableData(dataJson, meta) {
  if (!dataJson || dataJson.trim() === '[]') return []
  const rows = JSON.parse(dataJson)
  const list = Array.isArray(rows) ? rows : [rows]

  return list.map(row => {
    const parsed = {}
    for (const [key, val] of Object.entries(row)) {
      const field = meta.find(f => f.field_name === key)
      if (!field) {
        parsed[key] = val
        continue
      }
      switch (field.fe_type) {
        case 'date': {
          const s = String(val ?? '')
          parsed[key] = s
            ? /^\d{4}-\d{2}-\d{2}/.test(s)
              ? s.substring(0, 10)
              : abapToIso(s)
            : ''
          break
        }
        case 'boolean':
          parsed[key] = val === 'X' ? 'X' : ''
          break
        case 'uuid':
          parsed[key] = normalizeUuidFromBe(val)
          break
        default:
          parsed[key] = val
      }
    }
    return parsed
  })
}

/** BE returns 32-char hex; normalize legacy Base64 if present */
export function normalizeUuidFromBe(value) {
  if (value === undefined || value === null || value === '') return ''
  const s = String(value).trim()
  if (/^[0-9A-F]{32}$/i.test(s.replace(/-/g, ''))) {
    return s.replace(/-/g, '').toUpperCase()
  }
  if (/^[A-Za-z0-9+/]+=*$/.test(s) && s.length >= 20) {
    try {
      const binary = atob(s)
      return Array.from(binary)
        .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    } catch {
      return s
    }
  }
  return s.toUpperCase()
}

/**
 * @param {Record<string, unknown>} formData
 * @param {FieldMeta[]} meta
 * @param {boolean} isCreate
 * @returns {string}
 */
export function formatPayload(formData, meta, isCreate) {
  const payload = {}

  for (const field of meta) {
    if (field.is_hidden) continue

    const key = field.field_name
    const raw = formData[key]

    switch (field.fe_type) {
      case 'uuid':
        if (isCreate && field.is_key) {
          payload[key] = ''
        } else {
          payload[key] = String(raw ?? '')
            .replace(/-/g, '')
            .toUpperCase()
        }
        break

      case 'date':
        payload[key] = raw ? toAbapDate(raw) : '00000000'
        break

      case 'boolean':
        payload[key] = raw === true || raw === 'X' ? 'X' : ''
        break

      case 'decimal':
        payload[key] = raw != null && raw !== '' ? String(raw) : '0'
        break

      case 'integer':
        payload[key] =
          raw != null && raw !== '' ? String(Math.trunc(Number(raw))) : '0'
        break

      default:
        payload[key] = raw != null ? String(raw) : ''
    }
  }

  return JSON.stringify(payload)
}

/** Visible fields for form (non-hidden, non auto-key on create) */
export function getFormFieldsFromMeta(meta, mode = 'create') {
  return meta.filter(f => {
    if (f.is_hidden) return false
    if (mode === 'create' && f.is_key && f.fe_type === 'uuid') return false
    return true
  })
}

/** @param {FieldMeta[]} formFields */
export function initFormValuesFromMeta(formFields, row = null) {
  const values = {}
  formFields.forEach(f => {
    const raw = row?.[f.field_name]
    if (f.fe_type === 'boolean') {
      values[f.field_name] = raw === 'X' ? 'X' : ''
    } else if (f.fe_type === 'date' && raw) {
      values[f.field_name] = abapToIso(String(raw))
    } else {
      values[f.field_name] = raw ?? ''
    }
  })
  return values
}

export function isDomainFieldMeta(field) {
  return field.fe_type === 'domain'
}

export function getDomainKeyFromMeta(field) {
  return (field.domain_name || field.field_name || '').trim()
}
