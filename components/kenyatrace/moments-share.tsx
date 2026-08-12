'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { ChevronLeft, ChevronRight, MapPin, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'

export function MomentsShare({ tripId }: { tripId: string }) {
  const data = useQuery(api.moments.publicForTrip, { tripId: tripId as any })
  const [lightbox, setLightbox] = useState<{ moment: number; image: number } | null>(null)

  if (data === undefined) return <div className="mx-auto max-w-6xl px-5 py-10"><div className="h-64 animate-pulse rounded-lg bg-secondary" /></div>
  if (!data) return <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-5 py-24 text-center"><MapPin className="size-10 text-primary" /><h1 className="font-serif text-4xl">Trip not found</h1><p className="text-muted-foreground">This share link is not available.</p></div>

  const { trip, moments } = data
  const active = lightbox ? moments[lightbox.moment] : null
  const activeImages = active?.imageUrls?.length ? active.imageUrls : active?.imageUrl ? [active.imageUrl] : []
  const activeImageIndex = active ? Math.min(lightbox!.image, activeImages.length - 1) : 0

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-10">
      <div className="overflow-hidden rounded-lg bg-primary px-6 py-10 text-primary-foreground md:px-10">
        <Badge className="bg-accent text-accent-foreground">Shared with you</Badge>
        <h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight">{trip.name}</h1>
        <p className="mt-2 opacity-80">{trip.destination} · {trip.startDate} → {trip.endDate}</p>
      </div>

      {moments.length === 0 ? (
        <div className="flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
          <p className="font-serif text-2xl">No shared moments yet</p>
          <p className="mt-2 max-w-md text-muted-foreground">The traveller hasn&apos;t made any moments public on this trip.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {moments.map((m, mi) => (
            <div key={m._id} className="group relative aspect-square overflow-hidden rounded-lg">
              <button className="block size-full" onClick={() => setLightbox({ moment: mi, image: 0 })} aria-label={`View moment: ${m.caption}`}>
                <Image src={m.imageUrl || '/placeholder.jpg'} fill className="object-cover transition-transform duration-300 group-hover:scale-105" alt={m.caption} sizes="(max-width: 768px) 50vw, 33vw" />
              </button>
              {m.best && <Badge className="absolute left-2 top-2 bg-accent text-accent-foreground">Best moment</Badge>}
              {m.location && <span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white">{m.location}</span>}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!active} onOpenChange={open => { if (!open) setLightbox(null) }}>
        <DialogContent className="max-w-3xl">
          {active && (
            <>
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-black/5">
                <Image src={activeImages[activeImageIndex]} fill className="object-contain" alt={active.caption} sizes="(max-width: 768px) 100vw, 768px" />
                {activeImages.length > 1 && (
                  <>
                    <button aria-label="Previous photo" onClick={() => setLightbox({ moment: lightbox!.moment, image: activeImageIndex === 0 ? activeImages.length - 1 : activeImageIndex - 1 })} className="absolute left-3 flex size-9 items-center justify-center rounded-full bg-card/90 text-card-foreground shadow-sm"><ChevronLeft className="size-5" /></button>
                    <button aria-label="Next photo" onClick={() => setLightbox({ moment: lightbox!.moment, image: (activeImageIndex + 1) % activeImages.length })} className="absolute right-3 flex size-9 items-center justify-center rounded-full bg-card/90 text-card-foreground shadow-sm"><ChevronRight className="size-5" /></button>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{active.caption}</span>
                <span>{new Date(active.createdAt).toLocaleDateString()}{active.location ? ` · ${active.location}` : ''}{activeImages.length > 1 ? ` · ${activeImageIndex + 1} / ${activeImages.length}` : ''}</span>
              </div>
              <div className="flex justify-end">
                <DialogClose render={<Button variant="ghost" size="sm" />}><X className="size-4" /> Close</DialogClose>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
