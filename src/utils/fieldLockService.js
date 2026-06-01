const STORAGE_KEY = 'ztbl-field-locks'
const LOCK_TTL_MS = 15 * 60 * 1000

function readAllLocks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeAllLocks(all) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

function pruneExpired(all) {
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

export function recordKeyToString(recordKey) {
  return JSON.stringify(recordKey, Object.keys(recordKey).sort())
}

function lockKey(tableName, recordKeyStr, fieldName) {
  return `${tableName}::${recordKeyStr}::${fieldName}`
}

/** First editor wins this field until dialog closes or TTL expires */
export function acquireFieldLock(tableName, recordKey, fieldName, username, sessionId) {
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

export function touchSessionLocks(sessionId) {
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

export function releaseSessionLocks(sessionId) {
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
export function getFieldLocksForRecord(tableName, recordKey, username, sessionId) {
  const all = readAllLocks()
  pruneExpired(all)
  const prefix = `${tableName}::${recordKeyToString(recordKey)}::`
  const now = Date.now()
  const locks = {}

  for (const [key, lock] of Object.entries(all)) {
    if (!key.startsWith(prefix) || lock.expiresAt <= now) continue
    if (lock.username === username && lock.sessionId === sessionId) continue
    locks[key.slice(prefix.length)] = lock.username
  }

  return locks
}
