'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { UserButton, useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { AlertCircle, Camera, Compass, Download, Heart, Sparkles, TrendingDown } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { GradientHero } from '@/components/ui/kt/gradient-hero'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { formatKES } from '@/lib/kenya-data'
import { cn } from '@/lib/utils'
import { BookingRow, ListingImage, RequireAuth, SourceBadge, sourceToFilter } from './shared'
import { SubscriptionSection } from './subscription-card'

const STYLES = ['Safari', 'Adventure', 'Culture', 'Beach', 'Relax', 'Luxury', 'Family', 'Couples']
const INTERESTS = ['Wildlife', 'Food', 'Culture', 'Beach', 'Adventure', 'Luxury', 'Local life']
const DESTINATIONS = ['Maasai Mara', 'Nairobi', 'Lake Naivasha', 'Amboseli', 'Diani & Coast', 'Lamu', 'Watamu', 'Samburu', 'Mount Kenya']
const PACES = [
  { value: 'relaxed', label: 'Relaxed', hint: 'Max 3 stops a day' },
  { value: 'balanced', label: 'Balanced', hint: '3–4 stops a day' },
  { value: 'full', label: 'Full days', hint: '4–6 stops a day' },
] as const
const BUDGETS = [20000, 50000, 100000, 200000]

/** Whitelist for ?tab= deep links — a stale/garbage value must not blank the page. */
const TAB_IDS = ['overview', 'bookings', 'saved', 'preferences', 'subscription', 'settings']

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-none border px-3.5 py-1.5 text-sm font-medium transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

export function Profile() {
  const { user } = useUser()
  const me = useQuery(api.users.me)
  const trips = useQuery(api.trips.list)
  const bookings = useQuery(api.bookings.mine)
  const saved = useQuery(api.saved.listWithDetails)
  const drops = useQuery(api.saved.drops)
  const allMoments = useQuery(api.moments.allForOwner)
  const checkedStops = useQuery(api.trips.checkedStopCount)
  const sync = useMutation(api.users.sync)
  const cancel = useMutation(api.bookings.cancel)
  const removeSaved = useMutation(api.saved.remove)
  const setPrefs = useMutation(api.users.setPreferences)
  const setConsent = useMutation(api.users.setTrackingConsent)
  const params = useSearchParams()
  const router = useRouter()
  const requestedTab = params.get('tab')
  const [tab, setTab] = useState(requestedTab && TAB_IDS.includes(requestedTab) ? requestedTab : 'overview')

  // Keep the tab in sync with ?tab= so deep links and back/forward work even
  // while the profile is already mounted.
  useEffect(() => {
    const t = params.get('tab')
    if (t && TAB_IDS.includes(t)) setTab(t)
  }, [params])

  const [styles, setStyles] = useState<string[]>([])
  const [interests, setInterests] = useState<string[]>([])
  const [destinations, setDestinations] = useState<string[]>([])
  const [pace, setPace] = useState('balanced')
  const [budget, setBudget] = useState(100000)
  const [dirty, setDirty] = useState(false)

  const prefs = me?.preferences

  // Sync Clerk identity into Convex once per signed-in user. The Clerk `user`
  // object identity changes across re-renders, so an unguarded effect fires
  // the mutation repeatedly — and a silent catch hid sync outages entirely.
  const syncedUserRef = useRef<string | null>(null)
  useEffect(() => {
    const id = user?.id
    if (!id || syncedUserRef.current === id) return
    syncedUserRef.current = id
    sync({ name: user.fullName || user.firstName || 'Traveller', email: user.primaryEmailAddress?.emailAddress, image: user.imageUrl }).catch(err => {
      syncedUserRef.current = null
      console.warn('[profile] account sync failed', err)
    })
  }, [user, sync])

  useEffect(() => {
    if (dirty || !prefs) return
    setStyles(prefs.styles ?? [])
    setInterests(prefs.interests ?? [])
    setDestinations(prefs.destinations ?? [])
    setPace(prefs.pace ?? 'balanced')
    setBudget(prefs.budget ?? 100000)
  }, [prefs, dirty])

  async function handleCancel(id: Id<'bookings'>) {
    try {
      await cancel({ id })
      toast.success('Reservation cancelled')
    } catch {
      toast.error('Could not cancel this reservation')
    }
  }

  async function handleRemoveSaved(listingId: Id<'listings'>) {
    try {
      await removeSaved({ listingId })
      toast.success('Removed from saved')
    } catch {
      toast.error('Could not update saved list')
    }
  }

  async function savePreferences() {
    try {
      await setPrefs({ preferences: { styles, interests, destinations, pace, budget } })
      setDirty(false)
      toast.success('Preferences saved')
    } catch {
      toast.error('Could not save preferences')
    }
  }

  function exportData() {
    const data = {
      exportedAt: new Date().toISOString(),
      trips: trips ?? [],
      bookings: bookings ?? [],
      moments: (allMoments ?? []).map(m => ({ caption: m.caption, trip: m.tripName, createdAt: m.createdAt, public: m.public, location: m.location })),
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    // The anchor must be in the DOM for Firefox to honour the download.
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'kenyatrace-data.json'
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
    toast.success('Your data was exported')
  }

  const upcoming = (trips ?? [])
    .filter(t => t.status !== 'completed')
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]

  const completeness = prefs ? [prefs.styles?.length, prefs.interests?.length, prefs.destinations?.length, prefs.pace, prefs.budget].filter(Boolean).length * 20 : 0

  return (
    <RequireAuth>
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-5 py-10">
        <div className="flex flex-wrap items-center gap-4 rounded-none border bg-card px-5 py-4 shadow-soft">
          {user?.imageUrl ? <Image src={user.imageUrl} width={48} height={48} className="rounded-none" alt="Profile" /> : <span className="flex size-12 items-center justify-center rounded-none bg-secondary text-primary"><Compass /></span>}
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold tracking-tight">{user?.fullName || 'Kenya traveller'}</h1>
            <p className="truncate text-sm text-muted-foreground">{user?.primaryEmailAddress?.emailAddress}</p>
          </div>
          <UserButton />
        </div>

        <Tabs
          value={tab}
          onValueChange={v => {
            setTab(v)
            // Keep the selected tab in the URL so refresh/back/forward restore
            // it (the effect above keeps it in sync the other way around).
            const url = new URL(window.location.href)
            url.searchParams.set('tab', v)
            router.replace(url.pathname + url.search, { scroll: false })
          }}
        >
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="bookings">Bookings</TabsTrigger>
            <TabsTrigger value="saved">Saved</TabsTrigger>
            <TabsTrigger value="preferences">Preferences</TabsTrigger>
            <TabsTrigger value="subscription">Subscription</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="flex flex-col gap-7">
            {/* Airbnb-style travel snapshot: what this traveller has actually
                done, composed from counts that already exist. */}
            <GradientHero className="md:px-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-accent">Travel snapshot</p>
              <h2 className="mt-1 font-serif text-3xl font-semibold tracking-tight">
                {(user?.fullName || 'Kenya traveller').split(' ')[0]}&apos;s Kenya story
              </h2>
              <div className="mt-5 grid grid-cols-3 gap-4">
                <div>
                  <p className="font-serif text-3xl font-bold">{trips?.filter(t => t.status === 'completed').length ?? 0}</p>
                  <p className="text-sm opacity-80">{(trips?.length ?? 0) > (trips?.filter(t => t.status === 'completed').length ?? 0) ? `of ${trips?.length} trips` : 'trips taken'}</p>
                </div>
                <div>
                  <p className="font-serif text-3xl font-bold">{checkedStops ?? 0}</p>
                  <p className="text-sm opacity-80">places checked off</p>
                </div>
                <div>
                  <p className="font-serif text-3xl font-bold">{allMoments?.length ?? 0}</p>
                  <p className="text-sm opacity-80">moments captured</p>
                </div>
              </div>
            </GradientHero>
            {upcoming && (
              <Card>
                <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-widest text-primary">Next trip</p>
                    <p className="mt-1 font-serif text-2xl font-semibold tracking-tight">{upcoming.name}</p>
                    <p className="text-sm text-muted-foreground">{upcoming.destination} · {upcoming.startDate} → {upcoming.endDate}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge className="bg-card text-card-foreground">{upcoming.status.charAt(0).toUpperCase() + upcoming.status.slice(1)}</Badge>
                    <Button nativeButton={false} render={<Link href={`/trips/${upcoming._id}`} />}>Open trip</Button>
                  </div>
                </CardContent>
              </Card>
            )}
            <div className="flex flex-wrap gap-3">
              <Button nativeButton={false} render={<Link href="/plan" />}><Sparkles data-icon="inline-start" />Plan a trip</Button>
              <Button variant="outline" nativeButton={false} render={<Link href="/moments" />}><Camera data-icon="inline-start" />Upload a moment</Button>
              <Button variant="outline" nativeButton={false} render={<Link href="/discover" />}>Explore places</Button>
            </div>
          </TabsContent>

          <TabsContent value="bookings" className="flex flex-col gap-3">
            {bookings?.length ? (
              bookings.map(b => <BookingRow key={b._id} booking={b} onCancel={handleCancel} />)
            ) : (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-none border border-dashed p-8 text-center">
                <AlertCircle className="size-8 text-primary" />
                <p className="mt-4 font-serif text-2xl">No bookings yet</p>
                <p className="mt-2 text-muted-foreground">Reservations you make will appear here.</p>
                <Button className="mt-4" variant="outline" nativeButton={false} render={<Link href="/discover" />}>Explore places</Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="saved">
            {drops?.length ? (
              <div className="mb-5 flex items-center gap-3 rounded-none border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
                <TrendingDown className="size-4 shrink-0 text-emerald-600 dark:text-emerald-300" />
                <p className="text-emerald-800 dark:text-emerald-200">
                  <strong>{drops.length}</strong> saved spot{drops.length === 1 ? '' : 's'} dropped in price — grab {drops.length === 1 ? 'it' : 'them'} while {drops.length === 1 ? "it's" : "they're"} low.
                </p>
              </div>
            ) : null}
            {saved?.length ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {saved.map(s => {
                  const listing = s.listing
                  if (!listing) return null
                  const drop = (drops ?? []).find(d => d.listing._id === listing._id)
                  return (
                  <Card key={listing._id} className="group overflow-hidden p-0 transition-colors hover:border-primary/40">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      <Link href={`/discover/${listing.vertical}/${listing._id}`}>
                        <ListingImage src={listing.image} fill className="object-cover" alt={listing.name} sizes="(max-width: 768px) 100vw, 33vw" />
                      </Link>
                      <SourceBadge source={listing.source} className="absolute bottom-3 left-3" onClick={() => { const f = sourceToFilter(listing.source); if (f) router.push(`/discover/${listing.vertical}?source=${f}`) }} />
                      {drop && <span className="absolute left-3 top-3 rounded-none bg-emerald-600 px-2 py-0.5 text-xs font-bold text-white shadow-sm">-{drop.dropPct}%</span>}
                      <button aria-label="Remove from saved" onClick={() => handleRemoveSaved(listing._id)} className="absolute right-3 top-3 flex size-9 items-center justify-center rounded-none bg-card/90 text-red-500 shadow-sm">
                        <Heart className="size-4 fill-current" />
                      </button>
                    </div>
                    <Link href={`/discover/${listing.vertical}/${listing._id}`}>
                      <CardContent className="p-4">
                        <p className="font-semibold leading-tight">{listing.name}</p>
                        <p className="mt-0.5 truncate text-sm text-muted-foreground">{listing.location} · ★ {listing.rating}</p>
                        <p className="mt-1 font-semibold">
                          {drop ? (
                            <>
                              <span className="text-emerald-600 dark:text-emerald-300">{formatKES(listing.price)}</span>
                              <span className="ml-1.5 text-xs font-normal text-muted-foreground line-through">{formatKES(drop.priceAtSave)}</span>
                            </>
                          ) : (
                            formatKES(listing.price)
                          )}
                          <span className="font-normal text-muted-foreground"> / {listing.unit}</span>
                        </p>
                      </CardContent>
                    </Link>
                  </Card>
                  )
                })}
              </div>
            ) : (
              <div className="flex min-h-52 flex-col items-center justify-center rounded-none border border-dashed p-8 text-center">
                <Heart className="size-8 text-primary" />
                <p className="mt-4 font-serif text-2xl">Nothing saved yet</p>
                <p className="mt-2 text-muted-foreground">Tap the heart on any place to keep it here.</p>
                <Button className="mt-4" variant="outline" nativeButton={false} render={<Link href="/discover" />}>Discover places</Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="preferences" className="flex flex-col gap-6">
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Profile completeness</p>
                  <span className="text-sm font-semibold text-primary">{completeness}%</span>
                </div>
                <Progress className="mt-2 h-2" value={completeness} />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="flex flex-col gap-5 p-5">
                <div>
                  <label className="text-sm font-medium">Travel styles</label>
                  <div className="mt-2 flex flex-wrap gap-2">{STYLES.map(s => <Chip key={s} active={styles.includes(s)} onClick={() => { setDirty(true); setStyles(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]) }}>{s}</Chip>)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium">Interests</label>
                  <div className="mt-2 flex flex-wrap gap-2">{INTERESTS.map(i => <Chip key={i} active={interests.includes(i)} onClick={() => { setDirty(true); setInterests(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]) }}>{i}</Chip>)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium">Favourite destinations</label>
                  <div className="mt-2 flex flex-wrap gap-2">{DESTINATIONS.map(d => <Chip key={d} active={destinations.includes(d)} onClick={() => { setDirty(true); setDestinations(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]) }}>{d}</Chip>)}</div>
                </div>
                <div>
                  <label className="text-sm font-medium">Pace</label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {PACES.map(p => (
                      <button key={p.value} type="button" onClick={() => { setDirty(true); setPace(p.value) }} className={cn('rounded-none border px-2 py-2 text-sm transition-colors', pace === p.value ? 'border-primary bg-primary text-primary-foreground shadow-xs' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-card')}>
                        <span className="block font-medium">{p.label}</span>
                        <span className={cn('block text-[10px]', pace === p.value ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{p.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Typical budget</label>
                    <span className="text-sm font-semibold text-primary">{formatKES(budget)}</span>
                  </div>
                  <Slider className="mt-3" min={20000} max={200000} step={10000} value={[budget]} onValueChange={v => { setDirty(true); setBudget(Array.isArray(v) ? v[0] : v) }} aria-label="Typical budget" />
                  <div className="mt-1.5 flex justify-between text-[11px] text-muted-foreground">{BUDGETS.map(b => <button key={b} type="button" onClick={() => { setDirty(true); setBudget(b) }} className="transition-colors hover:text-foreground">{formatKES(b)}</button>)}</div>
                </div>
                <div className="flex justify-end gap-2">
                  {dirty && <p className="mr-auto self-center text-sm text-muted-foreground">Unsaved changes</p>}
                  <Button onClick={savePreferences} disabled={!dirty}>Save preferences</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscription"><SubscriptionSection /></TabsContent>

          <TabsContent value="settings" className="flex flex-col gap-4">
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <p className="font-semibold">Account</p>
                  <p className="text-sm text-muted-foreground">Photo, name and sign-in.</p>
                </div>
                <UserButton showName />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center justify-between gap-4 p-5">
                <div>
                  <p className="font-semibold">Location tracing</p>
                  <p className="text-sm text-muted-foreground">Record your live route on trips. Only you can see it.</p>
                </div>
                <Switch checked={me?.trackingConsent === true} onCheckedChange={v => setConsent({ consent: v }).catch(() => toast.error('Could not update location consent'))} />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
                <div>
                  <p className="font-semibold">Your data</p>
                  <p className="text-sm text-muted-foreground">Download your trips, bookings and moments.</p>
                </div>
                <Button variant="outline" onClick={exportData}><Download data-icon="inline-start" />Export data</Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </RequireAuth>
  )
}
