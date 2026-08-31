import { NextResponse } from 'next/server'
import { parseBookingEmail } from '@/lib/parse-booking'
import { aiParseBooking, mergeParsedBooking, regexParseIsWeak } from '@/lib/parse-booking-ai'
import { rateLimit, getClientKey } from '@/lib/rate-limit'

export const runtime = 'nodejs'

/**
 * POST /api/parse-booking
 *
 * Accepts a forwarded booking confirmation email body (TripIt-style) and
 * returns structured booking data the client can preview before adding it to
 * a trip. Example body:
 *
 *   { "text": "Your Sarova Stanley confirmation… Booking reference AB12CD… KES 16,500… check-in 18 Aug 2026…" }
 *
 * Parsing is regex-first (fast, deterministic). When the heuristics come back
 * weak — a missed amount, reference, date, or only a generic name — the same
 * text gets one AI second-opinion pass whose output is strictly sanitized and
 * merged gap-only (a confident regex hit is never overwritten). Either way the
 * client shows the mandatory preview-edit step before anything persists.
 */
export async function POST(request: Request) {
  try {
    const rl = rateLimit(`parse-booking:${getClientKey(request)}`, 20, 60_000)
    if (!rl.ok) {
      return NextResponse.json({ error: 'Too many requests — try again in a minute.' }, { status: 429 })
    }
    const body = await request.json().catch(() => ({}))
    const text = typeof body?.text === 'string' ? body.text.slice(0, 20_000) : ''
    if (!text.trim()) {
      return NextResponse.json({ error: 'No email text provided. Paste the full confirmation email.' }, { status: 400 })
    }

    const parsed = parseBookingEmail(text)
    let result = parsed
    let source: 'regex' | 'ai' = 'regex'

    if (regexParseIsWeak(parsed)) {
      try {
        const ai = await aiParseBooking(text)
        const merged = mergeParsedBooking(parsed, ai)
        if (JSON.stringify(merged) !== JSON.stringify(parsed)) {
          result = merged
          source = 'ai'
        }
      } catch {
        // AI unavailable or unreadable — the regex verdict stands.
      }
    }

    if (!result.amount && !result.reference && !result.checkIn) {
      return NextResponse.json(
        { error: 'Could not spot booking details in that text. Paste the full confirmation email from your provider.' },
        { status: 422 },
      )
    }
    return NextResponse.json({ ...result, source })
  } catch {
    return NextResponse.json({ error: 'Unable to parse this email.' }, { status: 400 })
  }
}
