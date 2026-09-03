/**
 * AI-assisted layer on top of the regex booking parser. The guardrail is the
 * feature: the model may only copy values it actually sees in the pasted
 * email (null when absent — never inferred), its output is sanitized through
 * strict validators, and the merged result always flows through the client's
 * mandatory preview-edit step before anything is persisted.
 */

import { z } from 'zod'
import { chatJSON } from './ai'
import type { ParsedBooking } from './parse-booking'

/** The exact shape the model must return. Everything is nullable — a value
 *  that isn't literally in the email must be null, never guessed. */
const aiSchema = z.object({
  name: z.string().nullish(),
  place: z.string().nullish(),
  type: z.string().nullish(),
  reference: z.string().nullish(),
  amount: z.union([z.number(), z.string()]).nullish(),
  currency: z.string().nullish(),
  checkIn: z.string().nullish(),
  checkOut: z.string().nullish(),
  guests: z.union([z.number(), z.string()]).nullish(),
  provider: z.string().nullish(),
})

type AiRaw = z.infer<typeof aiSchema>

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const TYPES: ParsedBooking['type'][] = ['Stay', 'Flight', 'Transport', 'General']

function cleanString(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  if (t.length < 2) return undefined
  return t.slice(0, max)
}

function cleanAmount(value: AiRaw['amount']): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseFloat(value.replace(/[^0-9.]/g, '')) : NaN
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return undefined
  return Math.round(n * 100) / 100
}

function cleanDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const t = value.trim()
  if (!ISO_DATE.test(t)) return undefined
  const year = parseInt(t.slice(0, 4), 10)
  if (year < 2000 || year > 2100) return undefined
  return t
}

function cleanGuests(value: AiRaw['guests']): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? parseInt(value, 10) : NaN
  if (!Number.isInteger(n) || n < 1 || n > 30) return undefined
  return n
}

/** Turns whatever the model returned into fields we trust enough to show a
 *  human for review. Anything questionable becomes undefined — i.e. ignored. */
export function sanitizeAiBooking(raw: AiRaw): Partial<ParsedBooking> {
  const out: Partial<ParsedBooking> = {}
  const name = cleanString(raw.name, 80)
  if (name) out.name = name
  const place = cleanString(raw.place, 60)
  if (place) out.place = place
  if (typeof raw.type === 'string' && TYPES.includes(raw.type.trim() as ParsedBooking['type'])) out.type = raw.type.trim() as ParsedBooking['type']
  const reference = cleanString(raw.reference, 24)
  if (reference) out.reference = reference
  const amount = cleanAmount(raw.amount)
  if (amount != null) out.amount = amount
  if (raw.currency === 'KES' || raw.currency === 'USD') out.currency = raw.currency
  const checkIn = cleanDate(raw.checkIn)
  if (checkIn) out.checkIn = checkIn
  const checkOut = cleanDate(raw.checkOut)
  if (checkOut) out.checkOut = checkOut
  const guests = cleanGuests(raw.guests)
  if (guests != null) out.guests = guests
  const provider = cleanString(raw.provider, 80)
  if (provider) out.provider = provider
  return out
}

/** True when the regex parser clearly struggled and an AI second look adds
 *  signal (a missed field, or the generic fallback name). */
export function regexParseIsWeak(parsed: ParsedBooking): boolean {
  return !parsed.amount || !parsed.reference || !parsed.checkIn || parsed.name === 'Reserved booking'
}

/** Fills the regex result's gaps with sanitized AI values — a confident regex
 *  hit is never overwritten, so the AI can only add, not replace. */
export function mergeParsedBooking(base: ParsedBooking, ai: Partial<ParsedBooking>): ParsedBooking {
  return {
    name: base.name !== 'Reserved booking' ? base.name : ai.name ?? base.name,
    place: base.place ?? ai.place,
    type: base.type !== 'General' ? base.type : ai.type ?? base.type,
    reference: base.reference ?? ai.reference,
    amount: base.amount || ai.amount || 0,
    currency: base.currency ?? ai.currency,
    checkIn: base.checkIn ?? ai.checkIn,
    checkOut: base.checkOut ?? ai.checkOut,
    guests: base.guests ?? ai.guests,
    provider: base.provider && base.provider !== 'Reserved booking' ? base.provider : ai.provider ?? ai.name ?? base.provider,
  }
}

const SYSTEM = [
  'You extract structured booking data from forwarded travel-confirmation emails.',
  'Copy values EXACTLY as written in the email — never infer, convert or invent.',
  'Use null for any field the email does not explicitly contain.',
  'Return ONLY one compact JSON object: {"name":string|null,"place":string|null,"type":"Stay"|"Flight"|"Transport"|"General","reference":string|null,"amount":number|null,"currency":"KES"|"USD"|null,"checkIn":"YYYY-MM-DD"|null,"checkOut":"YYYY-MM-DD"|null,"guests":number|null,"provider":string|null}',
].join(' ')

async function askModel(emailText: string): Promise<AiRaw> {
  const prompt = `Extract the booking details from this email. Dates must be normalized to YYYY-MM-DD.\n\nEMAIL:\n${emailText.slice(0, 6000)}`
  return chatJSON({ system: SYSTEM, prompt, schema: aiSchema, maxTokens: 400 })
}

/**
 * Second-opinion extraction for emails the regex parser couldn't fully read.
 * Throws when the AI is unavailable or returns nothing usable — callers fall
 * back to the regex verdict.
 */
export async function aiParseBooking(emailText: string): Promise<Partial<ParsedBooking>> {
  const raw = await askModel(emailText)
  return sanitizeAiBooking(raw)
}
