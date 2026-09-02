import { internalMutation, internalQuery, type DatabaseWriter } from "./_generated/server"
import { v } from "convex/values"
import type { Doc } from "./_generated/dataModel"

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
      if (amount !== payment.amount * 100 || currency !== payment.currency) return { applied: false }
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
            q.eq(q.field("amount"), Math.round(amount / 100)),
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
        const allUsers = await ctx.db.query("users").collect()
        account = allUsers.find(u => u.email?.toLowerCase() === normalizedEmail) ?? null
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
