import React, { useState, useRef } from 'react'
import {
  ShellBar,
  SideNavigation,
  SideNavigationItem,
  Avatar,
  Button,
  FlexBox,
  Label,
  Input,
  Icon,
  Popover,
  Title,
  Text
} from '@ui5/webcomponents-react'
import { TableConfig } from '../types'

interface AppLayoutProps {
  tables: TableConfig[];
  selectedTable: TableConfig | null;
  loading: boolean;
  username: string;
  onSelectTable: (table: TableConfig | null) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

export default function AppLayout({
  tables,
  selectedTable,
  loading: _loading,
  username,
  onSelectTable,
  onLogout,
  children
}: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const popoverRef = useRef<any>(null)
  
  const userInitials = username ? username.slice(0, 2).toUpperCase() : 'U'

  const handleProfileClick = (e: any) => {
    popoverRef.current = e.detail.targetRef
    setProfileOpen(prev => !prev)
  }

  const filteredTables = tables.filter(t => {
    if (!sidebarSearch.trim()) return true
    const term = sidebarSearch.toLowerCase()
    const nameMatch = (t.TableName || '').toLowerCase().includes(term)
    const descMatch = (t.Description || '').toLowerCase().includes(term)
    return nameMatch || descMatch
  })

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Shell Bar Header */}
      <ShellBar
        primaryTitle="Dynamic Table Maintenance"
        secondaryTitle={`${username || ''} · Client 324`}
        startButton={
          <Button
            icon={"menu" as any}
            design="Transparent"
            onClick={() => setCollapsed(prev => !prev)}
          />
        }
        profile={<Avatar initials={userInitials} colorScheme="Accent6" interactive />}
        onProfileClick={handleProfileClick}
      />

      {/* User Profile Popover according to SAP Fiori Design guidelines */}
      <Popover
        open={profileOpen}
        opener={popoverRef.current}
        onClose={() => setProfileOpen(false)}
        headerText="User Account Info"
      >
        <FlexBox
          direction="Column"
          alignItems="Center"
          style={{ padding: '1.25rem', gap: '0.75rem', minWidth: '240px' }}
        >
          <Avatar initials={userInitials} colorScheme="Accent6" size="L" />
          <Title level="H5" style={{ margin: '4px 0' }}>{username}</Title>
          <Text style={{ color: '#6a7075', fontSize: '0.85rem' }}>Client: 324 · System: DEV</Text>
          <Button
            design="Negative"
            icon={"log" as any}
            style={{ marginTop: '0.75rem', width: '100%' }}
            onClick={() => {
              setProfileOpen(false)
              onLogout()
            }}
          >
            Logout
          </Button>
        </FlexBox>
      </Popover>

      {/* Main split layout */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left Side Navigation wrapper with dynamic width transition */}
        <div style={{
          width: collapsed ? '48px' : '260px',
          borderRight: '1px solid var(--sapContent_BorderColor, #d9d9d9)',
          background: 'var(--sapContent_NavigationBackgroundColor, #ffffff)',
          overflowY: 'auto',
          transition: 'width 0.2s ease-in-out',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {!collapsed && (
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid var(--sapContent_BorderColor, #f0f0f0)',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <Label style={{ fontWeight: 'bold' }}>Select Z-Table to Maintain</Label>
              <Input
                placeholder="Search tables..."
                value={sidebarSearch}
                onInput={(e: any) => setSidebarSearch(e.target.value)}
                icon={<Icon name="search" />}
                style={{ width: '100%' }}
              />
            </div>
          )}
          <SideNavigation collapsed={collapsed} style={{ flex: 1 }}>
            {filteredTables.map(t => (
              <SideNavigationItem
                key={t.ConfigUuid}
                text={t.TableName}
                icon={"table-view" as any}
                selected={selectedTable?.ConfigUuid === t.ConfigUuid}
                onClick={() => onSelectTable(t)}
              />
            ))}
          </SideNavigation>
        </div>

        {/* Right side dynamic page content area */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#f5f6f7' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
