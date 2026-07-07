import {
  Table,
  TableHeaderRow,
  TableHeaderCell,
  TableRow,
  TableCell,
  Text,
  Label,
  Button,
  FlexBox,
  MessageStrip,
  BusyIndicator,
} from '@ui5/webcomponents-react'
import { AiDescriptionMap, FieldMeta } from '../types'

interface FieldSchemaTabProps {
  allFields: FieldMeta[]
  aiDescriptions?: AiDescriptionMap
  aiLoading?: boolean
  aiError?: string
  onLoadAiDescriptions?: () => void
  onExportPdf?: () => void
}

export default function FieldSchemaTab({
  allFields,
  aiDescriptions = {},
  aiLoading = false,
  aiError = '',
  onLoadAiDescriptions,
  onExportPdf,
}: FieldSchemaTabProps) {
  const hasAiDescriptions = Object.keys(aiDescriptions).length > 0

  const isRequired = (field: FieldMeta) => Boolean(field.is_mandatory || field.MandatoryFlag === 'X')
  const isForeignKey = (field: FieldMeta) => Boolean(
    field.is_fk_key ||
    field.IsFkKey === 'X' ||
    field.fe_type === 'fk_select' ||
    field.FeType === 'fk_select'
  )

  return (
    <div className="field-schema-panel">
      <div className="field-schema-header">
        <div className="field-schema-title-block">
          <div className="field-schema-title">Schema Assistant</div>
          <div className="field-schema-muted">
            AI-generated field descriptions and input guidance are available as table tooltips and in the PDF data dictionary.
          </div>
        </div>
        <FlexBox alignItems="Center" gap="0.5rem">
          {aiLoading && <BusyIndicator active size="S" />}
          <Button
            design="Transparent"
            icon={'sys-help' as any}
            onClick={onLoadAiDescriptions}
            disabled={aiLoading || !onLoadAiDescriptions}
          >
            {hasAiDescriptions ? 'Refresh AI Description' : 'Generate AI Description'}
          </Button>
          <Button
            design="Transparent"
            icon={'pdf-attachment' as any}
            onClick={onExportPdf}
            disabled={!onExportPdf}
          >
            Export PDF
          </Button>
        </FlexBox>
      </div>

      {aiError && (
        <MessageStrip design="Negative" className="field-schema-message">
          {aiError}
        </MessageStrip>
      )}

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
            <TableHeaderCell minWidth="100px">
              <Label>Required</Label>
            </TableHeaderCell>
            <TableHeaderCell minWidth="80px">
              <Label>FK</Label>
            </TableHeaderCell>
            <TableHeaderCell minWidth="120px">
              <Label>Domain</Label>
            </TableHeaderCell>
            <TableHeaderCell minWidth="340px">
              <Label>AI Description</Label>
            </TableHeaderCell>
            <TableHeaderCell minWidth="340px">
              <Label>Input Guidance</Label>
            </TableHeaderCell>
          </TableHeaderRow>
        }
      >
        {allFields.length === 0 ? (
          <TableRow>
            <TableCell {...({ colSpan: 10 } as any)}>
              <Text>No field metadata loaded.</Text>
            </TableCell>
          </TableRow>
        ) : (
          allFields.map(f => {
            const name = f.field_name || f.FieldName
            const ai = aiDescriptions[name.toUpperCase()]
            return (
              <TableRow key={name}>
                <TableCell>
                  <Text>{name}</Text>
                </TableCell>
                <TableCell>
                  <Text>{f.fe_type || f.FeType || '-'}</Text>
                </TableCell>
                <TableCell>
                  <Text>{f.abap_type || '-'}</Text>
                </TableCell>
                <TableCell>
                  <Text>{f.label || f.LabelText || name}</Text>
                </TableCell>
                <TableCell>
                  <Text>{f.is_key || f.IsKeyField === 'X' ? 'Yes' : ''}</Text>
                </TableCell>
                <TableCell>
                  <Text>{isRequired(f) ? 'Yes' : ''}</Text>
                </TableCell>
                <TableCell>
                  <Text>{isForeignKey(f) ? 'Yes' : ''}</Text>
                </TableCell>
                <TableCell>
                  <Text>{f.domain_name || f.DomainName || ''}</Text>
                </TableCell>
                <TableCell>
                  <Text>{ai?.description || ''}</Text>
                </TableCell>
                <TableCell>
                  <Text>{ai?.constraints || ''}</Text>
                </TableCell>
              </TableRow>
            )
          })
        )}
      </Table>
    </div>
  )
}
