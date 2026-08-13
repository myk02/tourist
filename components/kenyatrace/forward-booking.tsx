'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Loader2, MailPlus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { formatKES } from '@/lib/kenya-data'
import type { ParsedBooking } from '@/lib/parse-booking'

const TYPE_STYLE: Record<string, string> = {
  Stay: 'bg-blue-100 text-blue-800',
  Flight: 'bg-amber-100 text-amber-800',
  Transport: 'bg-emerald-100 text-emerald-800',
  General: 'bg-secondary text-muted-foreground',
}

function amountLabel(parsed: ParsedBooking) {
  if (parsed.currency === 'USD') return `$${parsed.amount.toLocaleString()}`
  return formatKES(parsed.amount)
}

/**
 * TripIt-style email ingestion: paste a booking confirmation (hotel, airline
 * or transfer) and it is parsed by /api/parse-booking into structured fields
 * that can be previewed and then saved as a reservation on the trip.
 */
export function ForwardBookingDialog({ tripId }: { tripId: Id<'trips'> }) {
  const addFromEmail = useMutation(api.bookings.createFromEmail)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed] = useState<ParsedBooking | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setText('')
    setParsed(null)
    setError(null)
  }

  async function parse() {
    if (!text.trim()) return
    setParsing(true)
    setError(null)
    try {
      const res = await fetch('/api/parse-booking', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not read this email')
      setParsed(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this email')
      setParsed(null)
    } finally {
      setParsing(false)
    }
  }

  async function addToTrip() {
    if (!parsed) return
    setSaving(true)
    try {
      await addFromEmail({
        tripId,
        name: parsed.name,
        place: parsed.place,
        type: parsed.type,
        amount: parsed.amount,
        reference: parsed.reference,
        checkIn: parsed.checkIn,
        checkOut: parsed.checkOut,
        guests: parsed.guests,
      })
      toast.success('Booking added to your trip')
      setOpen(false)
      reset()
    } catch {
      toast.error('Could not add this booking')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={o => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <Button variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <MailPlus className="size-4" />
        Forward a confirmation
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a booking from email</DialogTitle>
          <DialogDescription>
            Paste a booking confirmation from a hotel, airline or transfer provider — we'll pull out the dates, price and reference for you.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Textarea
            className="min-h-32 font-mono text-xs"
            aria-label="Booking confirmation email"
            placeholder={'Paste the email here… e.g. "Your booking at the Sarova Stanley Hotel is confirmed. Booking reference AB12CD. Check-in 18 Aug 2026. 2 guests. Total KES 49,500."'}
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <Button onClick={parse} disabled={parsing || !text.trim()} className="self-end gap-2">
            {parsing ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {parsing ? 'Reading email…' : 'Extract details'}
          </Button>

          {error && <p className="text-sm text-destructive">{error}</p>}

          {parsed && (
            <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{parsed.name}</p>
                <Badge className={TYPE_STYLE[parsed.type] ?? 'bg-secondary text-muted-foreground'}>{parsed.type}</Badge>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {parsed.place && (
                  <>
                    <dt className="text-muted-foreground">Where</dt>
                    <dd>{parsed.place}</dd>
                  </>
                )}
                {parsed.reference && (
                  <>
                    <dt className="text-muted-foreground">Reference</dt>
                    <dd className="font-mono">{parsed.reference}</dd>
                  </>
                )}
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="font-semibold">{amountLabel(parsed)}</dd>
                {parsed.checkIn && (
                  <>
                    <dt className="text-muted-foreground">Dates</dt>
                    <dd>{parsed.checkIn}{parsed.checkOut ? ` → ${parsed.checkOut}` : ''}</dd>
                  </>
                )}
                {parsed.guests && (
                  <>
                    <dt className="text-muted-foreground">Guests</dt>
                    <dd>{parsed.guests}</dd>
                  </>
                )}
              </dl>
              {parsed.amount === 0 && <p className="text-xs text-muted-foreground">No amount found in the email — this will be added at KSh 0. Edit the itinerary after adding if needed.</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button onClick={addToTrip} disabled={!parsed || saving} className="gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />}
            Add to trip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
