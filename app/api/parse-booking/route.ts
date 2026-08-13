import { NextResponse } from 'next/server'
import { parseBookingEmail } from '@/lib/parse-booking'

export const runtime = 'nodejs'

/**
 * POST /api/parse-booking
 *
 * Accepts a forwarded booking confirmation email body (TripIt-style) and
 * returns structured booking data the client can preview before adding it to
 * a trip. Example body:
 *
 *   { "text": "Your Sarova Stanley confirmation… Booking reference AB12CD… KES 16,500… check-in 18 Aug 2026…" }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const text = typeof body?.text === 'string' ? body.text : ''
    if (!text.trim()) {
      return NextResponse.json({ error: 'No email text provided. Paste the full confirmation email.' }, { status: 400 })
    }
    const parsed = parseBookingEmail(text)
    if (!parsed.amount && !parsed.reference && !parsed.checkIn) {
      return NextResponse.json(
        { error: 'Could not spot booking details in that text. Paste the full confirmation email from your provider.' },
        { status: 422 },
      )
    }
    return NextResponse.json(parsed)
  } catch {
    return NextResponse.json({ error: 'Unable to parse this email.' }, { status: 400 })
  }
}
