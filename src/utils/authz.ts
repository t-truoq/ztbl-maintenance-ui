export function normalizeSapUsername(username?: string): string {
  return String(username || '').trim().toUpperCase()
}

export function isAdminAuthUser(row: { Username?: string; RoleType?: string; ActiveFlag?: string }): boolean {
  return (
    normalizeSapUsername(row.Username) !== '' &&
    normalizeSapUsername(row.RoleType) === 'ADMIN' &&
    normalizeSapUsername(row.ActiveFlag) === 'X'
  )
}
