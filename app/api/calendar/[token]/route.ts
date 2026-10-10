import { ConvexHttpClient } from 'convex/browser'
import { buildIcsFeed, type IcsEvent } from '@/lib/ical'
import { isValidConvexId } from '@/lib/id'
import { fromMinorKES } from '@/lib/money'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/calendar/[token]
 *
 * TripIt-style calendar sync: the traveller subscribes to this URL once in
 * Google/Apple/Outlook Calendar and every itinerary stop + paid booking
 * appears as an event, updating live. The token acts as the password — same
 * pattern as the trace-share token, revocable per trip.
 */

interface StopDoc {
  _id: string
  name: string
  place: string
  day: number
  time: string
  cost: number
  kind: string
}

interface BookingDoc {
  _id: string
  type: string
  amount: number
  status: string
  reference: string
  checkIn?: string
  checkOut?: string
}

interface TripDoc {
  _id: string
  name: string
  destination: string
  origin?: string
  startDate: string
  endDate: string
  ownerId: string
}

interface Client {
  query: (name: string, args: Record<string, unknown>) => Promise<unknown>
}

async function resolveToken(client: Client, token: string): Promise<TripDoc | null> {
  return (await client.query('calendar:byCalendarToken', { token })) as TripDoc | null
}

/** Day N (1-based) of the trip as a YYYY-MM-DD calendar date. */
function dayDate(startDate: string, day: number): string {
  const start = Date.parse(`${startDate}T00:00:00Z`)
  if (!Number.isFinite(start)) return startDate
  return new Date(start + (day - 1) * 86_400_000).toISOString().slice(0, 10)
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) {
    return new Response('Calendar temporarily unavailable', { status: 503 })
  }
  if (!token || token.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(token)) {
    return new Response('Not found', { status: 404 })
  }

  const client = new ConvexHttpClient(url)
  const query = client.query as unknown as (name: string, args: Record<string, unknown>) => Promise<unknown>
  let trip: TripDoc | null
  try {
    trip = await resolveToken({ query }, token)
  } catch (err) {
    console.error('[calendar] token resolve failed', err)
    return new Response('Calendar temporarily unavailable', { status: 503 })
  }
  if (!trip || !isValidConvexId(trip._id)) return new Response('Not found', { status: 404 })

  const tripId = trip._id as `${string}trips`
  let stops: StopDoc[] = []
  let bookings: BookingDoc[] = []
  try {
    stops = ((await query('calendar:listStops', { tripId })) as StopDoc[]) ?? []
    // Unauthenticated feed: bookings:forTrip requires auth so it returns []
    // here — stops still render. Paid bookings appear once the owner opens
    // the trip (authenticated) and re-syncs; never fail the whole feed.
    bookings = ((await query('bookings:forTrip', { tripId })) as BookingDoc[]) ?? []
  } catch (err) {
    // Stops/bookings failing must not kill the whole feed — the trip window still renders.
    console.error('[calendar] stops/bookings partial feed', err)
  }

  const events: IcsEvent[] = []

  for (const s of stops) {
    const day = dayDate(trip.startDate, s.day)
    const time = /^\d{2}:\d{2}$/.test(s.time) ? s.time : '09:00'
    events.push({
      uid: `stop-${s._id}@kenyatrace`,
      start: `${day}T${time}`,
      summary: `${s.name} · ${trip.destination}`,
      description: [
        `${s.kind} · Day ${s.day} of "${trip.name}"`,
        s.cost > 0 ? `Planned cost: KES ${s.cost.toLocaleString('en-KE')}` : null,
        'Planned with KenyaTrace — kenyatrace.vercel.app',
      ].filter(Boolean).join('\n'),
      location: s.place,
    })
  }

  for (const b of bookings) {
    if (b.status === 'cancelled' || !b.checkIn) continue
    const paid = b.status === 'paid'
    events.push({
      uid: `booking-${b._id}@kenyatrace`,
      start: b.checkIn,
      end: b.checkOut && b.checkOut > b.checkIn ? b.checkOut : undefined,
      summary: `${paid ? 'Paid: ' : 'Reserved: '}${b.type}`,
      description: [
        `Reference ${b.reference}`,
        `Amount: KES ${Math.round(fromMinorKES(b.amount * 100)).toLocaleString('en-KE')}`,
        paid ? 'Payment confirmed' : 'Not paid yet — pay from your KenyaTrace bookings tab',
      ].join('\n'),
    })
  }

  const ics = buildIcsFeed({
    tripName: `${trip.name} · KenyaTrace`,
    events,
  })

  return new Response(ics, {
    status: 200,
    headers: {
      'content-type': 'text/calendar; charset=utf-8',
      'content-disposition': `attachment; filename="kenyatrace-${tripId.slice(0, 12)}.ics"`,
      'cache-control': 'no-store',
    },
  })
}
