/**
 * Single source for email validation (Phase 3.1). Previously `EMAIL_RE` was
 * copy-pasted in convex/payments.ts, convex/subscriptions.ts,
 * app/api/send-invite/route.ts and app/api/payment-recovery/route.ts — one of
 * them lowercased, the others didn't. Import from here instead.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** True for a plausibly valid email address (format check, not deliverability). */
export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

/** Trimmed + lowercased, for storage and comparison. */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}
