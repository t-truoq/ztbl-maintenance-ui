import { useState, useEffect } from 'react'
import { getTables, normalizeConfigUuid } from './services/tableConfigApi'
import { clearCredentials } from './services/apiClient'
import { clearDomainCache } from './services/domainCache'
import AppLayout from './components/AppLayout'
import TableMaintenancePage from './pages/TableMaintenance/TableMaintenancePage'
import { SessionUser, TableConfig } from './types'

interface AppProps {
  credentials: SessionUser | null;
  onLogout?: () => void;
}

export default function App({ credentials, onLogout }: AppProps) {
  const [tables, setTables] = useState<TableConfig[]>([])
  const [selectedTable, setSelectedTable] = useState<TableConfig | null>(() => {
    try {
      const stored = sessionStorage.getItem('sap_selected_table')
      if (stored) return JSON.parse(stored)
    } catch (e) {
      console.warn('Failed to load selected table from sessionStorage:', e)
    }
    return null
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadTables()
  }, [])

  useEffect(() => {
    const handler = () => {
      handleForceLogout()
    }
    window.addEventListener('sap-session-expired', handler)
    return () => window.removeEventListener('sap-session-expired', handler)
  }, [])

  async function loadTables() {
    try {
      setLoading(true)
      const result = await getTables()
      const activeTables = result.filter(t => t.ActiveFlag === 'X' || (t as any).active_flag === 'X')
      setTables(activeTables)
    } catch {
      // Quietly handle table loading failure on shell level, TablePage will show error
      setTables([])
    } finally {
      setLoading(false)
    }
  }

  function handleSelectTable(table: TableConfig) {
    const normalizedUuid = normalizeConfigUuid(table.ConfigUuid)
    const updated = { ...table, ConfigUuid: normalizedUuid }
    setSelectedTable(updated)
    try {
      sessionStorage.setItem('sap_selected_table', JSON.stringify(updated))
    } catch (e) {
      console.warn('Failed to save selected table to sessionStorage:', e)
    }
  }

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

  function handleLogout() {
    handleForceLogout()
  }

  return (
    <AppLayout
      tables={tables}
      selectedTable={selectedTable}
      loading={loading}
      username={credentials?.username || ''}
      onSelectTable={handleSelectTable}
      onLogout={handleLogout}
    >
      <TableMaintenancePage
        selectedTable={selectedTable}
        username={credentials?.username || ''}
        onRefreshTableList={loadTables}
      />
    </AppLayout>
  )
}
