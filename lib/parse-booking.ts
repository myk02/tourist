/**
 * Best-effort parser for forwarded booking confirmation emails (TripIt-style).
 * Turns free-text email bodies into structured booking data that can be added
 * to a KenyaTrace trip. Heuristic-based: no external NLP dependency, resilient
 * to the wildly different formats real confirmations come in.
 */

export type ParsedBooking = {
  name: string
  place?: string
  type: 'Stay' | 'Flight' | 'Transport' | 'General'
  reference?: string
  amount: number
  currency?: string
  checkIn?: string
  checkOut?: string
  guests?: number
  provider?: string
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
}

function toIso(day: number, month: number, year: number): string {
  if (!day || !month || !year) return ''
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Extracts ISO dates like "2026-08-18" or "18 Aug 2026" / "Aug 18, 2026". */
function extractDates(text: string): string[] {
  const out: string[] = []
  const isoRe = /\b(\d{4})-(\d{2})-(\d{2})\b/g
  let m: RegExpExecArray | null
  while ((m = isoRe.exec(text))) {
    out.push(toIso(parseInt(m[3], 10), parseInt(m[2], 10), parseInt(m[1], 10)))
  }
  const namedRe = /\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{4})\b/gi
  while ((m = namedRe.exec(text))) {
    out.push(toIso(parseInt(m[1], 10), MONTHS[m[2].toLowerCase()], parseInt(m[3], 10)))
  }
  const namedRe2 = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/gi
  while ((m = namedRe2.exec(text))) {
    out.push(toIso(parseInt(m[2], 10), MONTHS[m[1].toLowerCase()], parseInt(m[3], 10)))
  }
  return [...new Set(out.filter(Boolean))]
}

function extractAmount(text: string): { amount: number; currency?: string } {
  const kes = /(?:KES|KSh|K\.Shs\.?|KShs\.?)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text)
  if (kes) return { amount: parseFloat(kes[1].replace(/,/g, '')), currency: 'KES' }
  const usd = /(?:\$|USD)\s*([\d,]+(?:\.\d{1,2})?)/i.exec(text)
  if (usd) return { amount: parseFloat(usd[1].replace(/,/g, '')), currency: 'USD' }
  const generic = /(?:total|amount|price|paid|due)\D{0,15}([\d,]+(?:\.\d{1,2})?)\b/i.exec(text)
  if (generic) return { amount: parseFloat(generic[1].replace(/,/g, '')), currency: 'KES' }
  return { amount: 0 }
}

function extractReference(text: string): string | undefined {
  const labeled = /(?:booking\s*(?:reference|ref|no\.?|number)|confirmation\s*(?:no\.?|number|code)|reservation\s*(?:no\.?|number|code)?|PNR)[^A-Z0-9]{1,24}([A-Z0-9]{4,14})/i.exec(text)
  if (labeled) return labeled[1]
  const standalone = /\b([A-Z]{2}-\d{4,10}|[A-Z0-9]{6,12})\b/.exec(text)
  return standalone?.[1]
}

function extractName(text: string): string {
  // "Sarova Stanley Hotel", "Baobab Beach Resort & Spa" — the required hotel
  // suffix stops the lazy group from swallowing the rest of the sentence, the
  // lookbehind + stop-words keep it from starting mid-sentence, and the group
  // deliberately starts case-sensitively (no /i) so "at the X" can't match.
  const property = /(?<![A-Za-z])(?!Reservation\b|Your\b|Booking\b|Confirmation\b|Dear\b|Please\b|Thank\b|Total\b|Check\b|Payment\b|Arrival\b|Departure\b|Reference\b)([A-Z][A-Za-z0-9&'’\- ]{3,60}?)\s+(?:[Hh]otel|[Ll]odge|[Rr]esort|[Gg]uesthouse|[Hh]ostel|[Ii]nn|[Cc]amp)\b/.exec(text)
  if (property) return property[1].trim()
  // "stay at the Giraffe Centre" / "booked at the Tamarind Tree" — stop the
  // name at the first comma, period, or line end.
  const stay = /(?:stay(?:ing)? at|booked at|at)\s+the?\s+([A-Z][A-Za-z0-9&'’\- ]{3,60}?)(?:,|\.|\n|$)/i.exec(text)
  if (stay && /hotel|lodge|resort|guesthouse|hostel|inn|centre|center|villa|club|house/i.test(text)) return stay[1].trim()
  const airline = /(operated by|airline:?)\s+([A-Za-z ]{3,30})/i.exec(text)
  if (airline) return airline[2].trim()
  const flight = /([A-Z]{2,3}\d{2,4})\s+([A-Za-z ]{3,60}?)(?:\.|,|\n|$)/i.exec(text)
  if (flight) {
    const route = flight[2].trim().replace(/\s+(?:is|was|has been)\s+(?:confirmed|booked|reserved|scheduled)\s*$/i, '')
    return `Flight ${flight[1]} · ${route}`
  }
  return 'Reserved booking'
}

function extractPlace(text: string): string | undefined {
  const near = /(?:location|at|in)\s+(?:the\s+)?([A-Z][A-Za-z ]{2,30})(?:,|\.|\s+(?:Kenya|Mombasa|Nairobi|Diani|Nakuru))/i.exec(text)
  if (near) return near[1].trim()
  const place = /([A-Z][A-Za-z ]{3,25})\s*,\s*Kenya/i.exec(text)
  if (place) return place[1].trim()
  return undefined
}

function detectType(text: string): ParsedBooking['type'] {
  if (/hotel|lodge|resort|guesthouse|hostel|villa|boutique|check-in|check-out|check in|check out|property|booking\.com|expedia/i.test(text)) return 'Stay'
  if (/flight|airline|boarding|departure|arrival|terminal|pnr|seat|aircraft|gate\b/i.test(text)) return 'Flight'
  if (/car hire|car rental|rental|transfer|taxi|driver|uber|bolt|pickup|drop-off/i.test(text)) return 'Transport'
  return 'General'
}

function extractGuests(text: string): number | undefined {
  const m = /(\d+)\s*(?:guests?|pax|adults?|travellers?|travelers?)/i.exec(text)
  return m ? parseInt(m[1], 10) : undefined
}

export function parseBookingEmail(text: string): ParsedBooking {
  const amount = extractAmount(text)
  const dates = extractDates(text)
  const type = detectType(text)
  return {
    name: extractName(text),
    place: extractPlace(text),
    type,
    reference: extractReference(text),
    amount: amount.amount,
    currency: amount.currency,
    checkIn: dates[0],
    checkOut: dates[1] && dates[1] !== dates[0] ? dates[1] : undefined,
    guests: extractGuests(text),
    provider: extractName(text),
  }
}
