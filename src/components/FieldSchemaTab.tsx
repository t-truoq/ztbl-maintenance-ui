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
} from '@ui5/webcomponents-react'
import { AiDescriptionMap, FieldMeta } from '../types'
import AppLoadingState from './AppLoadingState'

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
    <div className="tab-panel-form field-schema-panel">
      <div className="tab-panel-header field-schema-header">
        <div className="tab-panel-title-block field-schema-title-block">
          <div className="tab-panel-title field-schema-title">Schema Assistant</div>
          <Text className="tab-panel-subtitle field-schema-muted">
            AI-generated field descriptions and input guidance are available as table tooltips and in the PDF data dictionary.
          </Text>
        </div>
        <FlexBox className="tab-panel-actions" alignItems="Center" gap="0.5rem">
          {aiLoading && <AppLoadingState label="Loading AI descriptions..." variant="compact" />}
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

      <div className="field-schema-table-surface">
        <Table
          className="field-schema-table"
          overflowMode="Scroll"
          headerRow={
            <TableHeaderRow className="field-schema-table-header-row">
            <TableHeaderCell className="field-schema-table-header-cell" minWidth="180px">
              <Label>Field</Label>
            </TableHeaderCell>
            <TableHeaderCell className="field-schema-table-header-cell" minWidth="120px">
              <Label>FE type</Label>
            </TableHeaderCell>
            <TableHeaderCell className="field-schema-table-header-cell" minWidth="100px">
              <Label>ABAP</Label>
            </TableHeaderCell>
            <TableHeaderCell className="field-schema-table-header-cell" minWidth="180px">
              <Label>Label</Label>
            </TableHeaderCell>
            <TableHeaderCell className="field-schema-table-header-cell" minWidth="80px">
              <Label>Key</Label>
            </TableHeaderCell>
            <TableHeaderCell className="field-schema-table-header-cell" minWidth="110px">
              <Label>Required</Label>
            </TableHeaderCell>
            <TableHeaderCell className="field-schema-table-header-cell" minWidth="80px">
              <Label>FK</Label>
            </TableHeaderCell>
            <TableHeaderCell className="field-schema-table-header-cell" minWidth="150px">
              <Label>Domain</Label>
            </TableHeaderCell>
            <TableHeaderCell className="field-schema-table-header-cell" minWidth="180px">
              <Label>AI Description</Label>
            </TableHeaderCell>
            <TableHeaderCell className="field-schema-table-header-cell" minWidth="180px">
              <Label>Input Guidance</Label>
            </TableHeaderCell>
          </TableHeaderRow>
          }
        >
        {allFields.length === 0 ? (
          <TableRow className="field-schema-empty-row">
            <TableCell className="field-schema-empty-cell" {...({ colSpan: 10 } as any)}>
              <Text>No field metadata loaded.</Text>
            </TableCell>
          </TableRow>
        ) : (
          allFields.map(f => {
            const name = f.field_name || f.FieldName
            const ai = aiDescriptions[name.toUpperCase()]
            return (
              <TableRow className="field-schema-data-row" key={name}>
                <TableCell className="field-schema-cell field-schema-cell--technical">
                  <Text>{name}</Text>
                </TableCell>
                <TableCell className="field-schema-cell field-schema-cell--technical">
                  <Text>{f.fe_type || f.FeType || '-'}</Text>
                </TableCell>
                <TableCell className="field-schema-cell field-schema-cell--technical">
                  <Text>{f.abap_type || '-'}</Text>
                </TableCell>
                <TableCell className="field-schema-cell">
                  <Text>{f.label || f.LabelText || name}</Text>
                </TableCell>
                <TableCell className="field-schema-cell field-schema-cell--flag">
                  <Text>{f.is_key || f.IsKeyField === 'X' ? 'Yes' : ''}</Text>
                </TableCell>
                <TableCell className="field-schema-cell field-schema-cell--flag">
                  <Text>{isRequired(f) ? 'Yes' : ''}</Text>
                </TableCell>
                <TableCell className="field-schema-cell field-schema-cell--flag">
                  <Text>{isForeignKey(f) ? 'Yes' : ''}</Text>
                </TableCell>
                <TableCell className="field-schema-cell field-schema-cell--technical">
                  <Text>{f.domain_name || f.DomainName || ''}</Text>
                </TableCell>
                <TableCell className="field-schema-cell field-schema-cell--description">
                  <Text>{ai?.description || ''}</Text>
                </TableCell>
                <TableCell className="field-schema-cell field-schema-cell--description">
                  <Text>{ai?.constraints || ''}</Text>
                </TableCell>
              </TableRow>
            )
          })
        )}
        </Table>
      </div>
    </div>
  )
}
