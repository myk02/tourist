import { action, internalMutation, internalQuery } from "./_generated/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import { EMAIL_FROM, resend } from "../lib/resend"

/**
 * Booking reminders, cron-less: the app shell triggers `sweep` on load and
 * every ~10 minutes while someone has the app open. Each sweep re-checks the
 * signed-in user's upcoming reservations and emails the ones whose 48h/24h
 * window has opened. Idempotent via sent-markers on the booking doc, so a
 * reminder fires exactly once no matter how many sweeps see it.
 */

const DAY_MS = 86_400_000

function checkInMs(checkIn: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn)) return null
  // Midday anchor: a midnight parse would make "the day before" flip at
  // 02:00 EAT, which reads wrong in the email subject.
  const ms = Date.parse(`${checkIn}T12:00:00Z`)
  return Number.isFinite(ms) ? ms : null
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return iso
  return `${parseInt(m[3], 10)} ${MONTHS[parseInt(m[2], 10) - 1]} ${m[1]}`
}

interface Due {
  bookingId: string
  which: "r48" | "r24"
  to: string
  label: string
  place?: string
  type: string
  reference: string
  checkIn: string
  amount: number
  guests?: number
  tripId?: string
  tripName?: string
}

/**
 * Upcoming reservations of one traveller with a reminder window open.
 * INTERNAL + explicit clerkId: auth does NOT propagate from an action through
 * ctx.runQuery, so the sweep passes its verified identity down instead — a
 * public version here would either always see no identity (sweep broken) or
 * let anyone read another traveller's reminder payload.
 */
export const dueForUser = internalQuery({ args: { clerkId: v.string() }, handler: async (ctx, { clerkId }) => {
  const user = await ctx.db.query("users").withIndex("by_clerk", q => q.eq("clerkId", clerkId)).unique()
  const to = user?.email
  if (!to) return []
  const now = Date.now()
  const bookings = await ctx.db.query("bookings").withIndex("by_owner", q => q.eq("ownerId", clerkId)).collect()
  const out: Due[] = []
  for (const b of bookings) {
    if (b.status === "cancelled" || !b.checkIn) continue
    const t = checkInMs(b.checkIn)
    if (!t || t <= now) continue
    const trip = b.tripId ? await ctx.db.get(b.tripId) : undefined
    const stop = b.stopId ? await ctx.db.get(b.stopId) : undefined
    const base = {
      bookingId: b._id,
      to,
      label: stop?.name ?? `Reservation ${b.reference}`,
      place: stop?.place,
      type: b.type,
      reference: b.reference,
      checkIn: b.checkIn,
      amount: b.amount,
      guests: b.guests,
      ...(trip ? { tripId: trip._id, tripName: trip.name } : {}),
    }
    // The catch-up rule: once inside the last 24h only the 24h reminder is
    // eligible, so a traveller who disappeared for a week gets one email,
    // never two back-to-back.
    const due48 = !b.r48SentAt && now >= t - 2 * DAY_MS && now < t - DAY_MS
    const due24 = !b.r24SentAt && now >= t - DAY_MS
    if (due48) out.push({ ...base, which: "r48" })
    if (due24) out.push({ ...base, which: "r24" })
  }
  return out
}})

export const sweep = action({ args: {}, handler: async ctx => {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) return { sent: 0 }
  if (!resend) return { sent: 0 }
  const dues = await ctx.runQuery(internal.reminders.dueForUser, { clerkId: identity.subject })
  let sent = 0
  for (const d of dues as Due[]) {
    const whenLabel = d.which === "r48" ? "In 2 days" : "Tomorrow"
    const subject = `${whenLabel}: ${d.label} · check-in ${prettyDate(d.checkIn)}`
    const link = `${process.env.NEXT_PUBLIC_APP_URL || "https://kenyatrace.vercel.app"}${d.tripId ? `/trips/${d.tripId}` : "/profile?tab=bookings"}`
    const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e2da;">
          <tr>
            <td style="background:#0f6b4f;padding:24px 32px;">
              <p style="margin:0;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#c8f0df;">KenyaTrace</p>
              <p style="margin:8px 0 0;font-size:22px;font-weight:600;color:#ffffff;">${escapeHtml(whenLabel)} — ${escapeHtml(d.tripName ?? "your Kenya trip")}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1c1917;">
                <strong>${escapeHtml(d.label)}</strong> starts on <strong>${prettyDate(d.checkIn)}</strong>${d.place ? ` in ${escapeHtml(d.place)}` : ""}.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f3ef;border-radius:8px;margin:0 0 20px;">
                <tr><td style="padding:14px 18px;font-size:14px;color:#44403c;line-height:1.9;">
                  <strong>Reference:</strong> ${escapeHtml(d.reference)}<br/>
                  <strong>Type:</strong> ${escapeHtml(d.type)}${d.guests != null ? `<br/><strong>Guests:</strong> ${d.guests}` : ""}<br/>
                  <strong>Amount:</strong> KES ${d.amount.toLocaleString("en-KE")}
                </td></tr>
              </table>
              <p style="margin:0 0 24px;text-align:center;">
                <a href="${link}" style="display:inline-block;padding:13px 28px;background:#0f6b4f;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Open your trip</a>
              </p>
              <p style="margin:0;font-size:12px;color:#78716c;">You get this because you added this reservation to KenyaTrace. Cancelled reservations never remind.</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
    try {
      const { error } = await resend.emails.send({ from: EMAIL_FROM, to: d.to, subject, html })
      if (error) throw new Error(error.message)
      await ctx.runMutation(internal.reminders.markSent, { id: d.bookingId as never, which: d.which })
      sent++
    } catch (e) {
      console.error("[reminders] send failed:", e)
      // Not marked → the next sweep retries automatically.
    }
  }
  return { sent }
}})

export const markSent = internalMutation({ args: { id: v.id("bookings"), which: v.union(v.literal("r48"), v.literal("r24")) }, handler: async (ctx, { id, which }) => {
  const now = Date.now()
  await ctx.db.patch(id, which === "r48" ? { r48SentAt: now } : { r24SentAt: now })
}})

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}
