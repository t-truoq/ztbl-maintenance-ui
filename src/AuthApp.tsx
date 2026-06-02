import { useState } from 'react'
import App from './App'
import LoginScreen from './components/LoginScreen'
import { clearCredentials } from './services/sapApi'
import { clearDomainCache } from './services/domainCache'
import { SessionUser } from './types'

export default function AuthApp() {
  const [auth, setAuth] = useState<SessionUser | null>(null)

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
