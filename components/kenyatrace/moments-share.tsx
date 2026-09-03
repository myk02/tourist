'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Check, ChevronLeft, ChevronRight, Copy, LayoutGrid, MapPin, MessageCircle, Send, Share2, Star, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { EmptyMoments } from '@/components/ui/kt/empty-state'
import { GradientHero } from '@/components/ui/kt/gradient-hero'
import { isValidConvexId } from '@/lib/id'
import { prettyDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

type Media = { type: 'video' | 'image'; url: string }

function mediaOf(m: { imageUrl: string | null; imageUrls?: string[]; videoUrls?: string[] }): Media[] {
  const images = m.imageUrls?.length ? m.imageUrls : m.imageUrl ? [m.imageUrl] : []
  const videos = m.videoUrls ?? []
  const media: Media[] = [
    ...videos.map(url => ({ type: 'video' as const, url })),
    ...images.map(url => ({ type: 'image' as const, url })),
  ]
  return media.length ? media : [{ type: 'image', url: '/kenya-hero.png' }]
}

function MediaTile({ media, alt, className }: { media: Media; alt: string; className?: string }) {
  if (media.type === 'video') {
    return <video src={media.url} controls muted playsInline preload="metadata" aria-label={alt} className={cn('size-full object-cover', className)} />
  }
  return <Image src={media.url} fill className={cn('object-cover', className)} alt={alt} sizes="(max-width: 768px) 50vw, 33vw" />
}

export function MomentsShare({ tripId, token }: { tripId: string; token?: string }) {
  // A malformed /moments/<garbage> route must show the not-found state, not
  // make Convex throw on an invalid id.
  const validTripId = isValidConvexId(tripId)
  const data = useQuery(api.moments.publicForTrip, validTripId ? { tripId: tripId as Id<'trips'>, token: token ?? '' } : 'skip')
  const [lightbox, setLightbox] = useState<{ moment: number; media: number } | null>(null)
  const [copied, setCopied] = useState(false)

  const notFound = <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-5 py-24 text-center"><MapPin className="size-10 text-primary" /><h1 className="font-serif text-4xl">Trip not found</h1><p className="text-muted-foreground">This share link is not available.</p></div>
  if (!validTripId) return notFound
  if (data === undefined) return <div className="mx-auto max-w-6xl px-5 py-10"><div className="kt-shimmer h-64 rounded-2xl" /></div>
  if (!data) return notFound

  const { trip, moments } = data
  const active = lightbox ? moments[lightbox.moment] : null
  const activeMedia = active ? mediaOf(active) : []
  const activeIndex = active ? Math.min(lightbox!.media, activeMedia.length - 1) : 0
  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/moments/${tripId}${token ? `?t=${token}` : ''}` : ''
  const shareText = `I just explored ${trip.destination} with KenyaTrace${trip.rating ? ` and rated it ${trip.rating}/5` : ''}. Plan your own trip: ${shareLink}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(shareLink)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy link')
    }
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7 px-5 py-10">
      <GradientHero className="px-6 py-10 md:px-10">
        <Badge className="bg-accent text-accent-foreground">Shared with you</Badge>
        <h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight">{trip.name}</h1>
        <p className="mt-2 opacity-80">{trip.origin ? `${trip.origin} → ` : ''}{trip.destination} · {prettyDate(trip.startDate)} → {prettyDate(trip.endDate)}</p>
        {trip.rating ? (
          <div className="mt-4 flex items-center gap-3">
            <span className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map(n => <Star key={n} className={cn('size-5', n <= trip.rating! ? 'fill-amber-400 text-amber-400' : 'text-primary-foreground/30')} />)}
            </span>
            <span className="text-sm font-medium">{trip.rating}/5</span>
          </div>
        ) : null}
        {trip.review ? <p className="mt-3 max-w-2xl italic opacity-90">“{trip.review}”</p> : null}
      </GradientHero>

      {moments.length === 0 ? (
        <EmptyMoments />
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          {moments.map((m, mi) => {
            const media = mediaOf(m)
            return (
              <div key={m._id} className="group relative aspect-square overflow-hidden rounded-xl">
                <button className="block size-full" onClick={() => setLightbox({ moment: mi, media: 0 })} aria-label={`View moment: ${m.caption}`}>
                  <MediaTile media={media[0]} alt={m.caption} className="transition-transform duration-300 group-hover:scale-105" />
                </button>
                {media.length > 1 && <Badge className="absolute left-2 top-2 bg-card/90 text-card-foreground">+{media.length} media</Badge>}
                {m.best && <Badge className="absolute left-2 top-2 bg-accent text-accent-foreground">Best moment</Badge>}
                {m.location && <span className="absolute bottom-2 left-2 rounded-md bg-black/50 px-2 py-0.5 text-xs text-white">{m.location}</span>}
              </div>
            )
          })}
        </div>
      )}

      {/* Recommend KenyaTrace */}
      <div className="rounded-2xl border bg-card p-5 shadow-soft">
        <p className="flex items-center gap-2 font-semibold"><Share2 className="size-4 text-primary" /> Love this? Recommend KenyaTrace</p>
        <p className="mt-1 text-sm text-muted-foreground">Share this trip — it works without an account.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={copy} className="gap-1.5">{copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}{copied ? 'Copied' : 'Copy link'}</Button>
          <Button variant="outline" nativeButton={false} render={<a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" />} className="gap-1.5"><MessageCircle className="size-4" />WhatsApp</Button>
          <Button variant="outline" nativeButton={false} render={<a href={`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" />} className="gap-1.5"><Send className="size-4" />Telegram</Button>
          <Button variant="outline" nativeButton={false} render={<a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareLink)}`} target="_blank" rel="noopener noreferrer" />} className="gap-1.5"><Share2 className="size-4" />Post</Button>
          <Button variant="outline" nativeButton={false} render={<a href={`/recap/${tripId}${token ? `?t=${token}` : ''}`} />} className="gap-1.5"><LayoutGrid className="size-4" />Open the 9-grid recap</Button>
        </div>
      </div>

      <Dialog open={!!active} onOpenChange={open => { if (!open) setLightbox(null) }}>
        <DialogContent className="sm:max-w-3xl">
          {active && (
            <>
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-muted">
                {activeMedia[activeIndex].type === 'video' ? (
                  <video src={activeMedia[activeIndex].url} controls autoPlay playsInline className="max-h-full w-full object-contain" />
                ) : (
                  <Image src={activeMedia[activeIndex].url} fill className="object-contain" alt={active.caption} sizes="(max-width: 768px) 100vw, 768px" />
                )}
                {activeMedia.length > 1 && (
                  <>
                    <button aria-label="Previous media" onClick={() => setLightbox({ moment: lightbox!.moment, media: activeIndex === 0 ? activeMedia.length - 1 : activeIndex - 1 })} className="absolute left-3 flex size-9 items-center justify-center rounded-full bg-card/90 text-card-foreground shadow-sm"><ChevronLeft className="size-5" /></button>
                    <button aria-label="Next media" onClick={() => setLightbox({ moment: lightbox!.moment, media: (activeIndex + 1) % activeMedia.length })} className="absolute right-3 flex size-9 items-center justify-center rounded-full bg-card/90 text-card-foreground shadow-sm"><ChevronRight className="size-5" /></button>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{active.caption}</span>
                <span>{new Date(active.createdAt).toLocaleDateString()}{active.location ? ` · ${active.location}` : ''}{activeMedia.length > 1 ? ` · ${activeIndex + 1} / ${activeMedia.length}` : ''}</span>
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
