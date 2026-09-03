import { internalAction, internalMutation, internalQuery, type DatabaseWriter } from "./_generated/server"
import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"
import { internal } from "./_generated/api"
import { chargeMatches, fromMinorKES } from "../lib/money"

/**
 * Internal helpers for `convex/payments.ts`. Kept in a separate module so the
 * actions can reference them without creating a type-inference cycle (the
 * codebase pattern used by the scraper).
 *
 * They are NOT callable from the client — only from Convex actions and the
 * Paystack webhook.
 */

/** Marks the payment + booking paid (idempotent). */
async function markPaymentPaid(db: DatabaseWriter, payment: Doc<"payments">) {
  if (payment.status === "paid") return
  const now = Date.now()
  await db.patch(payment._id, { status: "paid", paidAt: now })
  const booking = await db.get(payment.bookingId)
  if (booking && booking.status !== "cancelled") {
    await db.patch(booking._id, {
      status: "paid",
      paymentMethod: "paystack",
      paidAt: now,
      paymentReference: payment.reference,
    })
  }
}

/** Server-side read used by actions — never callable from the client. */
export const getForVerify = internalQuery({
  args: { paymentId: v.id("payments"), ownerId: v.string() },
  handler: async (ctx, { paymentId, ownerId }) => {
    const payment = await ctx.db.get(paymentId)
    if (!payment || payment.ownerId !== ownerId) return null
    return payment
  },
})

/** Server-side write used by actions — marks payment + booking paid. */
export const markPaid = internalMutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, { paymentId }) => {
    const payment = await ctx.db.get(paymentId)
    if (!payment || payment.status === "paid") return
    await markPaymentPaid(ctx.db, payment)
  },
})

/**
 * Webhook path — matches the payment by reference first, then falls back to a
 * pending payment for the same customer, amount and currency (covers the rare
 * case where a retry regenerated the reference while a charge for the previous
 * one was still in flight). Amount arrives in minor units.
 *
 * The fallback is scoped as tightly as the charge allows: prefer payments
 * whose owner is the account registered with the charge's customer email,
 * then payments whose checkout email matches. Without the owner scope, two
 * same-priced bookings on different accounts could settle each other.
 */
export const markPaidByCharge = internalMutation({
  args: { reference: v.string(), email: v.string(), amount: v.number(), currency: v.string() },
  handler: async (ctx, { reference, email, amount, currency }) => {
    let payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", q => q.eq("reference", reference))
      .first()
    if (payment) {
      // Direct reference match — still validate amount/currency before crediting.
      if (payment.status === "paid") return { applied: false }
      if (!chargeMatches(payment.amount, payment.currency, { amount, currency })) return { applied: false }
    }
    if (!payment) {
      // Most recent attempt first — the regenerated reference always belongs
      // to the latest `initialize` call. Ignore stale pendings older than a
      // week so abandoned checkouts can't absorb unrelated charges.
      // Fallback is deliberately strict: if multiple same-price pendings exist
      // we do NOT guess — caller must rely on exact reference match.
      const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
      const normalizedEmail = email.toLowerCase().trim()
      const candidates = await ctx.db
        .query("payments")
        .withIndex("by_status", q => q.eq("status", "pending"))
        .filter(q =>
          q.and(
            q.eq(q.field("amount"), fromMinorKES(amount)),
            q.eq(q.field("currency"), currency),
            q.gte(q.field("createdAt"), weekAgo),
          ),
        )
        .order("desc")
        .take(50)
      let account = await ctx.db
        .query("users")
        .withIndex("by_email", q => q.eq("email", email))
        .first()
      if (!account && normalizedEmail !== email) {
        account = await ctx.db
          .query("users")
          .withIndex("by_email", q => q.eq("email", normalizedEmail))
          .first()
      }
      if (!account) {
        // No indexed match — refuse to guess rather than scanning every user.
        // The exact-reference path above is the trusted path; a fallback that
        // walks the whole users table is O(N) per webhook and risks cross-
        // account settlement if two users share an email prefix.
        return { applied: false }
      }
      const ownerCandidates = account ? candidates.filter(p => p.ownerId === account!.clerkId) : []
      const emailCandidates = candidates.filter(p => p.email?.toLowerCase() === normalizedEmail)
      // Only fallback when uniquely identified — prevents cross-booking settlement
      if (ownerCandidates.length === 1) {
        payment = ownerCandidates[0]
      } else if (emailCandidates.length === 1) {
        payment = emailCandidates[0]
      } else {
        // Ambiguous — require exact reference, do not guess
        return { applied: false }
      }
    }
    if (!payment || payment.status === "paid") return { applied: false }
    await markPaymentPaid(ctx.db, payment)
    return { applied: true }
  },
})

/** Pending payments older than the grace window, for the reconcile cron. */
export const stalePendings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - 30 * 60 * 1000
    const pendings = await ctx.db
      .query("payments")
      .withIndex("by_status", q => q.eq("status", "pending"))
      .order("desc")
      .take(50)
    return pendings
      .filter(p => p.createdAt < cutoff)
      .map(p => ({ _id: p._id, reference: p.reference, amount: p.amount, currency: p.currency }))
  },
})

/**
 * Cron entry point: re-verifies stale pending payments with Paystack and marks
 * the settled ones paid, so a closed-tab checkout self-heals without support.
 * Unverifiable rows are left pending for the next run (never auto-paid).
 */
export const reconcileStale = internalAction({
  args: {},
  handler: async (ctx): Promise<{ checked: number; paid: number }> => {
    const secret = process.env.PAYSTACK_SECRET_KEY
    if (!secret) return { checked: 0, paid: 0 }
    const pendings: { _id: Doc<"payments">["_id"]; reference: string; amount: number; currency: string }[] =
      await ctx.runQuery(internal.payments_helpers.stalePendings, {})
    let paid = 0
    for (const p of pendings) {
      try {
        const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(p.reference)}`, {
          headers: { Authorization: `Bearer ${secret}` },
        })
        if (!res.ok) continue
        const data = await res.json().catch(() => null)
        const tx = data?.data
        if (
          data?.status === true &&
          tx?.status === "success" &&
          tx?.reference === p.reference &&
          chargeMatches(p.amount, p.currency, tx ?? {})
        ) {
          await ctx.runMutation(internal.payments_helpers.markPaid, { paymentId: p._id })
          paid++
        }
      } catch {
        // Network failure — leave pending for the next run.
      }
    }
    return { checked: pendings.length, paid }
  },
})
