'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Camera, LayoutGrid, Map as MapIcon, Sparkles, Timeline } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { KenyaMap } from './kenya-map'
import { MomentAlbum } from './moment-album'
import { ListingImage, RequireAuth } from './shared'

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
  const urlTrip = params.get('trip')
  const [selectedId, setSelectedId] = useState<Id<'trips'> | undefined>(undefined)
  const selected = selectedId ?? (urlTrip as Id<'trips'> | undefined) ?? trips?.[0]?._id
  const moments = useQuery(api.moments.list, selected ? { tripId: selected } : 'skip')

  const uploadUrl = useMutation(api.moments.generateUploadUrl)
  const create = useMutation(api.moments.create)
  const selectedTrip = useQuery(api.trips.getWithStops, selected ? { id: selected } : 'skip')

  const [addOpen, setAddOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [caption, setCaption] = useState('')
  const [location, setLocation] = useState('')
  const [stopId, setStopId] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  const [view, setView] = useState<'grid' | 'map' | 'timeline'>('grid')
  const tripStops = selectedTrip?.stops ?? []

  async function suggest() {
    if (!files.length) {
      toast.error('Add a photo first')
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
      const data = await response.json()
      if (!response.ok) throw new Error(data.error)
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
    try {
      const storageIds: Id<'_storage'>[] = []
      for (const file of files) {
        const url = await uploadUrl()
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
        const json = await response.json()
        if (!json.storageId) throw new Error('Upload failed')
        storageIds.push(json.storageId)
      }
      // If the moment is pinned to a trip stop, use the stop's coordinates;
      // otherwise fall back to the device location.
      const stop = tripStops.find(s => s._id === stopId)
      const coords = stop?.lat && stop?.lng
        ? { lat: stop.lat, lng: stop.lng }
        : await getCoords()
      await create({ tripId: selected, caption: caption.trim(), location: location.trim() || stop?.place || undefined, stopName: stop?.name, storageIds, public: false, lat: coords?.lat, lng: coords?.lng })
      setFiles([])
      setCaption('')
      setLocation('')
      setStopId('')
      setAddOpen(false)
      toast.success(stopId ? `Moment pinned to ${stop?.name}` : coords ? 'Moment saved with location' : 'Moment saved')
    } catch {
      toast.error('Could not save this moment')
    }
  }

  const mapPoints = (moments ?? []).filter(m => m.lat && m.lng).map(m => ({ id: m._id, name: m.caption, location: m.location || m.stopName || 'Somewhere in Kenya', lat: m.lat!, lng: m.lng! }))

  const timelineGroups = (moments ?? []).reduce<Record<string, typeof moments>>((acc, m) => {
    const key = new Date(m.createdAt).toLocaleDateString()
    ;(acc[key] = acc[key] || []).push(m)
    return acc
  }, {})

  return (
    <RequireAuth>
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Your travel journal</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">Moments</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {trips?.length ? (
              <Select value={selected} onValueChange={v => setSelectedId(v as Id<'trips'>)}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>{trips.map(t => <SelectItem key={t._id} value={t._id}>{t.name}</SelectItem>)}</SelectContent>
              </Select>
            ) : null}
            <Button onClick={() => setAddOpen(true)} disabled={!trips?.length}><Camera data-icon="inline-start" />Add a moment</Button>
          </div>
        </div>

        {trips?.length ? (
          <>
            {moments?.length ? (
              <div className="flex items-center gap-1 rounded-lg border p-1 w-fit">
                <button onClick={() => setView('grid')} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors', view === 'grid' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}><LayoutGrid className="size-4" />Album</button>
                <button onClick={() => setView('map')} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors', view === 'map' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}><MapIcon className="size-4" />Map</button>
                <button onClick={() => setView('timeline')} className={cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors', view === 'timeline' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}><Timeline className="size-4" />Timeline</button>
              </div>
            ) : null}

            {view === 'grid' && <MomentAlbum tripId={selected!} onUploadClick={() => setAddOpen(true)} />}

            {view === 'map' && (
              mapPoints.length ? (
                <KenyaMap points={mapPoints} className="h-[560px]" />
              ) : (
                <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
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
                        {group!.map(m => (
                          <div key={m._id} className="relative aspect-square overflow-hidden rounded-lg">
                            <ListingImage src={m.imageUrl || '/placeholder.jpg'} fill alt={m.caption} className="object-cover" sizes="(max-width: 768px) 50vw, 25vw" />
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null
            )}
          </>
        ) : (
          <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
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
                <FieldLabel>Photos</FieldLabel>
                <Input type="file" accept="image/*" multiple onChange={e => setFiles(Array.from(e.target.files || []).slice(0, 6))} />
                {files.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{files.length} photo{files.length === 1 ? '' : 's'} selected (up to 6)</p>}
              </Field>
              <Field>
                <FieldLabel>Caption</FieldLabel>
                <Textarea value={caption} onChange={e => setCaption(e.target.value)} placeholder="The story behind this moment…" />
              </Field>
              {tripStops.length > 0 && (
                <Field>
                  <FieldLabel>Pin to itinerary stop</FieldLabel>
                  <Select value={stopId} onValueChange={setStopId}>
                    <SelectTrigger><SelectValue placeholder="Not pinned to a stop" /></SelectTrigger>
                    <SelectContent>
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
            <Button onClick={save} disabled={!files.length || !caption.trim()}>Save moment</Button>
          </DialogContent>
        </Dialog>
      </div>
    </RequireAuth>
  )
}
