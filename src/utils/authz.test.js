import { describe, it, expect } from 'vitest'
import { isAdminAuthUser, normalizeSapUsername } from './authz'

describe('authz', () => {
  it('normalizes SAP usernames before comparing with backend admin list', () => {
    expect(normalizeSapUsername(' dev-213 ')).toBe('DEV-213')
  })

  it('allows only active ADMIN rows', () => {
    expect(isAdminAuthUser({ Username: 'DEV-213', RoleType: 'ADMIN', ActiveFlag: 'X' })).toBe(true)
    expect(isAdminAuthUser({ Username: 'DEV-213', RoleType: 'USER', ActiveFlag: 'X' })).toBe(false)
    expect(isAdminAuthUser({ Username: 'DEV-213', RoleType: 'ADMIN', ActiveFlag: '' })).toBe(false)
    expect(isAdminAuthUser({ Username: '', RoleType: 'ADMIN', ActiveFlag: 'X' })).toBe(false)
  })
})
