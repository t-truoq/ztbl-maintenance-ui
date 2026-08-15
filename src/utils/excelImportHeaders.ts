import { readSheet } from 'read-excel-file/browser'

type ImportCell = string | number | boolean | Date | null | undefined

export function findImportHeaderOrder(rows: ImportCell[][]): string[] {
  for (const row of rows.slice(0, 25)) {
    const cells = row.map(cell => String(cell ?? '').trim())
    const actionIndex = cells.findIndex(cell => cell.toUpperCase() === 'ACTION')
    if (actionIndex === -1) continue

    return cells
      .slice(actionIndex)
      .filter(Boolean)
  }
  return []
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const cells: string[] = []
  let value = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (character === delimiter && !quoted) {
      cells.push(value.trim())
      value = ''
    } else {
      value += character
    }
  }
  cells.push(value.trim())
  return cells
}

function findJsonFieldOrder(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  try {
    const parsed = trimmed.startsWith('[')
      ? JSON.parse(trimmed)
      : JSON.parse(trimmed.split(/\r?\n/).find(Boolean) || '{}')
    const firstRecord = Array.isArray(parsed) ? parsed[0] : parsed
    return firstRecord && typeof firstRecord === 'object' ? Object.keys(firstRecord) : []
  } catch {
    return []
  }
}

export async function getUploadedFileFieldOrder(file: File, fileFormat: string): Promise<string[]> {
  try {
    if (fileFormat === 'XLSX') {
      const rows = await readSheet(file, { sheet: 1 })
      return findImportHeaderOrder(rows as ImportCell[][])
    }

    const text = await file.text()
    if (fileFormat === 'CSV' || fileFormat === 'TSV') {
      const delimiter = fileFormat === 'TSV' ? '\t' : ','
      const rows = text.split(/\r?\n/).slice(0, 25).map(line => parseDelimitedLine(line, delimiter))
      return findImportHeaderOrder(rows)
    }
    if (fileFormat === 'JSON' || fileFormat === 'JSONL' || fileFormat === 'NDJSON') {
      return findJsonFieldOrder(text)
    }
  } catch (error) {
    console.warn('[ExcelPipeline] Could not read uploaded column order; using schema order.', error)
  }
  return []
}
