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
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { ParsedBooking } from '@/lib/parse-booking'

const TYPE_STYLE: Record<string, string> = {
  Stay: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  Flight: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Transport: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  General: 'bg-secondary text-muted-foreground',
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
  // The parse is a draft, not the truth — every field stays editable before
  // it becomes a reservation, so a missed amount or typo is fixed here
  // instead of being waved through to the itinerary.
  const [edit, setEdit] = useState<ParsedBooking | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function reset() {
    setText('')
    setParsed(null)
    setEdit(null)
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
      setEdit({ ...data })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this email')
      setParsed(null)
    } finally {
      setParsing(false)
    }
  }

  async function addToTrip() {
    if (!parsed || !edit || !edit.name.trim()) return
    setSaving(true)
    try {
      await addFromEmail({
        tripId,
        name: edit.name.trim(),
        place: edit.place,
        type: parsed.type,
        amount: Math.max(edit.amount, 0),
        reference: edit.reference,
        checkIn: edit.checkIn,
        checkOut: edit.checkOut,
        guests: edit.guests,
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

  function patch(patchFields: Partial<ParsedBooking>) {
    setEdit(prev => (prev ? { ...prev, ...patchFields } : prev))
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

          {parsed && edit && (
            <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">Check the details</p>
                <Badge className={TYPE_STYLE[parsed.type] ?? 'bg-secondary text-muted-foreground'}>{parsed.type}</Badge>
                <span className="ml-auto text-xs text-muted-foreground">Edit anything the email got wrong</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  Name
                  <Input className="h-8" value={edit.name} onChange={e => patch({ name: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  Where
                  <Input className="h-8" value={edit.place} onChange={e => patch({ place: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  Reference
                  <Input className="h-8 font-mono" value={edit.reference} onChange={e => patch({ reference: e.target.value })} />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  Amount (KES)
                  <Input
                    className="h-8"
                    type="number"
                    min={0}
                    value={edit.amount}
                    onChange={e => {
                      const n = parseInt(e.target.value, 10)
                      if (!Number.isNaN(n)) patch({ amount: n })
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                  Check-in
                  <Input className="h-8" type="date" value={edit.checkIn ?? ''} onChange={e => patch({ checkIn: e.target.value || undefined })} />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Check-out
                    <Input className="h-8" type="date" value={edit.checkOut ?? ''} onChange={e => patch({ checkOut: e.target.value || undefined })} />
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
                    Guests
                    <Input
                      className="h-8"
                      type="number"
                      min={1}
                      max={20}
                      value={edit.guests ?? ''}
                      onChange={e => {
                        const n = parseInt(e.target.value, 10)
                        patch({ guests: Number.isNaN(n) ? undefined : n })
                      }}
                    />
                  </label>
                </div>
              </div>
              {!edit.name.trim() && <p className="text-xs text-destructive">A name is required before adding.</p>}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          <Button onClick={addToTrip} disabled={!edit || !edit.name.trim() || saving} className="gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />}
            Add to trip
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
