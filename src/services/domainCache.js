const cache = new Map()

function cacheKey(domainName, searchString = '') {
  return `${domainName}::${(searchString || '').trim().toLowerCase()}`
}

export function getCachedDomainValues(domainName, searchString = '') {
  return cache.get(cacheKey(domainName, searchString)) ?? null
}

export function setCachedDomainValues(domainName, searchString, values) {
  cache.set(cacheKey(domainName, searchString), values)
}

export function clearDomainCache() {
  cache.clear()
}
