import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'sessionStorage', {
    value: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn()
    },
    configurable: true
  })
})

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      defaults: { headers: { common: {} } },
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() }
      },
      get: vi.fn(),
      post: vi.fn()
    })),
    isAxiosError: (error: any) => Boolean(error?.isAxiosError)
  }
}))

import {
  formatActionErrorMessage,
  getFriendlyErrorMessage,
  getSapErrorMessage,
  isCsrfError
} from './apiClient'

function axiosError(overrides: Record<string, any>): any {
  return {
    isAxiosError: true,
    message: 'Request failed',
    ...overrides
  }
}

describe('apiClient friendly error messages', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('returns plain Error messages for non-Axios errors', () => {
    expect(getFriendlyErrorMessage(new Error('Local failure'))).toBe('Local failure')
  })

  it('returns a network message when no response exists', () => {
    expect(getFriendlyErrorMessage(axiosError({ response: undefined }))).toBe(
      'Cannot connect to SAP system. Please check your connection.'
    )
  })

  it('returns a session-expired message for 401 responses', () => {
    expect(getFriendlyErrorMessage(axiosError({ response: { status: 401, data: {} } }))).toBe(
      'Session expired. Please login again.'
    )
  })

  it('returns a CSRF retry message for 403 CSRF responses', () => {
    expect(getFriendlyErrorMessage(axiosError({
      response: {
        status: 403,
        data: {
          error: {
            '@SAP__common.ExceptionCategory': 'CSRF_Token_Missing'
          }
        }
      }
    }))).toBe('Security token expired. Please try again.')
  })

  it('returns a permission message for non-CSRF 403 responses', () => {
    expect(getFriendlyErrorMessage(axiosError({ response: { status: 403, data: {} } }))).toContain(
      'You do not have permission'
    )
  })

  it('returns a table-lock message for 423 responses', () => {
    expect(getFriendlyErrorMessage(axiosError({ response: { status: 423, data: {} } }))).toContain(
      'table configuration is locked'
    )
  })

  it('uses SAP server messages for 500 responses', () => {
    expect(getFriendlyErrorMessage(axiosError({
      response: {
        status: 500,
        data: { error: { message: 'Backend exploded' } }
      }
    }))).toBe('Backend exploded')
  })

  it('enhances ABAP JSON format errors', () => {
    expect(formatActionErrorMessage('Invalid format in JSON for field VALID_FROM')).toContain('YYYYMMDD')
  })

  it('detects CSRF errors by message text', () => {
    expect(isCsrfError({
      response: {
        data: {
          error: {
            message: 'CSRF token validation failed'
          }
        }
      }
    })).toBe(true)
  })

  it('reads SAP error messages from common response shapes', () => {
    expect(getSapErrorMessage({ response: { data: { error: { message: { value: 'Nested SAP message' } } } } })).toBe(
      'Nested SAP message'
    )
    expect(getSapErrorMessage({ response: { data: { message: 'Flat SAP message' } } })).toBe('Flat SAP message')
  })
})
