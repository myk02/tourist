/**
 * Convex document ids are `<table>_<random>` — anything that doesn't look
 * like one (a hand-typed URL, a stale link, an injection attempt) is garbage
 * and must not be sent to Convex, which throws on malformed ids and would
 * crash the whole page. Use this before querying by a route param.
 */
const CONVEX_ID = /^[A-Za-z0-9]+_[A-Za-z0-9_-]{8,64}$/

export function isValidConvexId(value: string | undefined | null): value is string {
  return typeof value === 'string' && CONVEX_ID.test(value)
}
