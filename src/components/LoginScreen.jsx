import React, { useState, useEffect } from 'react'
import {
  Card,
  Title,
  Input,
  Button,
  MessageStrip,
  BusyIndicator,
  FlexBox,
  Label,
  Text
} from '@ui5/webcomponents-react'
import { testLogin, clearCredentials } from '../services/sapApi'

export default function LoginScreen({ onLogin }) {
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
      onLogin({ username: result.username })
    } else {
      setError(result.message)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !loading) handleLogin()
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f6f7',
        padding: '1rem'
      }}
    >
      <Card style={{ width: '420px', padding: '2rem', position: 'relative' }}>
        {loading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.7)',
              borderRadius: 'inherit',
              zIndex: 1
            }}
          >
            <BusyIndicator active size="Medium" />
          </div>
        )}

        <FlexBox direction="Column" style={{ gap: '1.25rem' }}>
          <div style={{ textAlign: 'center' }}>
            <Title level="H3" style={{ marginBottom: '0.35rem' }}>
              SAP Dynamic Table Maintenance
            </Title>
            <Text style={{ color: '#6a7075', fontSize: '0.875rem' }}>
              S40 System | Client 324
            </Text>
          </div>

          {error && (
            <MessageStrip design="Negative" onClose={() => setError('')}>
              {error}
            </MessageStrip>
          )}

          <FlexBox direction="Column" style={{ gap: '0.35rem' }}>
            <Label showColon>Username</Label>
            <Input
              placeholder="SAP Username"
              value={username}
              onInput={e => setUsername(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
          </FlexBox>

          <FlexBox direction="Column" style={{ gap: '0.35rem' }}>
            <Label showColon>Password</Label>
            <Input
              type="Password"
              placeholder="SAP Password"
              value={password}
              onInput={e => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
          </FlexBox>

          <Button
            design="Emphasized"
            style={{ width: '100%', marginTop: '0.25rem' }}
            onClick={handleLogin}
            disabled={loading}
          >
            Log On
          </Button>
        </FlexBox>
      </Card>
    </div>
  )
}
