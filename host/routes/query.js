export function queryNumber(url, key, fallback) {
  return url.searchParams.has(key) ? Number(url.searchParams.get(key)) : fallback
}
