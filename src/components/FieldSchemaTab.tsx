import {
  Table,
  TableHeaderRow,
  TableHeaderCell,
  TableRow,
  TableCell,
  Text,
  Label,
} from '@ui5/webcomponents-react'
import { FieldMeta } from '../types'

interface FieldSchemaTabProps {
  allFields: FieldMeta[]
}

/**
 * Renders the "Field Schema" tab showing field metadata
 * (technical name, FE type, ABAP type, label, key flag, domain, hidden flag).
 */
export default function FieldSchemaTab({ allFields }: FieldSchemaTabProps) {
  return (
    <>
      <Text style={{ marginBottom: '0.75rem', color: '#6a7075' }}>
        From getFieldMeta (DD03L + field config). Used for column labels,
        form inputs, and CRUD formatting.
      </Text>
      <Table
        headerRow={
          <TableHeaderRow>
            <TableHeaderCell minWidth="140px">
              <Label>Field</Label>
            </TableHeaderCell>
            <TableHeaderCell minWidth="100px">
              <Label>FE type</Label>
            </TableHeaderCell>
            <TableHeaderCell minWidth="80px">
              <Label>ABAP</Label>
            </TableHeaderCell>
            <TableHeaderCell minWidth="180px">
              <Label>Label</Label>
            </TableHeaderCell>
            <TableHeaderCell minWidth="80px">
              <Label>Key</Label>
            </TableHeaderCell>
            <TableHeaderCell minWidth="120px">
              <Label>Domain</Label>
            </TableHeaderCell>
            <TableHeaderCell minWidth="80px">
              <Label>Hidden</Label>
            </TableHeaderCell>
          </TableHeaderRow>
        }
      >
        {allFields.length === 0 ? (
          <TableRow>
            <TableCell {...({ colSpan: 7 } as any)}>
              <Text>No field metadata loaded.</Text>
            </TableCell>
          </TableRow>
        ) : (
          allFields.map(f => {
            const name = f.field_name || f.FieldName
            return (
              <TableRow key={name}>
                <TableCell>
                  <Text>{name}</Text>
                </TableCell>
                <TableCell>
                  <Text>{f.fe_type || f.FeType || '—'}</Text>
                </TableCell>
                <TableCell>
                  <Text>{f.abap_type || '—'}</Text>
                </TableCell>
                <TableCell>
                  <Text>{f.label || f.LabelText || name}</Text>
                </TableCell>
                <TableCell>
                  <Text>{f.is_key || f.IsKeyField === 'X' ? 'Yes' : ''}</Text>
                </TableCell>
                <TableCell>
                  <Text>{f.domain_name || f.DomainName || ''}</Text>
                </TableCell>
                <TableCell>
                  <Text>{f.is_hidden || f.HiddenFlag === 'X' ? 'Yes' : ''}</Text>
                </TableCell>
              </TableRow>
            )
          })
        )}
      </Table>
    </>
  )
}
