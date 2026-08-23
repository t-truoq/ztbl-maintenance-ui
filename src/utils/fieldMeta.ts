/**
 * ============================================================================
 * FILE: src/utils/fieldMeta.ts
 * ----------------------------------------------------------------------------
 * VAI TRO: Bo nao xu ly Metadata va chuyen doi kieu du lieu cua toan bo Frontend.
 * ----------------------------------------------------------------------------
 * CAC NHIEM VU CHINH:
 *   - 1. Chuyen doi kieu du lieu ABAP/DDIC sang kieu Frontend (fe_type: date, boolean, uuid, domain, fk_select,...).
 *   - 2. Parse chuoi JSON metadata tra ve tu SAP RAP Action getFieldMeta.
 *   - 3. Parse du lieu dong (parseTableData) thanh mang doi tuong TableRowData.
 *   - 4. Dong goi va chuan hoa JSON payload khi Create/Update, tu dong loai bo System Audit Fields.
 * ============================================================================
 */

import { fromAbapDate, toAbapDate, toAbapUuid } from './abapFormatter'
import { FieldMeta, FeType, TableRowData } from '../types'

/* ============================================================================
 * PHAN 1: CHUYEN DOI NGAY THANG & PARSE METADATA JSON TU SAP BACKEND
 * ============================================================================ */

/** Chuyen doi chuoi ngay ABAP (YYYYMMDD) sang ISO (YYYY-MM-DD) cho UI */
export function abapToIso(abapDate: string): string {
  return fromAbapDate(abapDate)
}

/** Ham bi danh cua abapToIso */
export function isoFromAbap(abapDate: string): string {
  return fromAbapDate(abapDate)
}

/**
 * [HAM parseFieldMetaJson]: Doc chuoi JSON tra ve tu Action getFieldMeta cua SAP.
 * Chuan hoa tung cot va sap xep theo thu tu display_order do Admin cau hinh trong ZFLD_CONFIG.
 */
export function parseFieldMetaJson(metaJson: string): FieldMeta[] {
  if (!metaJson?.trim()) return []
  try {
    const list = JSON.parse(metaJson)
    const rows = Array.isArray(list) ? list : [list]
    return rows
      .map(normalizeFieldMetaRow)
      .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
  } catch (e: any) {
    console.error('parseFieldMetaJson failed:', e.message)
    return []
  }
}

/** Kiem tra co gia tri dung (true, 'X', 'TRUE', '1', 'YES') */
export function isTruthyFlag(value: any): boolean {
  if (value === true || value === 1) return true
  if (typeof value === 'string') {
    const s = value.trim().toUpperCase()
    return s === 'X' || s === 'TRUE' || s === '1' || s === 'Y' || s === 'YES'
  }
  return false
}

/* ============================================================================
 * PHAN 2: SUY DIEN KIEU DU LIEU & DU PHONG METADATA (FALLBACK)
 * ============================================================================ */

/**
 * Suy doan kieu fe_type dua vao ten cot va gia tri mau (Dung khi backend chua cau hinh ZFLD_CONFIG)
 */
export function inferFeTypeFromNameAndValue(fieldName: string, sampleValue: any): FeType {
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
 * Tao nhanh danh sach FieldMeta tu chuoi field_list phan cach bang dau phay khi thieu metadata chinh thuc
 */
export function buildFieldMetaFromFieldList(
  fieldList: string,
  dataJson = '',
  fixJsonFn = (s: string) => s
): FieldMeta[] {
  if (!fieldList?.trim()) return []

  const names = fieldList.split(',').map(s => s.trim()).filter(Boolean)
  let sample: Record<string, any> = {}

  if (dataJson?.trim()) {
    try {
      const fixed = fixJsonFn(dataJson)
      const rows = JSON.parse(fixed)
      sample = Array.isArray(rows) ? rows[0] || {} : rows
    } catch {
      /* Bo qua sample loi */
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

/* ============================================================================
 * PHAN 3: CHUAN HOA FIELD METADATA & MAPPING KIEU ABAP SANG FRONTEND
 * ============================================================================ */

/**
 * [HAM normalizeFieldMetaRow]: Chuan hoa 1 ban ghi metadata tu Backend ve dinh dang FieldMeta tieu chuan.
 * Xu ly thong minh cac kieu RAW16 (UUID), Date, Time, Domain, Checkbox Boolean va Foreign Key.
 */
export function normalizeFieldMetaRow(raw: Record<string, any>): FieldMeta {
  const fieldName = String(raw.field_name ?? raw.FieldName ?? raw.FIELD_NAME ?? '')
  let feType = normalizeFeType(raw.fe_type ?? raw.FeType ?? raw.FieldType ?? raw.FE_TYPE)
  const abapType = String(
    raw.abap_type ??
    raw.AbapType ??
    raw.ABAP_TYPE ??
    raw.field_type ??
    raw.FieldTypeRaw ??
    raw.FIELD_TYPE ??
    raw.inttype ??
    raw.IntType ??
    raw.INTTYPE ??
    ''
  )

  // Tinh chinh thong minh kieu du lieu dua vao ten cot va kieu ABAP (X = RAW/UUID, P = Timestamp/Dec)
  const upperName = fieldName.toUpperCase()
  const upperAbap = abapType.toUpperCase()
  if (feType === 'text' || feType === 'decimal') {
    if (/_(AT|ON|DATE)$/i.test(upperName) || /CREATED_|CHANGED_|LAST_CHANGED_/i.test(upperName)) {
      feType = 'date'
    } else if (upperAbap === 'X') {
      const len = Number(raw.length ?? raw.Length ?? raw.LENGTH ?? 0)
      if (len === 1) {
        feType = 'boolean'
      } else if (upperName.endsWith('_ID') || upperName.includes('UUID') || upperName === 'GUID' || len >= 16) {
        feType = 'uuid'
      } else if (/CAPACITY|QTY|QUANTITY|COUNT|SIZE/i.test(upperName)) {
        feType = 'integer'
      }
    } else if (/CAPACITY|QTY|QUANTITY|COUNT|INTEGER|NUM/i.test(upperName) && (upperAbap === 'P' || upperAbap === 'I' || upperAbap === 'INT4')) {
      feType = 'integer'
    }
  }
  const domainName = String(raw.domain_name ?? raw.DomainName ?? raw.DOMAIN_NAME ?? raw.domname ?? raw.DomName ?? raw.DOMNAME ?? '')
  const rollName = String(raw.rollname ?? raw.RollName ?? raw.ROLLNAME ?? '')
  const isFkKey = isTruthyFlag(raw.is_fk_key) || isTruthyFlag(raw.IsFkKey) || isTruthyFlag(raw.IS_FK_KEY)
  const fkRefTable = String(raw.fk_ref_table ?? raw.FkRefTable ?? raw.FK_REF_TABLE ?? '')

  const isKey = isTruthyFlag(raw.is_key) || isTruthyFlag(raw.IsKeyField) || isTruthyFlag(raw.IS_KEY)
  const isMandatory = isTruthyFlag(raw.is_mandatory) || isTruthyFlag(raw.MandatoryFlag) || isTruthyFlag(raw.IS_MANDATORY) || isTruthyFlag(raw.Mandatory) || isTruthyFlag(raw.MANDATORY)
  const isHidden = isTruthyFlag(raw.is_hidden) || isTruthyFlag(raw.HiddenFlag) || isTruthyFlag(raw.IS_HIDDEN) || isTruthyFlag(raw.Hidden) || isTruthyFlag(raw.HIDDEN)
  const isReadonly = isTruthyFlag(raw.readonly_flag) || isTruthyFlag(raw.ReadonlyFlag) || isTruthyFlag(raw.READONLY_FLAG) || isTruthyFlag(raw.Readonly) || isTruthyFlag(raw.READONLY) || isTruthyFlag(raw.is_readonly) || isTruthyFlag(raw.IsReadonly)

  return {
    _raw: raw,
    field_name: fieldName,
    abap_type: abapType,
    fe_type: feType,
    length: Number(raw.length ?? raw.Length ?? raw.LENGTH ?? raw.leng ?? raw.Leng ?? raw.LENG ?? 0),
    decimals: Number(raw.decimals ?? raw.Decimals ?? raw.DECIMALS ?? 0),
    is_key: isKey,
    is_mandatory: isMandatory,
    label: String(raw.label ?? raw.LabelText ?? raw.LABEL ?? fieldName),
    domain_name: domainName,
    display_order: Number(raw.display_order ?? raw.DisplayOrder ?? raw.DISPLAY_ORDER ?? 0),
    is_hidden: isHidden,
    is_fk_key: isFkKey,
    fk_ref_table: fkRefTable,
    is_readonly: isReadonly,
    ReadonlyFlag: isReadonly ? 'X' : '',
    /** Cac truong alias tuong thich nguoc voi Fiori Elements va UI Helpers */
    FieldName: fieldName,
    FeType: feType,
    FieldType: feTypeToLegacyFieldType(feType),
    LabelText: String(raw.label ?? raw.LabelText ?? raw.LABEL ?? fieldName),
    IsKeyField: isKey ? 'X' : '',
    MandatoryFlag: isMandatory ? 'X' : '',
    HiddenFlag: isHidden ? 'X' : '',
    DomainName: domainName,
    RollName: rollName,
    rollname: rollName,
    DisplayOrder: Number(raw.display_order ?? raw.DisplayOrder ?? raw.DISPLAY_ORDER ?? 0),
    Length: Number(raw.length ?? raw.Length ?? raw.LENGTH ?? raw.leng ?? raw.Leng ?? raw.LENG ?? 0),
    Decimals: Number(raw.decimals ?? raw.Decimals ?? raw.DECIMALS ?? 0),
    IsFkKey: isFkKey ? 'X' : '',
    FkRefTable: fkRefTable
  }
}

/** Chuyen doi cac chuoi mo ta kieu cua SAP thanh FeType tieu chuan */
function normalizeFeType(value: any): FeType {
  const t = String(value ?? 'text').toLowerCase()
  const map: Record<string, FeType> = {
    text: 'text',
    char: 'text',
    string: 'text',
    c: 'text',
    g: 'text',
    date: 'date',
    dats: 'date',
    d: 'date',
    time: 'time',
    tims: 'time',
    t: 'time',
    uuid: 'uuid',
    raw16: 'uuid',
    raw: 'uuid',
    boolean: 'boolean',
    check: 'boolean',
    decimal: 'decimal',
    curr: 'decimal',
    dec: 'decimal',
    quan: 'decimal',
    p: 'decimal',
    f: 'decimal',
    fltp: 'decimal',
    integer: 'integer',
    int: 'integer',
    int1: 'integer',
    int2: 'integer',
    int4: 'integer',
    int8: 'integer',
    i: 'integer',
    b: 'integer',
    s: 'integer',
    domain: 'domain',
    doma: 'domain',
    fk_select: 'fk_select',
    foreign_key: 'fk_select',
    foreignkey: 'fk_select'
  }
  return map[t] || 'text'
}

/** Chuyen FeType sang FieldType cu cua Fiori/SM30 */
function feTypeToLegacyFieldType(feType: FeType): string {
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
    case 'fk_select':
      return 'DOMAIN'
    default:
      return 'CHAR'
  }
}

/** Kiem tra truong co phai la khoa ngoai (Foreign Key) hay khong */
function isFkKeyField(field: FieldMeta): boolean {
  const raw = field._raw || {}
  return (
    field.is_fk_key === true ||
    field.IsFkKey === 'X' ||
    raw.is_fk_key === true ||
    raw.is_fk_key === 'X' ||
    raw.IS_FK_KEY === true ||
    raw.IS_FK_KEY === 'X' ||
    field.fe_type === 'fk_select' ||
    field.FeType === 'fk_select'
  )
}

/** Kiem tra truong khoa co phai la kieu UUID tu dong sinh (khong phai nhap tay) */
function isGeneratedUuidCreateKey(field: FieldMeta): boolean {
  return !!(field.is_key || field.IsKeyField === 'X') && field.fe_type === 'uuid' && !isFkKeyField(field)
}

/* ============================================================================
 * PHAN 4: PARSE DU LIEU DONG TU SAP (parseTableData & normalizeUuidFromBe)
 * ============================================================================ */

/**
 * [HAM parseTableData]: Chuyen doi mang du lieu tho tu SAP thanh mang doi tuong du lieu hien thi tren UI.
 * Ap dung dung quy tac format cho tung kieu (Date, Boolean X='', UUID, Timestamp).
 */
export function parseTableData(dataJson: string, meta: FieldMeta[]): TableRowData[] {
  if (!dataJson || dataJson.trim() === '[]') return []
  const rows = JSON.parse(dataJson)
  const list = Array.isArray(rows) ? rows : [rows]

  return list.map(row => {
    const parsed: TableRowData = {}
    for (const [key, val] of Object.entries(row)) {
      const field = meta.find(f => f.field_name === key)
      if (!field) {
        parsed[key] = val
        continue
      }
      switch (field.fe_type) {
        case 'date': {
          const s = String(val ?? '')
          const isTs =
            key.toUpperCase().includes('CHANGED_AT') ||
            key.toUpperCase().includes('CHANGE_AT') ||
            key.toUpperCase().includes('CREATED_AT') ||
            key.toUpperCase().includes('TIMESTAMP') ||
            field.FieldType === 'TIMESTAMP'
          if (!s) {
            parsed[key] = ''
          } else if (isTs) {
            // Giu nguyen gia tri goc neu la cot Timestamp de tranh bi cat cut gio phut giay
            parsed[key] = s
          } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
            parsed[key] = s.substring(0, 10)
          } else {
            parsed[key] = abapToIso(s)
          }
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

/** Chuan hoa chuoi UUID tu Backend ve dang Hex 32 ky tu in hoa hoac Base64 */
export function normalizeUuidFromBe(value: any): string {
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

/* ============================================================================
 * PHAN 5: DONG GOI PAYLOAD JSON & LOAI BO SYSTEM FIELDS (formatPayload)
 * ============================================================================ */

const SAP_CLIENT_FIELDS = new Set(['CLIENT', 'MANDT'])
const SAP_SYSTEM_FIELDS = new Set([
  'CREATED_BY',
  'CREATED_AT',
  'CREATED_ON',
  'CHANGED_BY',
  'CHANGED_AT',
  'CHANGED_ON',
  'LAST_CHANGED_BY',
  'LAST_CHANGED_AT',
  'LOCAL_LAST_CHANGED_AT',
  'ERNAM',
  'ERDAT',
  'ERZET',
  'AENAM',
  'AEDAT',
  'AEZET',
  'LAEDA'
])

/** Kiem tra ten cot co phai la truong he thong / Audit cua SAP hay khong */
function isSapSystemField(fieldName: string): boolean {
  const name = String(fieldName || '').trim().toUpperCase()
  return SAP_SYSTEM_FIELDS.has(name) || /^(CREATED|CHANGED|LAST_CHANGED|LOCAL_LAST_CHANGED)_(BY|AT|ON|DATE|TIME)$/i.test(name)
}

/**
 * [HAM formatPayload]: Chuan bi chuoi JSON de gui len SAP khi Create/Update.
 * - Tu dong loai bo MANDT / CLIENT vi SAP tu quan ly.
 * - Tu dong loai bo System Audit Fields de tranh loi ep kieu CX_SY_CONVERSION_NO_DATE_TIME o Backend.
 * - Chuyen doi kieu ngay ve YYYYMMDD, cờ boolean ve 'X', so nguyen/thap phan hop le.
 */
export function formatPayload(formData: Record<string, any>, meta: FieldMeta[], isCreate: boolean): string {
  const payload: Record<string, any> = {}

  for (const field of meta) {
    if (field.is_hidden) continue
    const keyName = (field.field_name || field.FieldName || '').toUpperCase()

    // Khong bao gio gui truong CLIENT/MANDT trong payload
    if (SAP_CLIENT_FIELDS.has(keyName) || keyName === 'CLIENT' || keyName === 'MANDT') continue

    // Khong gui cac truong he thong (SAP se tu dong dien)
    if (isSapSystemField(keyName)) continue

    const key = field.field_name || field.FieldName
    const raw = formData[key]

    switch (field.fe_type) {
      case 'uuid':
        if (isCreate && isGeneratedUuidCreateKey(field)) {
          payload[key] = ''
        } else {
          payload[key] = toAbapUuid(raw)
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

/* ============================================================================
 * PHAN 6: CAC HAM TIEN ICH FORM & VALUE HELP METADATA
 * ============================================================================ */

/** Loc ra danh sach cac truong hien thi tren Form nhap lieu (bo cac truong he thong va truong an) */
export function getFormFieldsFromMeta(meta: FieldMeta[], _mode = 'create'): FieldMeta[] {
  const SYSTEM_FIELD_NAMES = new Set([
    'CREATED_BY',
    'CREATED_AT',
    'CHANGED_BY',
    'CHANGED_AT',
    'CREATED_ON',
    'CHANGED_ON',
    'LAST_CHANGED_BY',
    'LAST_CHANGED_AT',
    'LOCAL_LAST_CHANGED_AT',
    'ERNAM',
    'ERDAT',
    'ERZET',
    'AENAM',
    'AEDAT',
    'AEZET',
    'LAEDA'
  ])

  return meta.filter(f => {
    if (f.is_hidden) return false
    const name = (f.field_name || f.FieldName || '').toUpperCase()
    if (SYSTEM_FIELD_NAMES.has(name)) return false
    if (/^(CREATED|CHANGED|LAST_CHANGED|LOCAL_LAST_CHANGED)_(BY|AT|ON|DATE|TIME)$/i.test(name)) return false
    return true
  })
}

/** Khoi tao gia tri mac dinh cho Form nhap lieu dua tren metadata */
export function initFormValuesFromMeta(formFields: FieldMeta[], row: TableRowData | null = null): Record<string, any> {
  const values: Record<string, any> = {}
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

/** Kiem tra truong co phai la kieu Domain co gia tri co dinh (Dropdown) */
export function isDomainFieldMeta(field: FieldMeta): boolean {
  return field.fe_type === 'domain' || field.FeType === 'domain'
}

/** Kiem tra truong co phai la kieu Khoa ngoai (Foreign Key Dialog) */
export function isFkSelectFieldMeta(field: FieldMeta): boolean {
  return (
    field.fe_type === 'fk_select' ||
    field.FeType === 'fk_select' ||
    field.is_fk_key === true ||
    field.IsFkKey === 'X'
  )
}

/** Lay khoa domain tu metadata */
export function getDomainKeyFromMeta(field: FieldMeta): string {
  return (field.domain_name || field.field_name || '').trim()
}
