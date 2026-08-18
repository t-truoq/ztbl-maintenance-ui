/**
 * ============================================================================
 * FILE: src/components/AppLayout.tsx
 * ----------------------------------------------------------------------------
 * VAI TRO: Khung vo giao dien (Shell Layout Component).
 * ----------------------------------------------------------------------------
 * CAC NHIEM VU CHINH:
 *   - 1. Render Sidebar ben trai chua danh sach cac bang Z de nguoi dung lua chon.
 *   - 2. Ho tro tim kiem bang nhanh (sidebarSearch) va thu nho/mo rong menu (collapsed).
 *   - 3. Xu ly tu dong can chinh chieu cao khi nhung vao SAP Fiori Launchpad (measureShellOverlap).
 *   - 4. Bọc vung chua noi dung chinh (children - TableMaintenancePage) o ben phai.
 * ============================================================================
 */

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

/* ============================================================================
 * PHAN 1: KHAI BAO PROPS CHO COMPONENT APPLAYOUT
 * ============================================================================ */

interface AppLayoutProps {
  /** Danh sach cac bang Z da duoc kich hoat truyen tu App.tsx */
  tables: TableConfig[];
  /** Bang Z hien tai dang duoc nguoi dung chon de xem/chinh sua */
  selectedTable: TableConfig | null;
  /** Co dang tai danh sach bang */
  loading: boolean;
  /** Ten user dang nhap */
  username: string;
  /** Callback ban su kien khi user click chon 1 bang tu Sidebar */
  onSelectTable: (table: TableConfig | null) => void;
  /** Callback dang xuat */
  onLogout: () => void;
  /** Component con duoc nhung vao vung noi dung chinh (TableMaintenancePage) */
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
  /* ============================================================================
   * PHAN 2: STATE VA REFS QUAN LY TRANG THAI GIAO DIEN
   * ============================================================================ */

  const rootRef = useRef<HTMLDivElement | null>(null)
  /** Trang thai thu nho (collapsed = true: 64px) hoac mo rong (collapsed = false: 272px) cua Sidebar */
  const [collapsed, setCollapsed] = useState(false)
  /** Tu khoa tim kiem bang trong o Input Search tables... */
  const [sidebarSearch, setSidebarSearch] = useState('')
  /** Khoang cach bu tru chieu cao (offset) khi bi Header cua Fiori Launchpad che khuat */
  const [shellTopOffset, setShellTopOffset] = useState(0)

  /* ============================================================================
   * PHAN 3: XU LY CAN CHINH CHIEU CAO VOI SAP FIORI LAUNCHPAD (FLP OVERLAP)
   * ============================================================================ */

  /**
   * Khi ung dung duoc nhung ben trong SAP Fiori Launchpad (s40lp1...):
   * Do FLP co thanh Shell Header co dinh tren cung, ham nay tu dong do chieu cao
   * va them paddingTop / tinh lai calc(100dvh - offset) de UI khong bi che mat.
   */
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

  /* ============================================================================
   * PHAN 4: BO LOC DANH SACH BANG THEO TU KHOA TIM KIEM
   * ============================================================================ */

  const filteredTables = tables.filter(t => {
    if (!sidebarSearch.trim()) return true
    const term = sidebarSearch.toLowerCase()
    const nameMatch = (t.TableName || '').toLowerCase().includes(term)
    const descMatch = (t.Description || '').toLowerCase().includes(term)
    return nameMatch || descMatch
  })

  /* ============================================================================
   * PHAN 5: RENDER GIAO DIEN SIDEBAR VA MAIN CONTENT
   * ============================================================================ */

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
        {/* KHU VUC 1: SIDEBAR BEN TRAI (Chua menu danh sach bang Z) */}
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
          {/* Header cua Sidebar khi o che do mo rong: Nut Menu, Tieu de va O tim kiem */}
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

          {/* Header cua Sidebar khi o che do thu nho (Collapsed) */}
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

          {/* Danh sach cac bang Z: Su dung SideNavigation cua UI5 Web Components */}
          {loading && tables.length === 0 ? (
            <AppLoadingState label="Loading tables..." variant={collapsed ? 'compact' : 'inline'} />
          ) : collapsed ? (
            /* Che do thu nho: Chi hien thi Icon */
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
            /* Che do mo rong: Hien thi ten bang, icon va danh dau active */
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

        {/* KHU VUC 2: VUNG NOI DUNG CHINH BEN PHAI (Chua TableMaintenancePage) */}
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
