/**
 * Minimal in-memory sliding window rate limiter.
 * Per-process, per-instance — sufficient for Vercel's single-concurrency
 * functions. For multi-instance strict counts, swap for Upstash/Redis.
 */
const buckets = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number } {
  const now = Date.now()
  const entry = buckets.get(key)
  if (!entry || now > entry.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { ok: true, remaining: limit - 1 }
  }
  if (entry.count >= limit) {
    return { ok: false, remaining: 0 }
  }
  entry.count++
  return { ok: true, remaining: limit - entry.count }
}

export function getClientKey(request: Request): string {
  // Prefer Clerk user id when available via header set by Clerk; fallback to IP.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
  return ip
}
