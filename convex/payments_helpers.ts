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
 * pending payment for the same customer email, amount and currency (covers
 * the rare case where a retry regenerated the reference while a charge for
 * the previous one was still in flight). Amount arrives in minor units.
 */
export const markPaidByCharge = internalMutation({
  args: { reference: v.string(), email: v.string(), amount: v.number(), currency: v.string() },
  handler: async (ctx, { reference, email, amount, currency }) => {
    let payment = await ctx.db
      .query("payments")
      .withIndex("by_reference", q => q.eq("reference", reference))
      .unique()
    if (!payment) {
      // Most recent attempt first — the regenerated reference always belongs
      // to the latest `initialize` call.
      payment = await ctx.db
        .query("payments")
        .filter(q =>
          q.and(
            q.eq(q.field("status"), "pending"),
            q.eq(q.field("email"), email),
            q.eq(q.field("amount"), Math.round(amount / 100)),
            q.eq(q.field("currency"), currency),
          ),
        )
        .order("desc")
        .first()
    }
    if (!payment || payment.status === "paid") return { applied: false }
    await markPaymentPaid(ctx.db, payment)
    return { applied: true }
  },
})
