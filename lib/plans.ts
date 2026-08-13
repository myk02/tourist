/**
 * Prepaid KenyaTrace plans — single source of truth for pricing.
 *
 * Both the Convex backend (convex/subscriptions.ts) and the pricing UI
 * (components/kenyatrace/paywall.tsx) import this map, so the amount a user
 * is charged can never drift from what the UI displays.
 */
export const PLAN_PRICES: Record<number, number> = {
  7: 100, // KES 100 for 7 days
  30: 400, // KES 400 for 30 days
}

/**
 * Free-trial length in days. The trial is anchored at sign-up (server-side
 * `trialEndsAt` = sign-up time + this), so it keeps counting down even if the
 * user never signs in again.
 */
export const TRIAL_DAYS = 30

export const DAY_MS = 86400000
