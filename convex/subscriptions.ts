import { action, mutation, query, type DatabaseWriter } from "./_generated/server"
import { v } from "convex/values"
import { makeFunctionReference } from "convex/server"
import type { Doc, Id } from "./_generated/dataModel"
import { PLAN_PRICES, TRIAL_DAYS, DAY_MS } from "../lib/plans"

const PAYSTACK_BASE = "https://api.paystack.co"
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Subscription access for KenyaTrace: prepaid packs — KES 100 for 7 days or
 * KES 400 for 30 days — with a 30-day free trial for new users.
 *
 * Access model — one `subscriptions` row per user:
 *   - `trialEndsAt` — set once, lazily, the first time a signed-in user hits a
 *     gated feature (30 days free).
 *   - `paidUntil`   — extends with each day-pack purchase (stacks from the
 *     later of now/current paidUntil).
 * Access is active while `now < max(trialEndsAt, paidUntil)`.
 *
 * Purchase flow (mirrors the booking payment flow — secret key never leaves
 * server-side Convex actions):
 *   1. `initializeDayPack` (mutation)  — create a pending purchase row with a
 *      fresh reference and the server-derived amount.
 *   2. Paystack Inline popup in the browser — initialized client-side with the
 *      public key, amount (minor units), currency and that reference (the
 *      served v1/inline.js has no access-code support).
 *   3. `verifyAndConfirmDayPack` (action) — verify + apply the days.
 *   Plus a webhook (convex/http.ts) that applies `charge.success`
 *   server-to-server even if the browser closes mid-checkout.
 */

// Real function references for the internal helpers, built by path (the
// `internal.*` proxy would create a type-inference cycle in this module tree,
// and a bare cast doesn't produce a runtime function reference).
const applyDayPackRef = makeFunctionReference<
  "mutation",
  { purchaseId: Id<"subscriptionPurchases"> },
  void
>("subscription_helpers/applyDayPack")
const getPurchaseForVerifyRef = makeFunctionReference<
  "query",
  { purchaseId: Id<"subscriptionPurchases">; ownerId: string },
  Doc<"subscriptionPurchases"> | null
>("subscription_helpers/getForVerify")

/**
 * Server-side enforcement used by content-creating mutations across the app.
 * Lazily starts the 30-day trial on first gated write (so brand-new users
 * aren't blocked), then throws once access runs out.
 */
/**
 * Server-side enforcement used by content-creating mutations across the app.
 * Lazily starts the 30-day trial on first gated write (so brand-new users
 * aren't blocked), then throws once access runs out. For accounts that
 * predate sign-up anchoring, the trial start falls back to the user row's
 * createdAt so the countdown is honest for them too.
 */
export async function requireActiveAccess(db: DatabaseWriter, ownerId: string) {
  const now = Date.now()
  const sub = await db.query("subscriptions").withIndex("by_owner", q => q.eq("ownerId", ownerId)).unique()
  if (!sub) {
    const user = await db.query("users").withIndex("by_clerk", q => q.eq("clerkId", ownerId)).unique()
    const trialStart = user?.createdAt ?? now
    await db.insert("subscriptions", { ownerId, trialEndsAt: trialStart + TRIAL_DAYS * DAY_MS, createdAt: now, updatedAt: now })
    return
  }
  const deadline = Math.max(sub.trialEndsAt ?? 0, sub.paidUntil ?? 0)
  if (deadline <= now) {
    throw new Error("Your access has ended — buy a day pack to keep planning")
  }
}

export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const sub = await ctx.db.query("subscriptions").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).unique()
    const now = Date.now()
    if (!sub) return { active: false, mode: "none", trialEndsAt: null, trialStartedAt: null, paidUntil: null, daysRemaining: 0 }
    const deadline = Math.max(sub.trialEndsAt ?? 0, sub.paidUntil ?? 0)
    const active = deadline > now
    const mode = sub.paidUntil && sub.paidUntil > now ? "paid" : sub.trialEndsAt && sub.trialEndsAt > now ? "trial" : "none"
    return {
      active,
      mode,
      trialEndsAt: sub.trialEndsAt ?? null,
      // The trial is anchored at sign-up: trialEndsAt is exactly sign-up + 30
      // days, so the start is derived server-side and can never be moved.
      trialStartedAt: sub.trialEndsAt ? sub.trialEndsAt - TRIAL_DAYS * DAY_MS : null,
      paidUntil: sub.paidUntil ?? null,
      daysRemaining: active ? Math.ceil((deadline - now) / DAY_MS) : 0,
    }
  },
})

/** Lazily starts the 30-day trial (idempotent, no-op if a row already exists). */
export const ensureTrial = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Sign in required")
    const now = Date.now()
    const existing = await ctx.db.query("subscriptions").withIndex("by_owner", q => q.eq("ownerId", identity.subject)).unique()
    if (!existing) {
      const user = await ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", identity.subject)).unique()
      const trialStart = user?.createdAt ?? now
      await ctx.db.insert("subscriptions", { ownerId: identity.subject, trialEndsAt: trialStart + TRIAL_DAYS * DAY_MS, createdAt: now, updatedAt: now })
    }
    return { started: !existing }
  },
})

/** Creates a pending day-pack purchase. Amount is derived server-side. */
export const initializeDayPack = mutation({
  args: { days: v.number(), email: v.string() },
  handler: async (ctx, { days, email }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Sign in required")
    const price = PLAN_PRICES[days]
    if (!price) throw new Error("Invalid day pack")
    if (!EMAIL_RE.test(email.trim())) throw new Error("Enter a valid email address")
    const reference = `KT-SUB-${crypto.randomUUID().slice(0, 8).toUpperCase()}`
    const purchaseId = await ctx.db.insert("subscriptionPurchases", {
      ownerId: identity.subject,
      reference,
      email: email.trim(),
      days,
      amount: price,
      currency: "KES",
      status: "pending",
      createdAt: Date.now(),
    })
    return { purchaseId, reference, amount: price, days }
  },
})

export const verifyAndConfirmDayPack = action({
  args: { purchaseId: v.id("subscriptionPurchases") },
  handler: async (ctx, { purchaseId }) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) throw new Error("Sign in required")
    const purchase = await ctx.runQuery(getPurchaseForVerifyRef, { purchaseId, ownerId: identity.subject })
    if (!purchase) throw new Error("Purchase not found")
    if (purchase.status === "paid") {
      return { verified: true, days: purchase.days }
    }
    if (!process.env.PAYSTACK_SECRET_KEY) throw new Error("Paystack is not configured yet")

    const res = await fetch(`${PAYSTACK_BASE}/transaction/verify/${encodeURIComponent(purchase.reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    })
    const data = await res.json().catch(() => null)
    const tx = data?.data
    const success =
      data?.status === true &&
      tx?.status === "success" &&
      tx?.amount === purchase.amount * 100 &&
      (tx?.currency ?? "KES") === purchase.currency
    if (!success) return { verified: false, days: 0 }

    await ctx.runMutation(applyDayPackRef, { purchaseId })
    return { verified: true, days: purchase.days }
  },
})

/**
 * Purchase history for the profile page (receipts). Only successful
 * transactions — pending/failed checkout attempts never appear in the
 * user's history. Most recent first.
 */
export const listPurchases = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return []
    return ctx.db
      .query("subscriptionPurchases")
      .withIndex("by_owner_created", q => q.eq("ownerId", identity.subject))
      .filter(q => q.eq(q.field("status"), "paid"))
      .order("desc")
      .collect()
  },
})
