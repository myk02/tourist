/**
 * Tiny localStorage cache for offline tolerance. The in-trip surfaces
 * (checklist, live tracking, gated pages) must survive dead zones — network
 * coverage doesn't follow the itinerary. Every entry stores a timestamp so
 * the UI can honestly say how old a saved copy is.
 */

export interface CacheEntry<T> {
  at: number
  value: T
}

export function readCache<T>(key: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CacheEntry<T>
    if (typeof parsed?.at !== 'number' || !('value' in parsed)) return null
    return parsed
  } catch {
    return null
  }
}

export function writeCache(key: string, value: unknown): void {
  try {
    const payload = JSON.stringify({ at: Date.now(), value })
    // Guard roughly against 5MB quota: if payload itself is huge, evict oldest
    // track snapshots first. Safari private mode may throw on setItem.
    try {
      localStorage.setItem(key, payload)
    } catch (e) {
      const isQuota =
        e instanceof DOMException &&
        (e.name === 'QuotaExceededError' || e.code === 22 || e.code === 1014)
      if (!isQuota) throw e
      // Evict oldest kt-track-* entries until it fits or we run out.
      const trackKeys = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k?.startsWith('kt-track-')) trackKeys.push(k)
      }
      // Sort by stored timestamp so oldest goes first.
      trackKeys.sort((a, b) => {
        try {
          const av = JSON.parse(localStorage.getItem(a) || '{}').at ?? 0
          const bv = JSON.parse(localStorage.getItem(b) || '{}').at ?? 0
          return av - bv
        } catch {
          return 0
        }
      })
      for (const k of trackKeys) {
        try {
          localStorage.removeItem(k)
          localStorage.setItem(key, payload)
          return
        } catch {
          continue
        }
      }
    }
  } catch {
    // Quota or private-mode failures must never break the page.
  }
}

/** Returns null if the entry is missing or older than maxAgeMs. */
export function readCacheFresh<T>(key: string, maxAgeMs: number): CacheEntry<T> | null {
  const entry = readCache<T>(key)
  if (!entry) return null
  if (Date.now() - entry.at > maxAgeMs) return null
  return entry
}
