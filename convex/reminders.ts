import { action, internalAction, internalMutation, internalQuery } from "./_generated/server"
import { v } from "convex/values"
import { internal } from "./_generated/api"
import { checkInMs } from "../lib/dates"
import { EMAIL_FROM, resend } from "../lib/resend"
import { buildReminderEmail, type ReminderDue } from "../lib/reminder-email"

/**
 * Booking reminders, cron-less: the app shell triggers `sweep` on load and
 * every ~10 minutes while someone has the app open. Each sweep re-checks the
 * signed-in user's upcoming reservations and emails the ones whose 48h/24h
 * window has opened. Idempotent via sent-markers on the booking doc, so a
 * reminder fires exactly once no matter how many sweeps see it.
 */

const DAY_MS = 86_400_000

type Due = ReminderDue

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
    const { subject, html } = buildReminderEmail(d, process.env.NEXT_PUBLIC_APP_URL || "https://kenyatrace.vercel.app")
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

/**
 * Lists the clerkIds of every user with at least one upcoming, non-cancelled
 * booking. Used by the cron sweepAll action so reminders fire even when the
 * traveller hasn't opened the app in days. O(bookings) but bounded — only
 * runs from crons.ts, not on the hot path.
 */
export const ownersWithUpcomingBookings = internalQuery({
  args: {},
  handler: async (ctx) => {
    const seen = new Set<string>()
    const now = Date.now()
    const all = await ctx.db.query("bookings").collect()
    for (const b of all) {
      if (b.status === "cancelled" || !b.checkIn) continue
      const t = checkInMs(b.checkIn)
      if (!t || t <= now) continue
      seen.add(b.ownerId)
    }
    return Array.from(seen)
  },
})

/**
 * Cron entry point: iterates every owner with an upcoming booking and runs
 * the same per-user sweep as the app-shell trigger. Idempotent via
 * r48SentAt/r24SentAt markers on the booking. Run from crons.ts once per
 * day so travellers who don't open the app still get their reminders.
 */
export const sweepAll = internalAction({
  args: {},
  handler: async (ctx): Promise<{ sent: number; scanned: number }> => {
    if (!resend) return { sent: 0, scanned: 0 }
    const clerkIds: string[] = await ctx.runQuery(internal.reminders.ownersWithUpcomingBookings, {})
    let sent = 0
    for (const clerkId of clerkIds) {
      const dues = await ctx.runQuery(internal.reminders.dueForUser, { clerkId })
      for (const d of dues as Due[]) {
        const { subject, html } = buildReminderEmail(d, process.env.NEXT_PUBLIC_APP_URL || "https://kenyatrace.vercel.app")
        try {
          const { error } = await resend.emails.send({ from: EMAIL_FROM, to: d.to, subject, html })
          if (error) throw new Error(error.message)
          await ctx.runMutation(internal.reminders.markSent, { id: d.bookingId as never, which: d.which })
          sent++
        } catch (e) {
          console.error("[reminders] cron send failed:", e)
        }
      }
    }
    return { sent, scanned: clerkIds.length }
  },
})
