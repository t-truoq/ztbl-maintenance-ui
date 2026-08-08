export function normalizeSapUsername(username?: string): string {
  return String(username || '').trim().toUpperCase()
}

export function isAdminAuthUser(row: {
  Username?: string
  RoleType?: string
  ActiveFlag?: string
  Role?: string
  Status?: string
  ACTIVE_FLAG?: string
}): boolean {
  const username = normalizeSapUsername(row.Username)
  const role = normalizeSapUsername(row.RoleType || row.Role)
  const rawActiveFlag = row.ActiveFlag ?? row.ACTIVE_FLAG
  const rawStatus = row.Status

  if (!username || role !== 'ADMIN') return false

  if (rawActiveFlag !== undefined) {
    const activeFlag = normalizeSapUsername(rawActiveFlag)
    return activeFlag === 'X' || activeFlag === 'TRUE' || activeFlag === '1'
  }

  if (rawStatus !== undefined) {
    const status = normalizeSapUsername(rawStatus)
    return status === 'ACTIVE' || status === 'X' || status === 'TRUE' || status === '1'
  }

  return false
}
