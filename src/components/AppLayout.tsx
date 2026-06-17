import React, { useState } from 'react'
import {
  SideNavigation,
  SideNavigationItem,
  Button,
  Label,
  Input,
  Icon,
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
  username: _username,
  onSelectTable,
  onLogout: _onLogout,
  children
}: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [sidebarSearch, setSidebarSearch] = useState('')

  const filteredTables = tables.filter(t => {
    if (!sidebarSearch.trim()) return true
    const term = sidebarSearch.toLowerCase()
    const nameMatch = (t.TableName || '').toLowerCase().includes(term)
    const descMatch = (t.Description || '').toLowerCase().includes(term)
    return nameMatch || descMatch
  })

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div style={{
          width: collapsed ? '48px' : '260px',
          minWidth: collapsed ? '48px' : '260px',
          maxWidth: collapsed ? '48px' : '260px',
          flexShrink: 0,
          borderRight: '1px solid var(--sapContent_BorderColor, #d9d9d9)',
          background: 'var(--sapContent_NavigationBackgroundColor, #ffffff)',
          overflowY: 'auto',
          overflowX: 'hidden',
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
              gap: '8px',
              boxSizing: 'border-box',
              width: '100%'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                minWidth: 0
              }}>
                <Button
                  icon={'menu' as any}
                  design="Transparent"
                  onClick={() => setCollapsed(prev => !prev)}
                  style={{ flexShrink: 0 }}
                />
                <Label
                  style={{
                    fontWeight: 'bold',
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'normal',
                    lineHeight: '1.2',
                    display: '-webkit-box',
                    WebkitBoxOrient: 'vertical',
                    WebkitLineClamp: 2
                  }}
                >
                  Select Z-Table to Maintain
                </Label>
              </div>
              <Input
                placeholder="Search tables..."
                value={sidebarSearch}
                onInput={(e: any) => setSidebarSearch(e.target.value)}
                icon={<Icon name="search" />}
                style={{ width: '100%' }}
              />
            </div>
          )}

          {collapsed && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '8px',
              borderBottom: '1px solid var(--sapContent_BorderColor, #f0f0f0)'
            }}>
              <Button
                icon={'menu' as any}
                design="Transparent"
                onClick={() => setCollapsed(prev => !prev)}
              />
            </div>
          )}

          <SideNavigation collapsed={collapsed} style={{ flex: 1 }}>
            {filteredTables.map(t => (
              <SideNavigationItem
                key={t.ConfigUuid}
                text={t.TableName}
                icon={'table-view' as any}
                selected={selectedTable?.ConfigUuid === t.ConfigUuid}
                onClick={() => onSelectTable(t)}
              />
            ))}
          </SideNavigation>
        </div>

        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', overflowX: 'hidden', background: '#f5f6f7' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
