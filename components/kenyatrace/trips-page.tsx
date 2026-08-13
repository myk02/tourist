'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Compass, Copy, CopyPlus, LogOut, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { formatKES } from '@/lib/kenya-data'
import { cn } from '@/lib/utils'
import { RequireSubscription } from './paywall'

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  booked: 'Booked',
  travelling: 'In progress',
  completed: 'Completed',
}

const STATUS_PROGRESS: Record<string, number> = {
  planning: 25,
  booked: 50,
  travelling: 75,
  completed: 100,
}

type Trip = NonNullable<ReturnType<typeof useQuery<typeof api.trips.list>>>[number]

function daysUntil(dateStr: string) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(`${dateStr}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function countdown(trip: Trip) {
  if (trip.status === 'completed') return 'Completed trip'
  const d = daysUntil(trip.startDate)
  const ago = Math.abs(d)
  if (d > 0) return `Starts in ${d} day${d === 1 ? '' : 's'}`
  if (d === 0) return 'Starts today'
  if (trip.status === 'travelling') return `Started ${ago} day${ago === 1 ? '' : 's'} ago`
  if (trip.status === 'booked') return `Booked · ${ago} day${ago === 1 ? '' : 's'} past start`
  return `Plan due — ${ago} day${ago === 1 ? '' : 's'} past start`
}

function TripCard({ trip, onDuplicate, onCopyLink, onDelete, onLeave }: { trip: Trip; onDuplicate: (t: Trip) => void; onCopyLink: (t: Trip) => void; onDelete: (t: Trip) => void; onLeave: (t: Trip) => void }) {
  const spend = trip.budget > 0 ? Math.min((trip.totalCost / trip.budget) * 100, 100) : 0
  const isOwner = trip.role === 'owner'
  return (
    <Card className="group overflow-hidden p-0 transition-colors hover:border-primary/40">
      <Link href={`/trips/${trip._id}`}>
        <div className="relative h-40 overflow-hidden">
          <Image src={trip.coverImage || '/kenya-hero.png'} fill className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" alt="" sizes="(max-width: 768px) 100vw, 50vw" />
          <div className="absolute left-3 top-3 flex flex-col items-start gap-1.5">
            <Badge className={cn(trip.status === 'completed' && 'bg-card text-card-foreground')}>{STATUS_LABEL[trip.status] ?? trip.status}</Badge>
            {!isOwner && <Badge className="bg-accent text-accent-foreground">Shared · {trip.role === 'editor' ? 'Editor' : 'Viewer'}</Badge>}
          </div>
          <div className="absolute right-3 top-3 rounded-full bg-card/95 px-2.5 py-1 text-xs font-semibold shadow-soft backdrop-blur-sm">{formatKES(trip.totalCost)}</div>
        </div>
      </Link>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="font-serif text-xl tracking-tight">{trip.name}</CardTitle>
            <CardDescription className="mt-1">{trip.destination} · {trip.startDate} → {trip.endDate}</CardDescription>
          </div>
        </div>
        <p className={cn('text-sm font-medium', trip.status === 'completed' ? 'text-muted-foreground' : 'text-primary')}>{countdown(trip)}</p>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">Plan</span>
            <Progress className="h-1.5" value={STATUS_PROGRESS[trip.status] ?? 25} />
            <span className="w-10 shrink-0 text-right text-[11px] text-muted-foreground">{STATUS_PROGRESS[trip.status] ?? 25}%</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-14 shrink-0 text-[11px] uppercase tracking-wide text-muted-foreground">Budget</span>
            <Progress className="h-1.5" value={spend} />
            <span className="w-10 shrink-0 text-right text-[11px] text-muted-foreground">{Math.round(spend)}%</span>
          </div>
        </div>
      </CardHeader>
      <CardFooter className="flex gap-2">
        <Button className="flex-1" nativeButton={false} render={<Link href={`/trips/${trip._id}`} />}>Open trip</Button>
        <Button variant="outline" size="icon" aria-label="Duplicate trip" onClick={() => onDuplicate(trip)}>
          <CopyPlus className="size-4" />
        </Button>
        <Button variant="outline" size="icon" aria-label="Copy trip link" onClick={() => onCopyLink(trip)}>
          <Copy className="size-4" />
        </Button>
        {isOwner ? (
          <Button variant="outline" size="icon" aria-label="Delete trip" onClick={() => onDelete(trip)} className="hover:bg-destructive/10 hover:text-destructive">
            <Trash2 className="size-4" />
          </Button>
        ) : (
          <Button variant="outline" size="icon" aria-label="Leave shared trip" onClick={() => onLeave(trip)} className="hover:bg-destructive/10 hover:text-destructive">
            <LogOut className="size-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

export function Trips({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const trips = useQuery(api.trips.list)
  const duplicateMutation = useMutation(api.trips.duplicate)
  const removeMutation = useMutation(api.trips.remove)
  const leaveMutation = useMutation(api.trips.leaveTrip)
  const [confirmAction, setConfirmAction] = useState<{ trip: Trip; mode: 'delete' | 'leave' } | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function duplicate(trip: Trip) {
    try {
      const id = await duplicateMutation({ id: trip._id })
      toast.success('Trip duplicated')
      router.push(`/trips/${id}`)
    } catch {
      toast.error('Could not duplicate this trip')
    }
  }

  async function copyLink(trip: Trip) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/trips/${trip._id}`)
      toast.success('Trip link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  async function confirmActionRun() {
    if (!confirmAction) return
    setDeleting(true)
    try {
      if (confirmAction.mode === 'delete') {
        await removeMutation({ id: confirmAction.trip._id })
        toast.success('Trip deleted')
      } else {
        await leaveMutation({ tripId: confirmAction.trip._id })
        toast.success('You left the shared trip')
      }
      setConfirmAction(null)
    } catch {
      toast.error(confirmAction.mode === 'delete' ? 'Could not delete this trip' : 'Could not leave this trip')
    } finally {
      setDeleting(false)
    }
  }

  if (trips === undefined) return <div className="kt-shimmer h-52 rounded-2xl" />

  const empty = (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center">
      <Compass className="size-8 text-primary" />
      <p className="mt-4 font-serif text-2xl">No saved trips yet</p>
      <p className="mt-2 max-w-md text-muted-foreground">Plan with AI or build your first route yourself.</p>
    </div>
  )

  const groups = [
    { key: 'upcoming', label: 'Upcoming', trips: trips.filter(t => t.status !== 'travelling' && t.status !== 'completed') },
    { key: 'inprogress', label: 'In progress', trips: trips.filter(t => t.status === 'travelling') },
    { key: 'completed', label: 'Completed', trips: trips.filter(t => t.status === 'completed') },
  ].filter(g => g.trips.length > 0)

  const planningTrips = trips.filter(t => t.status === 'planning')
  const mostUrgentPlanning = planningTrips.sort((a, b) => a.startDate.localeCompare(b.startDate))[0]

  // Collaborators ride the owner's subscription — never paywall a user who only
  // has shared trips. Everyone else (new users, or owners) still goes through
  // the gate so the trial/subscription wall behaves as before.
  const hasOwned = trips.some(t => t.role === 'owner')
  const gateEnabled = hasOwned || trips.length === 0

  const card = (trip: Trip) => <TripCard key={trip._id} trip={trip} onDuplicate={duplicate} onCopyLink={copyLink} onDelete={t => setConfirmAction({ trip: t, mode: 'delete' })} onLeave={t => setConfirmAction({ trip: t, mode: 'leave' })} />

  const confirmDialog = (
    <Dialog open={confirmAction !== null} onOpenChange={open => { if (!open) setConfirmAction(null) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{confirmAction?.mode === 'leave' ? 'Leave this shared trip?' : 'Delete this trip?'}</DialogTitle>
          <DialogDescription>
            {confirmAction?.mode === 'leave'
              ? `You'll lose access to "${confirmAction.trip.name}". The owner can re-invite you any time.`
              : confirmAction ? `"${confirmAction.trip.name}" and its stops will be permanently removed. This can't be undone.` : 'This will permanently remove the trip.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button variant="destructive" disabled={deleting} onClick={confirmActionRun}>{deleting ? 'Working…' : confirmAction?.mode === 'leave' ? 'Leave trip' : 'Delete trip'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  if (compact) {
    if (trips.length === 0) return empty
    return <div className="flex flex-col gap-8">{groups.map(g => <div key={g.key}><h2 className="mb-3 font-serif text-xl font-semibold tracking-tight">{g.label}</h2><div className="grid gap-5 md:grid-cols-2">{g.trips.map(card)}</div></div>)}{confirmDialog}</div>
  }

  return (
    <RequireSubscription enabled={gateEnabled}>
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-10">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Your journeys</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">Trips</h1>
          </div>
          <Button nativeButton={false} render={<Link href="/plan" />}><Plus data-icon="inline-start" />New trip</Button>
        </div>
        {planningTrips.length > 0 && mostUrgentPlanning && (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-4 shadow-soft">
            <div className="flex items-center gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),#000_25%)] text-primary-foreground shadow-xs"><Compass /></span>
              <div>
                <p className="font-semibold">Plan fast — {planningTrips.length} trip{planningTrips.length === 1 ? '' : 's'} still need{planningTrips.length === 1 ? 's' : ''} planning</p>
                <p className="text-sm text-muted-foreground">Finish your itinerary before you head out, and your trip will be ready to book, track and share.</p>
              </div>
            </div>
            <Button nativeButton={false} render={<Link href={`/trips/${mostUrgentPlanning._id}`} />}>Plan now</Button>
          </div>
        )}
        {trips.length === 0 ? empty : (
          <div className="flex flex-col gap-8">
            {groups.map(g => (
              <div key={g.key}>
                <h2 className="mb-3 font-serif text-xl font-semibold tracking-tight">{g.label}</h2>
                <div className="grid gap-5 md:grid-cols-2">{g.trips.map(card)}</div>
              </div>
            ))}
          </div>
        )}
        {confirmDialog}
      </div>
    </RequireSubscription>
  )
}
