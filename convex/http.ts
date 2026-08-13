import { httpRouter, makeFunctionReference } from "convex/server"
import { httpAction } from "./_generated/server"

/**
 * Paystack webhook endpoint.
 *
 * Configure this URL in the Paystack dashboard (Settings → API Keys &
 * Webhooks):  {CONVEX_SITE_URL}/paystack-webhook
 *
 * The primary confirm path for day packs is client-side
 * (`verifyAndConfirmDayPack`), but a webhook guarantees the purchase is
 * applied even if the browser closes mid-checkout. We verify Paystack's HMAC
 * signature before trusting anything.
 */

// Real function references built by path — a bare cast would fail the runtime
// functionReference check inside ctx.runMutation.
const applyDayPackByChargeRef = makeFunctionReference<
  "mutation",
  { reference: string; email: string; amount: number; currency: string },
  { applied: boolean }
>("subscription_helpers/applyDayPackByCharge")
const markPaidByChargeRef = makeFunctionReference<
  "mutation",
  { reference: string; email: string; amount: number; currency: string },
  { applied: boolean }
>("payments_helpers/markPaidByCharge")

const http = httpRouter()

http.route({
  path: "/paystack-webhook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const raw = await request.text()
    const signature = request.headers.get("x-paystack-signature")
    const secret = process.env.PAYSTACK_SECRET_KEY
    if (!secret || !signature) {
      return new Response("Missing configuration", { status: 400 })
    }
    // Paystack signs the raw request body with HMAC-SHA512 using the secret
    // key. Web Crypto runs in the default Convex runtime (no node directive).
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["sign"],
    )
    const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw))
    const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("")
    if (signature !== expected) {
      return new Response("Invalid signature", { status: 401 })
    }

    let event: {
      event?: string
      data?: { reference?: string; amount?: number; currency?: string; customer?: { email?: string } }
    }
    try {
      event = JSON.parse(raw)
    } catch {
      return new Response("Invalid payload", { status: 400 })
    }

    if (event.event === "charge.success" && event.data?.reference) {
      const { reference, amount, currency } = event.data
      const email = event.data.customer?.email ?? ""
      const charge = { reference, email, amount: amount ?? 0, currency: currency ?? "KES" }
      // Route by our reference prefix. Day-pack purchases (KT-SUB-) always
      // keep their original reference, so their exact match always succeeds.
      // Booking payments (KT-PAY-) may have had their reference regenerated
      // by a retry, so they use the email+amount fallback. Unknown prefixes
      // try both paths (the fallbacks never match across the two tables).
      if (reference.startsWith("KT-SUB-")) {
        await ctx.runMutation(applyDayPackByChargeRef, charge)
      } else if (reference.startsWith("KT-PAY-")) {
        await ctx.runMutation(markPaidByChargeRef, charge)
      } else {
        const dayPack = await ctx.runMutation(applyDayPackByChargeRef, charge)
        if (!dayPack.applied) {
          await ctx.runMutation(markPaidByChargeRef, charge)
        }
      }
    }
    return new Response("ok", { status: 200 })
  }),
})

export default http
