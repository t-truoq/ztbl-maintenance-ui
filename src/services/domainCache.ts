const cache = new Map<string, any[]>()

function cacheKey(domainName: string, searchString = ''): string {
  return `${domainName}::${(searchString || '').trim().toLowerCase()}`
}

export function getCachedDomainValues(domainName: string, searchString = ''): any[] | null {
  return cache.get(cacheKey(domainName, searchString)) ?? null
}

export function setCachedDomainValues(domainName: string, searchString: string, values: any[]): void {
  cache.set(cacheKey(domainName, searchString), values)
}

export function clearDomainCache(): void {
  cache.clear()
}
