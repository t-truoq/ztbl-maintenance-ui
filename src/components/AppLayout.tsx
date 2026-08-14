import React, { useEffect, useRef, useState } from 'react'
import {
  SideNavigation,
  SideNavigationItem,
  Button,
  Label,
  Input,
  Icon,
} from '@ui5/webcomponents-react'
import { isDeployedOnSAP } from '../services/apiClient'
import { TableConfig } from '../types'
import AppLoadingState from './AppLoadingState'

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
  loading,
  username: _username,
  onSelectTable,
  onLogout: _onLogout,
  children
}: AppLayoutProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [sidebarSearch, setSidebarSearch] = useState('')
  const [shellTopOffset, setShellTopOffset] = useState(0)

  useEffect(() => {
    if (!isDeployedOnSAP()) return undefined

    const headerSelectors = [
      '#shell-header',
      '#shell-header-hdr',
      '.sapUshellShellHeader',
      '.sapUshellShellHead',
      '.sapUshellShellFloatingContainer'
    ]

    const measureShellOverlap = () => {
      const root = rootRef.current
      if (!root) return

      const header = headerSelectors
        .map(selector => document.querySelector(selector) as HTMLElement | null)
        .find(element => {
          if (!element) return false
          const rect = element.getBoundingClientRect()
          return rect.height > 0 && rect.bottom > 0
        })

      if (!header) {
        setShellTopOffset(0)
        return
      }

      const headerRect = header.getBoundingClientRect()
      const rootRect = root.getBoundingClientRect()
      const overlap = Math.max(0, Math.ceil(headerRect.bottom - rootRect.top))
      setShellTopOffset(prev => (prev === overlap ? prev : overlap))
    }

    measureShellOverlap()
    const interval = window.setInterval(measureShellOverlap, 1000)
    window.addEventListener('resize', measureShellOverlap)
    window.addEventListener('scroll', measureShellOverlap, true)

    return () => {
      window.clearInterval(interval)
      window.removeEventListener('resize', measureShellOverlap)
      window.removeEventListener('scroll', measureShellOverlap, true)
    }
  }, [])

  const filteredTables = tables.filter(t => {
    if (!sidebarSearch.trim()) return true
    const term = sidebarSearch.toLowerCase()
    const nameMatch = (t.TableName || '').toLowerCase().includes(term)
    const descMatch = (t.Description || '').toLowerCase().includes(term)
    return nameMatch || descMatch
  })

  return (
    <div
      ref={rootRef}
      style={{
        height: shellTopOffset ? `calc(100dvh - ${shellTopOffset}px)` : '100dvh',
        paddingTop: shellTopOffset ? `${shellTopOffset}px` : 0,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div
        style={{
          display: 'flex',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden'
        }}
      >
        <div className={`app-sidebar${collapsed ? ' app-sidebar--collapsed' : ''}`} style={{
          width: collapsed ? '64px' : '272px',
          minWidth: collapsed ? '64px' : '272px',
          maxWidth: collapsed ? '64px' : '272px',
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
              padding: '16px',
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
                gap: '12px',
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
                    fontWeight: 600,
                    flex: 1,
                    minWidth: 0,
                    overflow: 'visible',
                    textOverflow: 'clip',
                    whiteSpace: 'nowrap',
                    lineHeight: '1.2'
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
            <div className="app-sidebar-collapsed-header">
              <Button
                icon={'menu' as any}
                design="Transparent"
                accessibleName="Expand sidebar"
                onClick={() => setCollapsed(prev => !prev)}
              />
            </div>
          )}

          {loading ? (
            <AppLoadingState label="Loading tables..." variant={collapsed ? 'compact' : 'inline'} />
          ) : collapsed ? (
            <nav className="app-sidebar-icon-list" aria-label="Table navigation">
              {filteredTables.map(t => {
                const selected = selectedTable?.ConfigUuid === t.ConfigUuid
                return (
                  <button
                    key={t.ConfigUuid}
                    type="button"
                    className={`app-sidebar-icon-item${selected ? ' app-sidebar-icon-item--selected' : ''}`}
                    title={t.Description ? `${t.TableName} - ${t.Description}` : t.TableName}
                    aria-label={t.TableName}
                    aria-current={selected ? 'page' : undefined}
                    onClick={() => onSelectTable(t)}
                  >
                    <Icon name="table-view" className="app-sidebar-icon" />
                  </button>
                )
              })}
            </nav>
          ) : (
            <SideNavigation collapsed={collapsed} style={{ flex: 1, width: '100%' }}>
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
          )}
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: selectedTable ? 'hidden' : 'auto',
            overflowX: 'hidden',
            background: '#f5f6f7'
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
