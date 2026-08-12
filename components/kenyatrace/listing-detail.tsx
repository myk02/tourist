'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { SignInButton, useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Camera, LocateFixed, Star } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatKES } from '@/lib/kenya-data'
import { ListingImage, SourceBadge, sourceToFilter } from './shared'

export function Detail({ id }: { id: string }) {
  const { isSignedIn } = useUser()
  const item = useQuery(api.listings.get, { id: id as Id<'listings'> })
  const trips = useQuery(api.trips.list)
  const create = useMutation(api.trips.create)
  const replaceStops = useMutation(api.trips.replaceStops)
  const reserve = useMutation(api.bookings.create)
  const router = useRouter()
  const signInRef = useRef<HTMLDivElement>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null)
  const [selectedId, setSelectedId] = useState<Id<'trips'> | null>(null)
  const [tab, setTab] = useState('details')
  const [reserveOpen, setReserveOpen] = useState(false)
  const [reserveTripId, setReserveTripId] = useState<Id<'trips'> | null>(null)
  const [checkIn, setCheckIn] = useState(() => new Date().toISOString().slice(0, 10))
  const [checkOut, setCheckOut] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10))
  const [guests, setGuests] = useState(2)
  const selectedTrip = useQuery(api.trips.getWithStops, selectedId ? { id: selectedId } : 'skip')

  // The page itself is public — signing in is only required for the actions.
  // If a guest taps Reserve / Add to trip, run the action right after they
  // finish signing in.
  useEffect(() => {
    if (isSignedIn && pendingAction) {
      const action = pendingAction
      setPendingAction(null)
      action()
    }
  }, [isSignedIn, pendingAction])

  function gate(action: () => void) {
    if (!isSignedIn) {
      setPendingAction(() => action)
      signInRef.current?.click()
      return
    }
    action()
  }

  function handleAddToTrip() {
    gate(() => setPickerOpen(true))
  }

  async function confirmAdd() {
    if (!item || !selectedId || !selectedTrip) return
    const existing = selectedTrip.stops.map(s => ({ name: s.name, place: s.place, day: s.day, time: s.time, cost: s.cost, kind: s.kind, order: s.order, lat: s.lat, lng: s.lng }))
    const newStop = { name: item.name, place: item.location, day: Math.max(...(existing.length ? existing.map(s => s.day) : [0]), 1), time: '09:00', cost: item.price, kind: item.vertical === 'stays' ? 'Stay' : 'Experience', order: existing.length, lat: item.lat, lng: item.lng }
    await replaceStops({ tripId: selectedId, stops: [...existing, newStop] })
    toast.success(`Added to ${selectedTrip.name}`)
    setPickerOpen(false)
    router.push(`/trips/${selectedId}`)
  }

  async function createNewTrip() {
    if (!item) return
    gate(async () => {
      const id = await create({ name: item.name + ' Trip', destination: item.location, startDate: new Date().toISOString().slice(0, 10), endDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), budget: Math.max(item.price * 3, 50000), totalCost: item.price, stops: [{ name: item.name, place: item.location, day: 1, time: '09:00', cost: item.price, kind: item.vertical === 'stays' ? 'Stay' : 'Experience', order: 0, lat: item.lat, lng: item.lng }] })
      toast.success('Trip created!')
      router.push(`/trips/${id}`)
      setPickerOpen(false)
    })
  }

  async function reserveThis() {
    if (!item) return
    try {
      const reference = await reserve({ listingId: item._id, type: item.vertical, amount: item.price, checkIn, checkOut, guests, tripId: reserveTripId ?? undefined })
      toast.success(`Reserved — ${reference}`, {
        action: { label: 'View bookings', onClick: () => router.push('/profile?tab=bookings') },
      })
      setReserveOpen(false)
    } catch {
      toast.error('Could not reserve this place')
    }
  }

  return (
    <>
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-8">
          <div className="overflow-hidden rounded-lg bg-primary px-6 py-10 text-primary-foreground md:px-10">
            <div className="flex items-center gap-2">
              <Badge className="bg-accent text-accent-foreground">{item?.vertical?.replace('-', ' ')?.toUpperCase()}</Badge>
              <SourceBadge source={item?.source} onClick={() => { const f = sourceToFilter(item?.source); if (f && item) router.push(`/discover/${item.vertical}?source=${f}`) }} />
            </div>
            <h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight">{item?.name}</h1>
            <p className="mt-2 opacity-80">{item?.location}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => setTab('itinerary')}><LocateFixed data-icon="inline-start" />Add to trip</Button>
              <Button variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground" nativeButton={false} render={<Link href="/moments" />}><Camera data-icon="inline-start" />Moments</Button>
            </div>
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList><TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="itinerary">Add to trip</TabsTrigger></TabsList>
            <TabsContent value="details">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-4">
                  <p className="text-lg">{item?.description}</p>
                  <div className="flex items-center gap-4"><Badge>{item?.tags?.join(', ')}</Badge><span className="flex items-center gap-1 text-sm font-semibold"><Star className="size-4 fill-accent text-accent" />{item?.rating}</span></div>
                  <div className="text-2xl font-semibold">{formatKES(item?.price || 0)}/{item?.unit}</div>
                  <Button className="w-fit" onClick={() => gate(() => setReserveOpen(true))} disabled={!item}>Reserve</Button>
                </div>
                <div className="relative h-[300px]"><ListingImage src={item?.image || '/kenya-hero.png'} fill className="object-cover rounded-xl" alt={item?.name || 'Listing'} /></div>
              </div>
            </TabsContent>
            <TabsContent value="itinerary">
              {!item ? <div className="py-8 text-center">Loading...</div> : (
                <div className="space-y-4">
                  <p className="text-muted-foreground">Add this place to one of your trips, or start a new one around it.</p>
                  <div className="flex flex-wrap gap-3"><Button onClick={handleAddToTrip}>Add to existing trip</Button><Button variant="outline" onClick={createNewTrip}>Create new trip</Button></div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>
        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add to trip</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <Select value={selectedId?.toString() || ''} onValueChange={v => setSelectedId(v as Id<'trips'> | null)}>
                <SelectTrigger><SelectValue placeholder="Select a trip" /></SelectTrigger>
                <SelectContent>{trips?.map(t => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
              <Button className="w-full" disabled={!selectedId} onClick={confirmAdd}>Add stop</Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={reserveOpen} onOpenChange={setReserveOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Request reservation</DialogTitle><DialogDescription>We hold your place and you can cancel anytime — no payment is collected yet.</DialogDescription></DialogHeader>
            <FieldGroup>
              <div className="grid grid-cols-2 gap-4">
                <Field><FieldLabel>Check-in</FieldLabel><Input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)} /></Field>
                <Field><FieldLabel>Check-out</FieldLabel><Input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)} /></Field>
              </div>
              <Field><FieldLabel>Guests</FieldLabel><Input type="number" min={1} max={20} value={guests} onChange={e => setGuests(parseInt(e.target.value, 10) || 1)} /></Field>
              <Field>
                <FieldLabel>Link to trip (optional)</FieldLabel>
                <Select value={reserveTripId?.toString() || ''} onValueChange={v => setReserveTripId(v ? (v as Id<'trips'>) : null)}>
                  <SelectTrigger><SelectValue placeholder="No trip — standalone request" /></SelectTrigger>
                  <SelectContent>{trips?.map(t => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </FieldGroup>
            <Button className="w-full" onClick={reserveThis} disabled={!item}>Request reservation</Button>
          </DialogContent>
        </Dialog>
      <SignInButton mode="modal"><div ref={signInRef} style={{ display: 'none' }} /></SignInButton>
    </>
  )
}
