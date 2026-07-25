import { describe, it, expect } from 'vitest'
import { isAdminAuthUser, normalizeSapUsername } from './authz'

describe('authz', () => {
  it('normalizes SAP usernames before comparing with backend admin list', () => {
    expect(normalizeSapUsername(' dev-213 ')).toBe('DEV-213')
  })

  it('normalizes empty or missing SAP usernames to an empty string', () => {
    expect(normalizeSapUsername()).toBe('')
    expect(normalizeSapUsername('   ')).toBe('')
  })

  it('allows only active ADMIN rows', () => {
    expect(isAdminAuthUser({ Username: 'DEV-213', RoleType: 'ADMIN', ActiveFlag: 'X' })).toBe(true)
    expect(isAdminAuthUser({ Username: 'DEV-213', RoleType: 'USER', ActiveFlag: 'X' })).toBe(false)
    expect(isAdminAuthUser({ Username: 'DEV-213', RoleType: 'ADMIN', ActiveFlag: '' })).toBe(false)
    expect(isAdminAuthUser({ Username: '', RoleType: 'ADMIN', ActiveFlag: 'X' })).toBe(false)
  })

  it('accepts lowercase and spaced active ADMIN rows after normalization', () => {
    expect(isAdminAuthUser({ Username: ' dev-213 ', RoleType: ' admin ', ActiveFlag: ' x ' })).toBe(true)
  })

  it('rejects inactive USER rows and missing authorization fields', () => {
    expect(isAdminAuthUser({ Username: 'DEV-213', RoleType: 'USER', ActiveFlag: '' })).toBe(false)
    expect(isAdminAuthUser({ Username: 'DEV-213', ActiveFlag: 'X' })).toBe(false)
    expect(isAdminAuthUser({ Username: 'DEV-213', RoleType: 'ADMIN' })).toBe(false)
    expect(isAdminAuthUser({ RoleType: 'ADMIN', ActiveFlag: 'X' })).toBe(false)
  })
})
