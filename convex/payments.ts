import { action, mutation } from "./_generated/server"
import { v } from "convex/values"
import { makeFunctionReference } from "convex/server"
import type { Doc, Id } from "./_generated/dataModel"

// Real function references for the internal helpers, built by path (the
// `internal.*` proxy would create a type-inference cycle in this module tree,
// and a bare cast doesn't produce a runtime function reference).
const getForVerifyRef = makeFunctionReference<
  "query",
  { paymentId: Id<"payments">; ownerId: string },
  Doc<"payments"> | null
>("payments_helpers/getForVerify")
const markPaidRef = makeFunctionReference<
  "mutation",
  { paymentId: Id<"payments"> },
  void
>("payments_helpers/markPaid")

const PAYSTACK_BASE = "https://api.paystack.co"
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Paystack checkout for reservations.
 *
 * Flow (secret key never reaches the browser):
 *   1. `initialize` (mutation) — create a pending payment row for a booking,
 *      with the amount copied from the booking server-side so a client can't
 *      understate what it owes, plus a fresh reference per attempt.
 *   2. The browser opens the Paystack Inline popup with the public key, the
 *      amount (minor units), currency and that reference — the checkout
 *      initializes the transaction client-side. (The served v1/inline.js has
 *      no access-code support, so a server-side pre-initialize would only
 *      collide with the popup's own initialize on the same reference.)
 *   3. `verifyAndConfirm` (action) — after the popup closes, verify the
 *      transaction with Paystack and only then mark the booking paid.
 *
 * Payment is recorded with status "paid" and the booking flips to "paid" with
 * `paymentMethod: "paystack"` — the UI reacts instantly via the Convex
 * subscription on the bookings query.
 */

export const initialize = mutation({
  args: { bookingId: v.id("bookings"), email: v.string() },
  handler: async (ctx, { bookingId, email }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Sign in required")
    if (!EMAIL_RE.test(email.trim())) throw new Error("Enter a valid email address")
    const booking = await ctx.db.get(bookingId)
    if (!booking || booking.ownerId !== identity.subject) throw new Error("Booking not found")
    if (booking.status === "cancelled") throw new Error("Cancelled bookings can't be paid")
    if (booking.status === "paid") throw new Error("This booking is already paid")
    if (booking.amount <= 0) throw new Error("Nothing to pay for this booking")

    // The popup's checkout initializes the transaction client-side with the
    // public key, so the reference must be fresh for every attempt — reusing
    // one Paystack has already seen fails with "Duplicate Transaction
    // Reference" when a user retries after closing the popup.
    //
    // Every attempt gets its OWN pending row (never patched): a retry after a
    // closed/crashed popup must not overwrite a reference the user may already
    // have paid with, or two successful charges could map to a single payment.
    // Superseded pending attempts are removed so rows don't accumulate.
    const reference = `KT-PAY-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    const stale = await ctx.db
      .query("payments")
      .withIndex("by_booking", q => q.eq("bookingId", bookingId))
      .filter(q => q.eq(q.field("status"), "pending"))
      .collect()
    await Promise.all(stale.map(row => ctx.db.delete(row._id)))

    const paymentId = await ctx.db.insert("payments", {
      ownerId: identity.subject,
      bookingId,
      reference,
      email: email.trim(),
      amount: booking.amount,
      currency: "KES",
      status: "pending",
      createdAt: Date.now(),
    })
    return { paymentId, reference, amount: booking.amount }
  },
})

export const verifyAndConfirm = action({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, { paymentId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Sign in required")
    const payment = await ctx.runQuery(getForVerifyRef, { paymentId, ownerId: identity.subject })
    if (!payment) throw new Error("Payment not found")
    if (payment.status === "paid") {
      return { verified: true, amount: payment.amount, currency: payment.currency }
    }
    if (!process.env.PAYSTACK_SECRET_KEY) throw new Error("Paystack is not configured yet")

    const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(payment.reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    })
    const data = await res.json().catch(() => null)
    const tx = data?.data
    const success =
      data?.status === true &&
      tx?.status === "success" &&
      tx?.amount === payment.amount * 100 &&
      (tx?.currency ?? "KES") === payment.currency
    if (!success) return { verified: false }

    await ctx.runMutation(markPaidRef, { paymentId })
    return { verified: true, amount: payment.amount, currency: payment.currency }
  },
})
