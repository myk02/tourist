'use client'

import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { CalendarPlus, Check, Copy, Link2, RotateCcw, ShieldOff } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

/**
 * TripIt-style calendar sync dialog. The owner mints a secret feed token and
 * subscribes once in Google/Apple/Outlook Calendar; the itinerary and paid
 * bookings stay in sync from then on. Rotating kills old URLs; disabling
 * clears the token entirely.
 */
export function CalendarSyncDialog({ tripId, open, onOpenChange }: {
  tripId: Id<'trips'>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const enable = useMutation(api.calendar.enableCalendarSync)
  const rotate = useMutation(api.calendar.rotateCalendarToken)
  const disable = useMutation(api.calendar.disableCalendarSync)
  const [token, setToken] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  const feedUrl = token && typeof window !== 'undefined' ? `${window.location.origin}/api/calendar/${token}.ics` : null
  const googleUrl = feedUrl ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(feedUrl)}` : null

  async function ensureToken() {
    setBusy(true)
    try {
      const res = await enable({ tripId })
      setToken(res.token)
    } catch {
      toast.error('Could not set up calendar sync')
    } finally {
      setBusy(false)
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy — your browser blocked clipboard access')
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) setCopied(false); onOpenChange(o) }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sync to your calendar</DialogTitle>
          <DialogDescription>
            Subscribe once and every stop plus paid booking appears in Google, Apple or Outlook Calendar — updates stay live.
          </DialogDescription>
        </DialogHeader>

        {token === null ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              Calendar sync creates a private link for this trip. Anyone with the link can read the schedule, so share it like a password.
            </p>
            <Button onClick={() => void ensureToken()} disabled={busy} className="gap-2">
              <CalendarPlus className="size-4" />
              {busy ? 'Setting up…' : 'Enable calendar sync'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="truncate rounded-none bg-muted px-3 py-2 font-mono text-xs text-muted-foreground" title={feedUrl ?? ''}>
              {feedUrl?.replace(token, '•'.repeat(8))}
            </p>
            {googleUrl && (
              <Button variant="default" className="gap-2" nativeButton={false} render={<a href={googleUrl} target="_blank" rel="noopener noreferrer" />}>
                <CalendarPlus className="size-4" /> Add to Google Calendar
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={() => feedUrl && void copy(feedUrl)}>
              {copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}
              {copied ? 'Copied' : 'Copy feed link'}
            </Button>
            <p className="text-xs text-muted-foreground">
              <Link2 className="mr-1 inline size-3 align-[-1px]" />
              In Apple Calendar choose File → New Calendar Subscription; in Outlook use “Add calendar → Subscribe from web”.
            </p>
            <div className="flex gap-2 border-t pt-3">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    const res = await rotate({ tripId })
                    setToken(res.token)
                    toast.success('Feed link rotated — the old link no longer works')
                  } catch {
                    toast.error('Could not rotate the link')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <RotateCcw className="size-3.5" /> Rotate link
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  try {
                    await disable({ tripId })
                    setToken(null)
                    toast.success('Calendar sync turned off')
                  } catch {
                    toast.error('Could not disable calendar sync')
                  } finally {
                    setBusy(false)
                  }
                }}
              >
                <ShieldOff className="size-3.5" /> Turn off
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
