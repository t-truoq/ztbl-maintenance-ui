const STORAGE_KEY = 'ztbl-table-locks'
const LOCK_TTL_MS = 15 * 60 * 1000 // 15 minutes TTL

interface TableLock {
  username: string;
  sessionId: string;
  lockedAt: number;
  expiresAt: number;
}

type TableLocksMap = Record<string, TableLock>;

function readAllLocks(): TableLocksMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeAllLocks(all: TableLocksMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

function pruneExpired(all: TableLocksMap): boolean {
  const now = Date.now()
  let changed = false
  for (const [key, lock] of Object.entries(all)) {
    if (!lock?.expiresAt || lock.expiresAt <= now) {
      delete all[key]
      changed = true
    }
  }
  return changed
}

export function acquireTableLock(
  tableName: string,
  username: string,
  sessionId: string
): { acquired: boolean; heldBy?: string } {
  const all = readAllLocks()
  if (pruneExpired(all)) writeAllLocks(all)

  const now = Date.now()
  const existing = all[tableName]

  if (
    existing &&
    existing.expiresAt > now &&
    (existing.username !== username || existing.sessionId !== sessionId)
  ) {
    return { acquired: false, heldBy: existing.username }
  }

  all[tableName] = { username, sessionId, lockedAt: now, expiresAt: now + LOCK_TTL_MS }
  writeAllLocks(all)
  return { acquired: true }
}

export function releaseTableLock(tableName: string, sessionId: string): void {
  const all = readAllLocks()
  const existing = all[tableName]
  if (existing && existing.sessionId === sessionId) {
    delete all[tableName]
    writeAllLocks(all)
  }
}

export function getActiveTableLock(tableName: string, username: string, sessionId: string): { lockedBy: string } | null {
  const all = readAllLocks()
  pruneExpired(all)
  const existing = all[tableName]
  const now = Date.now()

  if (existing && existing.expiresAt > now) {
    if (existing.username === username && existing.sessionId === sessionId) {
      return null // It's our own lock
    }
    return { lockedBy: existing.username }
  }
  return null
}

export function touchTableLock(tableName: string, sessionId: string): void {
  const all = readAllLocks()
  const existing = all[tableName]
  const now = Date.now()
  if (existing && existing.sessionId === sessionId && existing.expiresAt > now) {
    existing.expiresAt = now + LOCK_TTL_MS
    writeAllLocks(all)
  }
}
