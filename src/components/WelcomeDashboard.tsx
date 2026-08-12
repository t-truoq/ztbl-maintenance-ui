import { useState } from 'react'
import {
  FlexBox,
  Title,
  Text,
  Button,
  Label,
  ComboBox,
  ComboBoxItem,
  Icon,
  Tag,
} from '@ui5/webcomponents-react'
import { TableConfig } from '../types'
import { isYesFlag } from '../utils/tableHelpers'

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
  const [refreshing, setRefreshing] = useState(false)
  const approvalRequiredCount = tables.filter(t => isYesFlag(t.ApprovalRequired)).length

  const handleRefreshConfig = async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      await onRefreshTableList()
    } finally {
      setRefreshing(false)
    }
  }

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
          <Text style={{ color: '#fff', fontWeight: 600, fontSize: '1rem' }}>
            DEV · Client 324
          </Text>
          <Text style={{ color: '#a3b7dc', fontSize: '0.85rem', display: 'block', marginTop: '4px' }}>
            User: {username}
          </Text>
        </div>
      </div>

      {/* Searchable ComboBox Z-Table Selector */}
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '1.5rem',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          boxSizing: 'border-box',
        }}
      >
        <FlexBox direction="Column" gap="8px">
          <Label style={{ fontSize: '0.875rem', fontWeight: 600 }} showColon>
            Select Z-Table to Maintain
          </Label>
          <FlexBox gap="12px" alignItems="Center" wrap="Wrap">
            <ComboBox
              placeholder="Type to search and select a table..."
              style={{ width: '400px', maxWidth: '100%' }}
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

      {/* Dashboard Title & Stats */}
      <FlexBox justifyContent="SpaceBetween" alignItems="Center" style={{ marginTop: '0.5rem' }}>
        <FlexBox direction="Column" gap="4px">
          <Title level="H3">Overview: Registered Tables ({tables.length})</Title>
          <Text className="overview-approval-count">
            {approvalRequiredCount} table(s) require approval before changes are applied.
          </Text>
        </FlexBox>
        <Button
          icon="refresh"
          design="Transparent"
          onClick={handleRefreshConfig}
          disabled={refreshing}
        >
          {refreshing ? 'Refreshing...' : 'Refresh Config'}
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
          {tables.map(t => {
            const requiresApproval = isYesFlag(t.ApprovalRequired)
            return (
              <div
                key={t.ConfigUuid}
                className={requiresApproval ? 'table-card table-card--approval' : 'table-card'}
                onClick={() => onSelectTable(t)}
                role="button"
                tabIndex={0}
                style={{
                  cursor: 'pointer',
                  background: '#fff',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem',
                  minHeight: '208px',
                  boxSizing: 'border-box',
                }}
                onMouseOver={(e: any) => {
                  e.currentTarget.style.transform = 'translateY(-2px)'
                  e.currentTarget.style.boxShadow = '0 4px 10px rgba(0,0,0,0.06)'
                }}
                onMouseOut={(e: any) => {
                  e.currentTarget.style.transform = 'none'
                  e.currentTarget.style.boxShadow = ''
                }}
                onKeyDown={(e: any) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelectTable(t)
                  }
                }}
              >
                <FlexBox direction="Column" gap="8px">
                  <Title level="H5" style={{ margin: 0 }}>
                    {t.TableName}
                  </Title>
                  <Text style={{ color: '#48617d' }}>
                    {t.Description || 'Database Table'}
                  </Text>
                </FlexBox>

                {requiresApproval ? (
                  <div className="table-approval-status table-approval-status--required">
                    <div className="table-approval-status-main">
                      <Icon name="approvals" className="table-approval-status-icon" />
                      <Tag colorScheme="2">Approval Required</Tag>
                    </div>
                    <Text className="table-approval-status-text">
                      Approval workflow enabled for data changes.
                    </Text>
                  </div>
                ) : (
                  <div className="table-approval-status table-approval-status--direct">
                    <div className="table-approval-status-main">
                      <Icon name="accept" className="table-approval-status-icon" />
                      <Tag colorScheme="8">Direct Maintenance</Tag>
                    </div>
                    <Text className="table-approval-status-text">
                      No approval workflow configured.
                    </Text>
                  </div>
                )}

                <div
                  style={{
                    borderTop: '1px solid #f0f0f0',
                    marginTop: 'auto',
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
            )
          })}
        </div>
      )}
    </div>
  )
}
