import { useState, useEffect } from 'react'
import App from './App'
import LocalBasicAuthPrompt from './components/LocalBasicAuthPrompt'
import {
  clearCredentials,
  SAP_SERVICE,
  SAP_CLIENT,
  isDeployedOnSAP
} from './services/apiClient'
import { clearDomainCache } from './services/domainCache'
import { SessionUser } from './types'

function getShellUsername(): string {
  const shellUser = (window as any).sap?.ushell?.Container?.getUser?.()
  const userId = shellUser?.getId?.()
  if (userId) return userId
  const fullName = shellUser?.getFullName?.()
  if (fullName && fullName !== 'Default User') return fullName
  return ''
}

/**
 * When deployed on the SAP server, the user is already authenticated
 * via FLP/SSO session. Try a probe request using only session cookies
 * (withCredentials: true, no Basic Auth header).
 * Returns the SAP username if session is valid, null otherwise.
 */
async function probeSSOSession(): Promise<string | null> {
  const url =
    `${SAP_SERVICE}/TableConfig` +
    `?$top=1&$select=TableName&sap-client=${encodeURIComponent(SAP_CLIENT)}`
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'include', // send SAP session cookies
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'sap-client': SAP_CLIENT
      }
    })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('json')) return null
    const data = await res.json()
    if (!Array.isArray(data?.value)) return null
    // Probe succeeded — read username from SAP header if available,
    // fall back to 'sso-user' as a safe placeholder
    return getShellUsername() || res.headers.get('x-sap-login-name') || 'SAP User'
  } catch {
    return null
  }
}

export default function AuthApp() {
  const [auth, setAuth] = useState<SessionUser | null>(() => {
    try {
      const stored = sessionStorage.getItem('sap_credentials')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.username) return { username: parsed.username }
      }
    } catch (e) {
      console.warn('Failed to read auth session:', e)
    }
    return null
  })

  // SSO auto-login: when deployed on SAP server, skip the login screen
  const [ssoChecking, setSSOChecking] = useState(() => isDeployedOnSAP() && !auth)

  useEffect(() => {
    if (!ssoChecking) return
    let cancelled = false

    ;(async () => {
      const ssoUsername = await probeSSOSession()
      if (cancelled) return

      if (ssoUsername) {
        // SSO session valid — mark as authenticated without Basic Auth
        // apiClient already uses withCredentials:true so cookies are sent automatically
        setAuth({ username: ssoUsername })
      }
      setSSOChecking(false)
    })()

    return () => { cancelled = true }
  }, [])

  function handleLogout() {
    clearCredentials()
    clearDomainCache()
    setAuth(null)
    // When on SAP server, redirect to FLP logout URL
    if (isDeployedOnSAP()) {
      window.location.href = '/sap/public/bc/icf/logoff'
    }
  }

  // Show loading spinner while probing SSO session
  if (ssoChecking) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#f4f6f8',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '3px solid #e5e5e5',
          borderTop: '3px solid #0a6ed1',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite'
        }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <p style={{ color: '#6a7075', fontSize: '0.9rem' }}>Connecting to SAP system...</p>
      </div>
    )
  }

  if (!auth) {
    if (!isDeployedOnSAP()) {
      return (
        <>
          <App
            credentials={null}
            onLogout={handleLogout}
          />
          <LocalBasicAuthPrompt
            origin={window.location.origin}
            onLogin={setAuth}
          />
        </>
      )
    }

    return (
      <App
        credentials={{ username: getShellUsername() || 'SAP User' }}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <App
      credentials={auth}
      onLogout={handleLogout}
    />
  )
}
