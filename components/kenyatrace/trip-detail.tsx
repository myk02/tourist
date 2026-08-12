'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { CalendarClock, Camera, Copy, CopyPlus, LocateFixed, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatKES } from '@/lib/kenya-data'
import { ItineraryEditor } from './itinerary-editor'
import { KenyaMap } from './kenya-map'
import { MomentAlbum } from './moment-album'
import { BookingRow, NotFound, useTripId } from './shared'
import type { Stop } from './types'

export function TripDetail() {
  const id = useTripId()
  const trip = useQuery(api.trips.getWithStops, { id })
  const bookings = useQuery(api.bookings.forTrip, { tripId: id })
  const remove = useMutation(api.trips.remove)
  const replaceStops = useMutation(api.trips.replaceStops)
  const updateTrip = useMutation(api.trips.update)
  const duplicateTrip = useMutation(api.trips.duplicate)
  const cancelBooking = useMutation(api.bookings.cancel)
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [updating, setUpdating] = useState(false)
  if (trip === undefined) return <div className="mx-auto max-w-6xl p-8"><div className="h-72 animate-pulse rounded-lg bg-secondary" /></div>
  if (!trip) return <NotFound />

  const NEXT_STATUS: Record<string, { status: string; label: string }> = {
    planning: { status: 'booked', label: 'Mark as booked' },
    booked: { status: 'travelling', label: 'Start travelling' },
    travelling: { status: 'completed', label: 'Mark complete' },
  }
  const nextStatus = NEXT_STATUS[trip.status]

  async function handleNextStatus() {
    if (!nextStatus) return
    setUpdating(true)
    try {
      await updateTrip({ id, patch: { status: nextStatus.status } })
      toast.success(`Trip marked as ${nextStatus.status}`)
    } catch {
      toast.error('Could not update trip status')
    } finally {
      setUpdating(false)
    }
  }

  async function handleDuplicate() {
    try {
      const newId = await duplicateTrip({ id })
      toast.success('Trip duplicated')
      router.push(`/trips/${newId}`)
    } catch {
      toast.error('Could not duplicate this trip')
    }
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/trips/${id}`)
      toast.success('Trip link copied')
    } catch {
      toast.error('Could not copy link')
    }
  }

  async function handleRemove() {
    try {
      await remove({ id })
      toast.success('Trip deleted')
      router.push('/trips')
    } catch {
      toast.error('Could not delete this trip')
    }
  }

  async function handleCancelBooking(bookingId: Id<'bookings'>) {
    try {
      await cancelBooking({ id: bookingId })
      toast.success('Reservation cancelled')
    } catch {
      toast.error('Could not cancel this reservation')
    }
  }

  async function handleSave(stops: Stop[]) {
    try {
      await replaceStops({
        tripId: id,
        stops: stops.map((s, i) => ({
          name: s.title,
          place: s.place,
          day: s.day,
          time: s.time,
          cost: s.cost,
          kind: s.kind,
          order: i,
          lat: s.lat,
          lng: s.lng,
          locked: s.locked,
          reason: s.reason,
          verified: s.verified,
          duration: s.duration,
        })),
      })
      toast.success('Itinerary saved')
    } catch {
      toast.error('Could not save changes')
    }
  }

  const stops = trip.stops.map(s => ({ day: s.day, time: s.time, title: s.name, place: s.place, cost: s.cost, kind: s.kind, lat: s.lat, lng: s.lng, locked: s.locked, reason: s.reason, verified: s.verified, duration: s.duration }))
  const route = trip.stops.filter(s => s.lat && s.lng).map(s => [s.lng!, s.lat!] as [number, number])
  const mapPoints = trip.stops.filter(s => s.lat && s.lng).map(s => ({ id: s._id, name: s.name, location: s.place, lat: s.lat!, lng: s.lng! }))
  const activeBookings = (bookings ?? []).filter(b => b.status !== 'cancelled')
  const bookingsTotal = activeBookings.reduce((sum, b) => sum + b.amount, 0)
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-8">
      <div className="overflow-hidden rounded-lg bg-primary px-6 py-10 text-primary-foreground md:px-10">
        <Badge className="bg-accent text-accent-foreground">{trip.startDate} — {trip.endDate}</Badge>
        <h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight">{trip.name}</h1>
        <p className="mt-2 opacity-80">{trip.destination}</p>
        {bookings !== undefined && activeBookings.length > 0 && (
          <p className="mt-3 flex items-center gap-2 text-sm font-medium opacity-90">
            <CalendarClock className="size-4" />
            {activeBookings.length} active reservation{activeBookings.length === 1 ? '' : 's'} · {formatKES(bookingsTotal)}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="secondary" nativeButton={false} render={<Link href={`/trips/${trip._id}/track`} />}><LocateFixed data-icon="inline-start" />Start live tracking</Button>
          <Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground" nativeButton={false} render={<Link href={`/moments?trip=${trip._id}`} />}><Camera data-icon="inline-start" />Moments</Button>
          {nextStatus && <Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground" onClick={handleNextStatus} disabled={updating}>{nextStatus.label}</Button>}
          <Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground" onClick={handleDuplicate}><CopyPlus data-icon="inline-start" />Duplicate</Button>
          <Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground" onClick={handleCopyLink}><Copy data-icon="inline-start" />Copy link</Button>
          <Button variant="outline" className="border-destructive/40 bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmOpen(true)}><Trash2 data-icon="inline-start" />Delete trip</Button>
        </div>
      </div>
      <Tabs defaultValue="itinerary">
        <TabsList><TabsTrigger value="itinerary">Itinerary</TabsTrigger><TabsTrigger value="route">Route map</TabsTrigger><TabsTrigger value="budget">Budget</TabsTrigger><TabsTrigger value="bookings">Bookings</TabsTrigger><TabsTrigger value="moments">Moments</TabsTrigger></TabsList>
        <TabsContent value="itinerary"><ItineraryEditor initial={stops} budget={trip.budget} title={trip.name} defaultMobileView={route.length > 0 ? 'map' : 'list'} onSave={handleSave} /></TabsContent>
        <TabsContent value="route"><KenyaMap points={mapPoints} route={route} /></TabsContent>
        <TabsContent value="budget"><Card><CardHeader><CardDescription>Total planned</CardDescription><CardTitle className="text-4xl">{formatKES(trip.totalCost)}</CardTitle><Progress value={Math.min((trip.totalCost / trip.budget) * 100, 100)} /></CardHeader></Card></TabsContent>
        <TabsContent value="bookings">
          <div className="flex flex-col gap-3">
            {bookings === undefined ? (
              <div className="h-28 animate-pulse rounded-lg bg-secondary" />
            ) : bookings.length > 0 ? (
              bookings.map(b => <BookingRow key={b._id} booking={b} onCancel={handleCancelBooking} />)
            ) : (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
                <CalendarClock className="size-8 text-primary" />
                <p className="mt-4 font-serif text-2xl">No reservations for this trip</p>
                <p className="mt-2 max-w-md text-muted-foreground">When you request a reservation from a place page and link it to this trip, it will appear here.</p>
                <Button className="mt-4" variant="outline" nativeButton={false} render={<Link href="/discover" />}>Explore places</Button>
              </div>
            )}
          </div>
        </TabsContent>
        <TabsContent value="moments"><MomentAlbum tripId={id} /></TabsContent>
      </Tabs>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this trip?</DialogTitle><DialogDescription>This removes the trip and its stops permanently. This can't be undone.</DialogDescription></DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button variant="destructive" onClick={handleRemove}>Delete trip</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
