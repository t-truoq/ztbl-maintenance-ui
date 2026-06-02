import { useState } from 'react'
import App from './App'
import LoginScreen from './components/LoginScreen'
import { clearCredentials } from './services/apiClient'
import { clearDomainCache } from './services/domainCache'
import { SessionUser } from './types'

export default function AuthApp() {
  const [auth, setAuth] = useState<SessionUser | null>(() => {
    try {
      const stored = sessionStorage.getItem('sap_credentials')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.username) {
          return { username: parsed.username }
        }
      }
    } catch (e) {
      console.warn('Failed to read auth session:', e)
    }
    return null
  })

  function handleLogout() {
    clearCredentials()
    clearDomainCache()
    setAuth(null)
  }

  if (!auth) {
    return <LoginScreen onLogin={setAuth} />
  }

  return (
    <App
      credentials={auth}
      onLogout={handleLogout}
    />
  )
}
