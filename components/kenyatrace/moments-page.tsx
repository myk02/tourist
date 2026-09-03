'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { isValidConvexId } from '@/lib/id'
import { Camera, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/ui/kt/brand-mark'
import { PillToggle } from '@/components/ui/kt/pill-toggle'
import { ProgressBar } from '@/components/ui/kt/progress-bar'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { haversineKm } from '@/lib/travel'
import { KenyaMap } from './kenya-map'
import { MomentAlbum } from './moment-album'
import { ListingImage } from './shared'
import { RequireSubscription } from './paywall'

function fileToDataUrl(file: File, maxSize = 1100): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.82))
      }
      img.onerror = () => reject(new Error('Could not read image'))
      img.src = reader.result as string
    }
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.readAsDataURL(file)
  })
}

function getCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null)
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }), () => resolve(null), { timeout: 4000, maximumAge: 120000 })
  })
}

export function Moments() {
  const params = useSearchParams()
  const trips = useQuery(api.trips.list)
  // Moments can only be added on trips the traveller owns — shared trips are
  // read-only here (the owner's album is private to them), so the dropdown
  // only offers owned trips and shared selections get a notice instead.
  const ownedTrips = (trips ?? []).filter(t => t.role === 'owner')
  // A hand-edited /moments?trip=<garbage> link must fall back to the default
  // selection instead of feeding a malformed id into Convex (which throws).
  const urlTripRaw = params.get('trip')
  const urlTrip = urlTripRaw && isValidConvexId(urlTripRaw) ? (urlTripRaw as Id<'trips'>) : undefined
  const [selectedId, setSelectedId] = useState<Id<'trips'> | undefined>(undefined)
  const selected = selectedId ?? urlTrip ?? trips?.[0]?._id
  const selectedOwned = ownedTrips.some(t => t._id === selected)
  const moments = useQuery(api.moments.list, selected ? { tripId: selected } : 'skip')

  const uploadUrl = useMutation(api.moments.generateUploadUrl)
  const create = useMutation(api.moments.create)
  const selectedTrip = useQuery(api.trips.getWithStops, selected ? { id: selected } : 'skip')
  const credit = useQuery(api.moments.credit)

  const [addOpen, setAddOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [caption, setCaption] = useState('')
  const [location, setLocation] = useState('')
  const [stopId, setStopId] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'grid' | 'map' | 'timeline'>('grid')
  const tripStops = selectedTrip?.stops ?? []

  // ── Auto stop-association ──────────────────────────────────────────────────
  // When the upload dialog opens, quietly grab the device location and pin
  // the moment to the nearest itinerary stop within 60 km (a long day's
  // reach) — so photos land on the right stop without any manual picking.
  const [autoCoords, setAutoCoords] = useState<{ lat: number; lng: number } | null>(null)
  const autoPinnedRef = useRef(false)

  useEffect(() => {
    if (!addOpen || autoCoords) return
    let cancelled = false
    getCoords().then(c => { if (!cancelled && c) setAutoCoords(c) })
    return () => { cancelled = true }
  }, [addOpen, autoCoords])

  useEffect(() => {
    if (!autoCoords || autoPinnedRef.current || stopId || !tripStops.length) return
    let best: (typeof tripStops)[number] | null = null
    let bestD = Infinity
    for (const s of tripStops) {
      if (s.lat == null || s.lng == null) continue
      const d = haversineKm(autoCoords.lat, autoCoords.lng, s.lat, s.lng)
      if (d < bestD) { bestD = d; best = s }
    }
    if (best && bestD <= 60) {
      autoPinnedRef.current = true
      setStopId(best._id)
      setLocation(prev => prev || best.place)
    }
  }, [autoCoords, tripStops, stopId])

  async function suggest() {
    if (!files.length || files[0].type.startsWith('video/')) {
      toast.error('Add a photo first to suggest a caption')
      return
    }
    setSuggesting(true)
    try {
      const dataUrl = await fileToDataUrl(files[0])
      const response = await fetch('/api/caption', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ imageData: dataUrl }),
      })
      if (!response.ok) {
        const err = await response.json().catch(() => null)
        throw new Error(err?.error || 'Could not suggest a caption')
      }
      const data = await response.json()
      setCaption(data.caption || '')
      setLocation(data.location || '')
      toast.success('Caption suggested')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not suggest a caption')
    } finally {
      setSuggesting(false)
    }
  }

  async function save() {
    if (!selected || !files.length || !caption.trim()) {
      toast.error('Choose a trip, add at least one photo and a caption')
      return
    }
    // No double-tap: uploads + create are one atomic busy window.
    if (saving) return
    setSaving(true)
    try {
      const storageIds: Id<'_storage'>[] = []
      const videoIds: Id<'_storage'>[] = []
      for (const file of files) {
        const url = await uploadUrl()
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
        const json = await response.json()
        if (!json.storageId) throw new Error('Upload failed')
        if (file.type.startsWith('video/')) videoIds.push(json.storageId)
        else storageIds.push(json.storageId)
      }
      // If the moment is pinned to a trip stop, use the stop's coordinates;
      // otherwise use the device location captured when the dialog opened
      // (the uploads above already took time, so re-asking would be stale).
      const stop = tripStops.find(s => s._id === stopId)
      const coords = stop?.lat != null && stop?.lng != null
        ? { lat: stop.lat, lng: stop.lng }
        : autoCoords ?? await getCoords()
      const { earnedDays } = await create({ tripId: selected, caption: caption.trim(), location: location.trim() || stop?.place || undefined, stopName: stop?.name, storageIds: storageIds.length ? storageIds : undefined, videoStorageIds: videoIds.length ? videoIds : undefined, public: false, lat: coords?.lat, lng: coords?.lng })
      setFiles([])
      setCaption('')
      setLocation('')
      setStopId('')
      autoPinnedRef.current = false
      setAddOpen(false)
      toast.success(earnedDays > 0 ? 'Moment saved — you earned a free day!' : stopId ? `Moment pinned to ${stop?.name}` : coords ? 'Moment saved with location' : 'Moment saved')
    } catch {
      toast.error('Could not save this moment')
    } finally {
      setSaving(false)
    }
  }

  // lat 0 is the equator (it runs through Kenya) — null-check, not truthiness.
  const mapPoints = (moments ?? []).filter(m => m.lat != null && m.lng != null).map(m => ({ id: m._id, name: m.caption, location: m.location || m.stopName || 'Somewhere in Kenya', lat: m.lat!, lng: m.lng! }))

  const timelineGroups = (moments ?? []).reduce<Record<string, typeof moments>>((acc, m) => {
    const key = new Date(m.createdAt).toLocaleDateString()
    ;(acc[key] = acc[key] || []).push(m)
    return acc
  }, {})

  return (
    <RequireSubscription>
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Your travel journal</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">Moments</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {ownedTrips.length ? (
              <Select value={selected} onValueChange={v => setSelectedId(v as Id<'trips'>)}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>{ownedTrips.map(t => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            ) : null}
            <Button onClick={() => setAddOpen(true)} disabled={!ownedTrips.length || !selectedOwned}><Camera data-icon="inline-start" />Add a moment</Button>
          </div>
        </div>

        {selected && !selectedOwned && (
          <div className="rounded-2xl border border-dashed px-4 py-3 text-sm text-muted-foreground">
            This is a trip shared with you — moments can only be added on trips you own.
          </div>
        )}

        {credit && (
          <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4 shadow-soft">
            <BrandMark icon="sparkles" size="sm" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Your moments earn free days</p>
              <p className="text-sm text-muted-foreground">
                {credit.earnedDays > 0 && <>You&apos;ve earned {credit.earnedDays} free day{credit.earnedDays === 1 ? '' : 's'} so far. </>}
                {credit.mediaForNextDay} more photo{credit.mediaForNextDay === 1 ? '' : 's'} = +1 free day of access.
              </p>
              <ProgressBar value={((credit.mediaTotal % 3) / 3) * 100} label="Progress to next free day" className="mt-2 w-full max-w-xs" />
            </div>
          </div>
        )}

        {trips?.length ? (
          <>
            {moments?.length ? (
              <PillToggle
                label="Moments view"
                value={view}
                onChange={setView}
                options={[
                  { value: 'grid', label: 'Album' },
                  { value: 'map', label: 'Map' },
                  { value: 'timeline', label: 'Timeline' },
                ]}
              />
            ) : null}

            {view === 'grid' && <MomentAlbum tripId={selected!} onUploadClick={() => setAddOpen(true)} />}

            {view === 'map' && (
              mapPoints.length ? (
                <KenyaMap points={mapPoints} className="h-[560px]" />
              ) : (
                <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center">
                  <p className="font-serif text-2xl">No geotagged moments</p>
                  <p className="mt-2 max-w-md text-muted-foreground">Moments saved with your location will appear on the map. Allow location access when you upload.</p>
                </div>
              )
            )}

            {view === 'timeline' && (
              moments?.length ? (
                <div className="flex flex-col gap-8">
                  {Object.entries(timelineGroups).map(([date, group]) => (
                    <div key={date}>
                      <h2 className="mb-3 font-serif text-xl font-semibold tracking-tight">{date}</h2>
                      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        {group!.map(m => {
                          // Video-only moments get a real <video> tile — a
                          // generic placeholder read as "broken".
                          const firstVideo = !m.imageUrl ? m.videoUrls?.[0] : undefined
                          return (
                            <div key={m._id} className="relative aspect-square overflow-hidden rounded-xl">
                              {m.imageUrl ? (
                                <ListingImage src={m.imageUrl} fill alt={m.caption} className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" />
                              ) : firstVideo ? (
                                <video src={firstVideo} muted playsInline preload="metadata" className="size-full object-cover" />
                              ) : (
                                <ListingImage src="/kenya-hero.png" fill alt="" className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" />
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null
            )}
          </>
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center">
            <p className="font-serif text-2xl">Moments belong to trips</p>
            <p className="mt-2 max-w-md text-muted-foreground">Plan your first trip and photos you add here will be tied to it.</p>
            <Button className="mt-4" variant="outline" nativeButton={false} render={<Link href="/plan" />}>Plan a trip</Button>
          </div>
        )}

        <Dialog open={addOpen} onOpenChange={open => { setAddOpen(open); if (!open) { setFiles([]); setCaption(''); setLocation(''); setStopId('') } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add a moment</DialogTitle><DialogDescription>Photos, a caption, and optionally a location — kept private until you share them.</DialogDescription></DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel>Photos & videos</FieldLabel>
                <Input type="file" accept="image/*,video/*" multiple onChange={e => setFiles(Array.from(e.target.files || []).slice(0, 8))} />
                {files.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{files.length} file{files.length === 1 ? '' : 's'} selected (up to 8)</p>}
              </Field>
              <Field>
                <FieldLabel>Caption</FieldLabel>
                <Textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="The story behind this moment…" />
              </Field>
              {tripStops.length > 0 && (
                <Field>
                  <FieldLabel>Pin to itinerary stop</FieldLabel>
                  <Select value={stopId || 'none'} onValueChange={v => setStopId(v === 'none' ? '' : (v ?? ''))}>
                    <SelectTrigger><SelectValue placeholder="Not pinned to a stop" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not pinned to a stop</SelectItem>
                      {tripStops.map(s => <SelectItem key={s._id} value={s._id}>{`Day ${s.day} · ${s.name}`}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <div className="flex items-center gap-2">
                <Field className="flex-1">
                  <FieldLabel>Location</FieldLabel>
                  <Input value={location} onChange={e => setLocation(e.target.value)} placeholder={stopId ? 'Filled from the stop' : 'Where was this?'} />
                </Field>
                <Button variant="outline" className="mt-5" onClick={suggest} disabled={suggesting || !files.length}>
                  <Sparkles className="size-4" />{suggesting ? 'Reading photo…' : 'Suggest'}
                </Button>
              </div>
            </FieldGroup>
            <Button onClick={save} disabled={!files.length || !caption.trim() || saving}>{saving ? 'Saving' : 'Save moment'}</Button>
          </DialogContent>
        </Dialog>
      </div>
    </RequireSubscription>
  )
}
