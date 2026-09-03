/**
 * KES minor-unit helpers (Phase 3.1). Paystack speaks kobo-style minor units
 * (1 KES = 100); Convex stores whole shillings. Every amount comparison in
 * payments.ts, payments_helpers.ts, http.ts and pay-now.tsx must go through
 * these so the ×100 lives in exactly one place. Display formatting stays in
 * lib/kenya-data.ts `formatKES`.
 */

/** Whole shillings → minor units for Paystack (`2500` → `250000`). */
export function toMinorKES(amountKES: number): number {
  return Math.round(amountKES * 100)
}

/** Minor units → whole shillings (`250000` → `2500`). */
export function fromMinorKES(minor: number): number {
  return minor / 100
}

/** True when a Paystack charge matches the expected booking amount + currency. */
export function chargeMatches(amountKES: number, currency: string, tx: { amount?: number; currency?: string }): boolean {
  return tx.amount === toMinorKES(amountKES) && (tx.currency ?? 'KES') === currency
}
