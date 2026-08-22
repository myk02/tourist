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
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), value }))
  } catch {
    // Quota or private-mode failures must never break the page.
  }
}
