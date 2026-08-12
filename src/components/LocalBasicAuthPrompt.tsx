import { useState, KeyboardEvent } from 'react'
import { testLogin } from '../services/apiClient'

interface LocalBasicAuthPromptProps {
  origin: string;
  onLogin: (credentials: { username: string }) => void;
}

export default function LocalBasicAuthPrompt({ origin, onLogin }: LocalBasicAuthPromptProps) {
  const [username, setUsername] = useState('dev')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    if (!username.trim() || !password) {
      setError('Enter username and password')
      return
    }

    setLoading(true)
    setError('')
    const result = await testLogin(username.trim(), password)
    setLoading(false)

    if (result.success) {
      onLogin({ username: result.username || username.trim() })
      return
    }

    setError(result.message || 'Sign in failed')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !loading) handleLogin()
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.55)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Segoe UI, Arial, sans-serif'
    }}>
      <div style={{
        width: 320,
        background: '#1f1f1f',
        color: '#fff',
        borderRadius: 10,
        padding: '24px 20px 20px',
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.45)',
        boxSizing: 'border-box'
      }}>
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Sign in
        </div>
        <div style={{ fontSize: 13, marginBottom: 18, color: '#fff' }}>
          {origin}
        </div>

        <label style={{
          display: 'grid',
          gridTemplateColumns: '58px 1fr',
          alignItems: 'center',
          gap: 8,
          marginBottom: 12,
          fontSize: 12,
          fontWeight: 600
        }}>
          Username
          <input
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            autoFocus
            disabled={loading}
            style={inputStyle}
          />
        </label>

        <label style={{
          display: 'grid',
          gridTemplateColumns: '58px 1fr',
          alignItems: 'center',
          gap: 8,
          marginBottom: 16,
          fontSize: 12,
          fontWeight: 600
        }}>
          Password
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
            style={inputStyle}
          />
        </label>

        {error && (
          <div style={{ color: '#ff8a8a', fontSize: 12, margin: '-4px 0 14px 66px' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            type="button"
            disabled={loading}
            onClick={handleLogin}
            style={{
              border: 0,
              borderRadius: 18,
              background: '#a7c7ff',
              color: '#092d5c',
              height: 36,
              padding: '0 18px',
              fontWeight: 500,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  )
}

const inputStyle = {
  width: '100%',
  height: 36,
  borderRadius: 8,
  border: '1px solid #858585',
  background: '#232323',
  color: '#fff',
  outline: 'none',
  padding: '0 10px',
  boxSizing: 'border-box',
  fontSize: 14
} as const
