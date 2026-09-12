/**
 * Minimal in-memory sliding window rate limiter.
 * Per-process, per-instance — sufficient for Vercel's single-concurrency
 * functions. For multi-instance strict counts, swap for Upstash/Redis.
 */
const buckets = new Map<string, { count: number; resetAt: number }>()

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; remaining: number } {
  const now = Date.now()
  // Prune expired entries opportunistically to avoid unbounded growth
  if (buckets.size > 1000 && Math.random() < 0.1) {
    for (const [k, v] of buckets) if (now > v.resetAt) buckets.delete(k)
  }
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

export function getClientKey(request: Request, userId?: string | null): string {
  if (userId) return `uid:${userId}`
  // x-forwarded-for first entry is client-controllable — use only as fallback
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || request.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown'
  // Avoid global "unknown" bucket blocking all anonymous users — add tiny randomness bucket
  if (ip === 'unknown') {
    const ua = request.headers.get('user-agent')?.slice(0, 40) ?? 'no-ua'
    return `ip:unknown:${ua}`
  }
  return `ip:${ip}`
}
