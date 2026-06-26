export interface FkValueOption {
  value: string;
  label: string;
  row: Record<string, any>;
}

const cache = new Map<string, FkValueOption[]>()

export function getFkCacheKey(configUuid: string, tableName: string, fieldName: string): string {
  return `${configUuid}|${tableName}|${fieldName}`.toUpperCase()
}

export function getCachedFkValues(configUuid: string, tableName: string, fieldName: string): FkValueOption[] | null {
  return cache.get(getFkCacheKey(configUuid, tableName, fieldName)) ?? null
}

export function setCachedFkValues(
  configUuid: string,
  tableName: string,
  fieldName: string,
  values: FkValueOption[]
): void {
  cache.set(getFkCacheKey(configUuid, tableName, fieldName), values)
}
