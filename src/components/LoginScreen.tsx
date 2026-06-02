import { useState, useEffect, KeyboardEvent } from 'react'
import {
  Input,
  Button,
  MessageStrip,
  BusyIndicator,
  Label
} from '@ui5/webcomponents-react'
import { testLogin, clearCredentials } from '../services/sapApi'

interface LoginScreenProps {
  onLogin: (credentials: { username: string }) => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    clearCredentials()
  }, [])

  async function handleLogin() {
    if (!username.trim() || !password) {
      setError('Please enter username and password')
      return
    }
    setLoading(true)
    setError('')
    const result = await testLogin(username.trim(), password)
    setLoading(false)
    if (result.success) {
      onLogin({ username: result.username || '' })
    } else {
      setError(result.message || 'Login failed')
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.key === 'Enter' && !loading) handleLogin()
  }

  return (
    <div className="sap-login-wrapper">
      <style>{`
        .sap-login-wrapper {
          position: fixed;
          inset: 0;
          width: 100vw;
          height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f3f5f7;
          font-family: "72", "72full", Arial, Helvetica, sans-serif;
          z-index: 9999;
          box-sizing: border-box;
        }

        .sap-login-card {
          width: 420px;
          max-width: 90%;
          background: #ffffff;
          border: 1px solid #d9d9d9;
          border-radius: 8px;
          padding: 2.5rem 2rem;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
          position: relative;
          box-sizing: border-box;
          text-align: left;
        }

        .sap-login-header {
          text-align: center;
          margin-bottom: 2rem;
        }

        .sap-login-title {
          color: #32363a;
          font-size: 1.35rem;
          font-weight: bold;
          margin: 0 0 0.5rem 0;
          font-family: inherit;
        }

        .sap-login-subtitle {
          color: #6a7075;
          font-size: 0.875rem;
          margin: 0;
          font-family: inherit;
        }

        .sap-login-form-group {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
        }

        .sap-login-label {
          color: #32363a;
          font-size: 0.875rem;
          font-weight: normal;
        }

        ui5-input {
          width: 100%;
        }

        .sap-login-btn-container {
          margin-top: 1.75rem;
        }

        .sap-login-card-loading {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.75);
          border-radius: 8px;
          z-index: 100;
        }
      `}</style>

      <div className="sap-login-card">
        {loading && (
          <div className="sap-login-card-loading">
            <BusyIndicator active size="M" />
          </div>
        )}

        <div className="sap-login-header">
          <h1 className="sap-login-title">SAP Dynamic Table Maintenance</h1>
          <p className="sap-login-subtitle">S40 System | Client 324</p>
        </div>

        {error && (
          <div style={{ marginBottom: '1.25rem' }}>
            <MessageStrip design="Negative" onClose={() => setError('')}>
              {error}
            </MessageStrip>
          </div>
        )}

        <div className="sap-login-form-group">
          <Label className="sap-login-label" showColon>Username</Label>
          <Input
            placeholder="SAP Username"
            value={username}
            onInput={(e: any) => setUsername(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
        </div>

        <div className="sap-login-form-group">
          <Label className="sap-login-label" showColon>Password</Label>
          <Input
            type="Password"
            placeholder="SAP Password"
            value={password}
            onInput={(e: any) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
        </div>

        <div className="sap-login-btn-container">
          <Button
            design="Emphasized"
            style={{ width: '100%', height: '36px' }}
            onClick={handleLogin}
            disabled={loading}
          >
            Log On
          </Button>
        </div>
      </div>
    </div>
  )
}
