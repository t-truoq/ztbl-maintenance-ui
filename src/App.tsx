import { useState, useEffect } from 'react'
import { getTables, normalizeConfigUuid } from './services/tableConfigApi'
import { clearCredentials, isDeployedOnSAP } from './services/apiClient'
import { clearDomainCache } from './services/domainCache'
import AppLayout from './components/AppLayout'
import TableMaintenancePage from './pages/TableMaintenance/TableMaintenancePage'
import { SessionUser, TableConfig } from './types'

/* ============================================================================
 * PHAN 1: KHAI BAO PROPS CHO COMPONENT APP
 * ============================================================================ */

interface AppProps {
  /** Thong tin nguoi dung dang dang nhap (username, role) */
  credentials: SessionUser | null;
  /** Callback thuc hien khi nguoi dung bam dang xuat */
  onLogout?: () => void;
}

export default function App({ credentials, onLogout }: AppProps) {
  /* ============================================================================
   * PHAN 2: QUAN LY STATE TOAN CUC (GLOBAL STATES)
   * ============================================================================ */

  /** Danh sach toan bo cac bang Z da duoc kich hoat tren he thong */
  const [tables, setTables] = useState<TableConfig[]>([])

  /**
   * Bang Z hien tai ma nguoi dung dang chon de xem / chinh sua du lieu.
   * [Khoi phuc phien]: Doc lai bang da chon tu sessionStorage de khi F5 khong bi mat bang dang xem.
   */
  const [selectedTable, setSelectedTable] = useState<TableConfig | null>(() => {
    try {
      const stored = sessionStorage.getItem('sap_selected_table')
      if (stored) return JSON.parse(stored)
    } catch (e) {
      console.warn('Failed to load selected table from sessionStorage:', e)
    }
    return null
  })

  /** Trang thai dang tai danh sach bang tu SAP Backend */
  const [loading, setLoading] = useState(false)

  /* ============================================================================
   * PHAN 3: VONG DOI COMPONENT (LIFECYCLE & EFFECTS)
   * ============================================================================ */

  /**
   * [Effect 1]: Khi khoi dong hoac khi user dang nhap thay doi:
   * Neu da co thong tin dang nhap (hoac dang chay tren SAP Fiori Launchpad) -> Tu dong tai danh sach bang.
   */
  useEffect(() => {
    if (credentials || isDeployedOnSAP()) {
      loadTables()
    } else {
      setTables([])
    }
  }, [credentials?.username])

  /**
   * [Effect 2]: Lang nghe su kien 'sap-session-expired' duoc phat ra tu apiClient.ts
   * Khi token SAP het han (HTTP 401) -> Tu dong thuc hien Force Logout de bao mat.
   */
  useEffect(() => {
    const handler = () => {
      handleForceLogout()
    }
    window.addEventListener('sap-session-expired', handler)
    return () => window.removeEventListener('sap-session-expired', handler)
  }, [])

  /* ============================================================================
   * PHAN 4: CAC HAM XU LY LOGIC CHINH (HANDLERS)
   * ============================================================================ */

  /**
   * [Ham 1: Tai danh sach bang]: Goi OData Service qua getTables() de lay danh sach bang Z.
   * Dong thoi dong bo lai thong tin bang dang chon neu co su thay doi tren server.
   */
  async function loadTables() {
    try {
      setLoading(true)
      const result = await getTables()
      setTables(result)
      setSelectedTable(current => {
        if (!current) return current
        const refreshed = result.find(table => table.ConfigUuid === current.ConfigUuid)
        if (!refreshed) return current
        if (JSON.stringify(current) === JSON.stringify(refreshed)) return current
        return refreshed
      })
    } catch {
      // Xu ly im lang o cap do khung shell, loi chi tiet se duoc TableMaintenancePage hien thi
      setTables([])
    } finally {
      setLoading(false)
    }
  }

  /**
   * [Ham 2: Chon bang]: Xu ly khi nguoi dung click chon 1 bang tu Sidebar ben trai.
   * Chuan hoa ConfigUuid, cap nhat state va luu vao sessionStorage.
   */
  function handleSelectTable(table: TableConfig | null) {
    if (!table) {
      setSelectedTable(null)
      try {
        sessionStorage.removeItem('sap_selected_table')
      } catch (e) {
        console.warn('Failed to remove selected table from sessionStorage:', e)
      }
      return
    }
    const normalizedUuid = normalizeConfigUuid(table.ConfigUuid)
    const updated = { ...table, ConfigUuid: normalizedUuid }
    setSelectedTable(updated)
    try {
      sessionStorage.setItem('sap_selected_table', JSON.stringify(updated))
    } catch (e) {
      console.warn('Failed to save selected table to sessionStorage:', e)
    }
  }

  /**
   * [Ham 3: Bat buoc dang xuat]: Xoa toan bo thong tin dang nhap, bo nho dem domain, bang dang chon.
   */
  function handleForceLogout() {
    clearCredentials()
    clearDomainCache()
    setTables([])
    setSelectedTable(null)
    try {
      sessionStorage.removeItem('sap_selected_table')
    } catch (e) {
      console.warn('Failed to remove selected table from sessionStorage:', e)
    }
    onLogout?.()
  }

  /**
   * [Ham 4: Dang xuat chu dong]: Goi khi nguoi dung bam nut Logout tren thanh Header.
   */
  function handleLogout() {
    handleForceLogout()
  }

  /* ============================================================================
   * PHAN 5: RENDER GIAO DIEN (UI RENDER)
   * ============================================================================ */

  return (
    <AppLayout
      tables={tables}
      selectedTable={selectedTable}
      loading={loading}
      username={credentials?.username || ''}
      onSelectTable={handleSelectTable}
      onLogout={handleLogout}
    >
      {/* Man hinh noi dung chinh chua toan bo bang du lieu, cac tab chuc nang va thao tac CRUD */}
      <TableMaintenancePage
        selectedTable={selectedTable}
        tables={tables}
        username={credentials?.username || ''}
        onRefreshTableList={loadTables}
        onSelectTable={handleSelectTable}
      />
    </AppLayout>
  )
}
