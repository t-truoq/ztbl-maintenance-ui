const STORAGE_KEY = 'ztbl-field-locks'
const LOCK_TTL_MS = 15 * 60 * 1000

interface Lock {
  username: string;
  sessionId: string;
  lockedAt: number;
  expiresAt: number;
}

type LocksMap = Record<string, Lock>;

function readAllLocks(): LocksMap {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeAllLocks(all: LocksMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

function pruneExpired(all: LocksMap): boolean {
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

export function recordKeyToString(recordKey: Record<string, any>): string {
  return JSON.stringify(recordKey, Object.keys(recordKey).sort())
}

function lockKey(tableName: string, recordKeyStr: string, fieldName: string): string {
  return `${tableName}::${recordKeyStr}::${fieldName}`
}

/** First editor wins this field until dialog closes or TTL expires */
export function acquireFieldLock(
  tableName: string,
  recordKey: Record<string, any>,
  fieldName: string,
  username: string,
  sessionId: string
): { acquired: boolean; heldBy?: string } {
  const all = readAllLocks()
  if (pruneExpired(all)) writeAllLocks(all)

  const key = lockKey(tableName, recordKeyToString(recordKey), fieldName)
  const now = Date.now()
  const existing = all[key]

  if (
    existing &&
    existing.expiresAt > now &&
    existing.username !== username &&
    existing.sessionId !== sessionId
  ) {
    return { acquired: false, heldBy: existing.username }
  }

  all[key] = { username, sessionId, lockedAt: now, expiresAt: now + LOCK_TTL_MS }
  writeAllLocks(all)
  return { acquired: true }
}

export function touchSessionLocks(sessionId: string): void {
  const all = readAllLocks()
  const now = Date.now()
  let changed = false
  for (const lock of Object.values(all)) {
    if (lock.sessionId === sessionId && lock.expiresAt > now) {
      lock.expiresAt = now + LOCK_TTL_MS
      changed = true
    }
  }
  if (changed) writeAllLocks(all)
}

export function releaseSessionLocks(sessionId: string): void {
  const all = readAllLocks()
  let changed = false
  for (const [key, lock] of Object.entries(all)) {
    if (lock.sessionId === sessionId) {
      delete all[key]
      changed = true
    }
  }
  if (changed) writeAllLocks(all)
}

/** Fields locked by other users/sessions on this record */
export function getFieldLocksForRecord(
  tableName: string,
  recordKey: Record<string, any>,
  username: string,
  sessionId: string
): Record<string, string> {
  const all = readAllLocks()
  pruneExpired(all)
  const prefix = `${tableName}::${recordKeyToString(recordKey)}::`
  const now = Date.now()
  const locks: Record<string, string> = {}

  for (const [key, lock] of Object.entries(all)) {
    if (!key.startsWith(prefix) || lock.expiresAt <= now) continue
    if (lock.username === username && lock.sessionId === sessionId) continue
    locks[key.slice(prefix.length)] = lock.username
  }

  return locks
}
