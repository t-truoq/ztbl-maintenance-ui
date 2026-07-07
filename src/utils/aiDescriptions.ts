import { AiDescriptionMap, AiFieldDescription, FieldMeta, TableConfig } from '../types'
import { formatHeaderLabel } from './tableHelpers'

function readLooseField(row: any, fieldName: string): any {
  if (!row || typeof row !== 'object') return undefined
  const direct = row[fieldName]
  if (direct !== undefined) return direct
  const upper = row[fieldName.toUpperCase()]
  if (upper !== undefined) return upper
  const camel = fieldName.replace(/_([a-z])/g, (_, c) => String(c).toUpperCase())
  if (row[camel] !== undefined) return row[camel]
  const key = Object.keys(row).find(k => k.toUpperCase() === fieldName.toUpperCase())
  return key ? row[key] : undefined
}

export function normalizeAiDescriptions(rows: any[]): AiFieldDescription[] {
  return (Array.isArray(rows) ? rows : [])
    .map(row => ({
      fieldName: String(readLooseField(row, 'field_name') || '').trim().toUpperCase(),
      description: String(readLooseField(row, 'description') || '').trim(),
      constraints: String(readLooseField(row, 'constraints') || '').trim(),
    }))
    .filter(row => row.fieldName && (row.description || row.constraints))
}

export function buildAiDescriptionMap(rows: AiFieldDescription[]): AiDescriptionMap {
  return rows.reduce<AiDescriptionMap>((map, row) => {
    map[row.fieldName.toUpperCase()] = row
    return map
  }, {})
}

function escapeHtml(value: any): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function exportDataDictionaryPdf(
  table: TableConfig,
  fields: FieldMeta[],
  aiDescriptions: AiDescriptionMap
) {
  const visibleFields = fields.filter(field => !(field.is_hidden || field.HiddenFlag === 'X'))
  const rows = visibleFields.map(field => {
    const name = field.field_name || field.FieldName
    const ai = aiDescriptions[name.toUpperCase()]
    const isRequired = field.is_mandatory || field.MandatoryFlag === 'X'
    const isForeignKey = field.is_fk_key ||
      field.IsFkKey === 'X' ||
      field.fe_type === 'fk_select' ||
      field.FeType === 'fk_select'
    return `
      <tr>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(formatHeaderLabel(field))}</td>
        <td>${escapeHtml(field.fe_type || field.FeType || '')}</td>
        <td>${escapeHtml(field.abap_type || '')}</td>
        <td>${escapeHtml(field.is_key || field.IsKeyField === 'X' ? 'Yes' : '')}</td>
        <td>${escapeHtml(isRequired ? 'Yes' : '')}</td>
        <td>${escapeHtml(isForeignKey ? 'Yes' : '')}</td>
        <td>${escapeHtml(field.domain_name || field.DomainName || '')}</td>
        <td>${escapeHtml(ai?.description || '')}</td>
        <td>${escapeHtml(ai?.constraints || '')}</td>
      </tr>
    `
  }).join('')

  const win = window.open('', '_blank', 'width=1100,height=800')
  if (!win) return

  win.document.write(`
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(table.TableName)} Data Dictionary</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 32px; color: #1d2d3e; }
          h1 { font-size: 22px; margin: 0 0 4px; }
          .subtitle { color: #5b6b7a; margin-bottom: 24px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #d9d9d9; padding: 8px; text-align: left; vertical-align: top; }
          th { background: #f5f6f7; }
          td { overflow-wrap: anywhere; }
          @media print { body { margin: 16mm; } }
        </style>
      </head>
      <body>
        <h1>${escapeHtml(table.TableName)}</h1>
        <div class="subtitle">${escapeHtml(table.Description || 'Data Dictionary')}</div>
        <table>
          <thead>
            <tr>
              <th>Field</th>
              <th>Label</th>
              <th>FE Type</th>
              <th>ABAP</th>
              <th>Key</th>
              <th>Required</th>
              <th>FK</th>
              <th>Domain</th>
              <th>AI Description</th>
              <th>Input Guidance</th>
            </tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="10">No field metadata loaded.</td></tr>'}</tbody>
        </table>
        <script>
          window.onload = function () { window.print(); };
        </script>
      </body>
    </html>
  `)
  win.document.close()
}
