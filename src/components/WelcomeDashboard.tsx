import {
  FlexBox,
  Title,
  Text,
  Button,
  Label,
  Card,
  CardHeader,
  ComboBox,
  ComboBoxItem,
  Tag,
} from '@ui5/webcomponents-react'
import { TableConfig } from '../types'

interface WelcomeDashboardProps {
  tables: TableConfig[]
  username: string
  onSelectTable: (table: TableConfig | null) => void
  onRefreshTableList: () => Promise<void>
}

/**
 * Renders the welcome screen when no table is selected.
 * Includes: welcome banner, searchable ComboBox table selector, and dashboard grid of table cards.
 */
export default function WelcomeDashboard({
  tables,
  username,
  onSelectTable,
  onRefreshTableList,
}: WelcomeDashboardProps) {
  return (
    <div
      style={{
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        background: '#f4f6f8',
        minHeight: '100%',
        boxSizing: 'border-box',
      }}
    >
      {/* Welcome Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1d2d50 0%, #133b5c 100%)',
          color: '#fff',
          borderRadius: '8px',
          padding: '2rem',
          boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <Title level="H2" style={{ color: '#fff', margin: 0 }}>
            Welcome to Dynamic Table Maintenance
          </Title>
          <Text style={{ color: '#dbe2ef', marginTop: '0.5rem', display: 'block' }}>
            Select a table below or from the sidebar navigation to manage database records.
          </Text>
        </div>
        <div style={{ textAlign: 'right', minWidth: '180px' }}>
          <Label style={{ color: '#a3b7dc', display: 'block' }}>System Context</Label>
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: '1.1rem' }}>
            DEV · Client 324
          </Text>
          <Text style={{ color: '#a3b7dc', fontSize: '0.85rem', display: 'block', marginTop: '4px' }}>
            User: {username}
          </Text>
        </div>
      </div>

      {/* Searchable ComboBox Z-Table Selector */}
      <Card style={{ border: '1px solid #e2e8f0', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
        <div style={{ padding: '1.5rem' }}>
          <FlexBox direction="Column" gap="8px">
            <Label style={{ fontSize: '0.95rem', fontWeight: 'bold' }} showColon>
              Select Z-Table to Maintain
            </Label>
            <FlexBox gap="12px" alignItems="Center" wrap="Wrap">
              <ComboBox
                placeholder="Type to search and select a table..."
                style={{ width: '400px' }}
                filter="Contains"
                onSelectionChange={(e: any) => {
                  const selected = e.detail.item
                  if (selected) {
                    const match = tables.find(t => t.TableName === selected.text)
                    if (match) onSelectTable(match)
                  }
                }}
              >
                {tables.map(t => (
                  <ComboBoxItem key={t.ConfigUuid} text={t.TableName} />
                ))}
              </ComboBox>
              <Text style={{ color: '#6a7075', fontSize: '0.85rem' }}>
                Quick Search: Type standard table name (e.g. Z251, ZTPC)
              </Text>
            </FlexBox>
          </FlexBox>
        </div>
      </Card>

      {/* Dashboard Title & Stats */}
      <FlexBox justifyContent="SpaceBetween" alignItems="Center" style={{ marginTop: '0.5rem' }}>
        <Title level="H3">Overview: Registered Tables ({tables.length})</Title>
        <Button icon="refresh" design="Transparent" onClick={onRefreshTableList}>
          Refresh Config
        </Button>
      </FlexBox>

      {/* Tables Grid */}
      {tables.length === 0 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '30vh',
            background: '#fff',
            borderRadius: '8px',
            border: '1px solid #d9d9d9',
          }}
        >
          <Text>No active tables registered in the configuration</Text>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: '1.5rem',
          }}
        >
          {tables.map(t => (
            <Card
              key={t.ConfigUuid}
              onClick={() => onSelectTable(t)}
              style={{
                cursor: 'pointer',
                border: '1px solid #e2e8f0',
                boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
                transition: 'transform 0.15s, box-shadow 0.15s',
              }}
              onMouseOver={(e: any) => {
                e.currentTarget.style.transform = 'translateY(-2px)'
                e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.06)'
              }}
              onMouseOut={(e: any) => {
                e.currentTarget.style.transform = 'none'
                e.currentTarget.style.boxShadow = '0 2px 5px rgba(0,0,0,0.02)'
              }}
            >
              <CardHeader
                titleText={t.TableName}
                subtitleText={t.Description || 'Database Table'}
              />
              <div
                style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
              >
                {t.ApprovalRequired === 'X' && (
                  <FlexBox gap="8px" wrap="Wrap">
                    <Tag colorScheme="6">Approval Required</Tag>
                  </FlexBox>
                )}

                <div
                  style={{
                    borderTop: '1px solid #f0f0f0',
                    marginTop: '0.25rem',
                    paddingTop: '0.5rem',
                  }}
                >
                  <FlexBox direction="Column" gap="4px">
                    <Label style={{ fontSize: '0.75rem', color: '#6a7075' }}>Config UUID</Label>
                    <Text
                      style={{
                        fontSize: '0.8rem',
                        fontFamily: 'monospace',
                        color: '#32363a',
                      }}
                    >
                      {t.ConfigUuid}
                    </Text>
                  </FlexBox>
                </div>

                <FlexBox justifyContent="End" style={{ marginTop: '0.25rem' }}>
                  <Button
                    design="Emphasized"
                    icon="navigation-right-arrow"
                    onClick={(e: any) => {
                      e.stopPropagation()
                      onSelectTable(t)
                    }}
                  >
                    Maintain Data
                  </Button>
                </FlexBox>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
