'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useMemo, useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Check, Copy, MapPin, MessageCircle, Send, Share2, Star, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/kt/empty-state'
import { GradientHero } from '@/components/ui/kt/gradient-hero'
import { isValidConvexId } from '@/lib/id'
import { calendarDayDiff, prettyDate } from '@/lib/dates'
import { cn } from '@/lib/utils'

type Moment = NonNullable<ReturnType<typeof useQuery<typeof api.moments.publicForTrip>>>['moments'][number]
type Media = { type: 'video' | 'image'; url: string }

function mediaOf(m: Moment): Media[] {
  const images = m.imageUrls?.length ? m.imageUrls : m.imageUrl ? [m.imageUrl] : []
  const videos = m.videoUrls ?? []
  const media: Media[] = [
    ...videos.map(url => ({ type: 'video' as const, url })),
    ...images.map(url => ({ type: 'image' as const, url })),
  ]
  return media.length ? media : [{ type: 'image', url: '/kenya-hero.png' }]
}

const GRID_SIZE = 9

/**
 * The 9-grid recap: up to nine of the trip's public moments arranged as a
 * shareable card. Prefers the traveller's "best" picks, then the newest.
 */
export function RecapView({ tripId, token }: { tripId: string; token?: string }) {
  // A malformed /recap/<garbage> route must show the not-found state, not
  // make Convex throw on an invalid id.
  const validTripId = isValidConvexId(tripId)
  const data = useQuery(api.moments.publicForTrip, validTripId ? { tripId: tripId as Id<'trips'>, token: token ?? '' } : 'skip')
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)

  const moments = useMemo(() => {
    if (!data) return []
    const ranked = [...data.moments].sort((a, b) => (b.best === a.best ? b.createdAt - a.createdAt : b.best ? 1 : -1))
    return ranked.slice(0, GRID_SIZE)
  }, [data])

  const notFound = (
    <div className="flex min-h-[80svh] items-center justify-center px-5">
      <div className="flex max-w-md flex-col items-center gap-4 rounded-2xl border bg-card p-8 text-center shadow-soft">
        <MapPin className="size-10 text-primary" />
        <h1 className="font-serif text-3xl font-semibold tracking-tight">Recap not found</h1>
        <p className="text-sm text-muted-foreground">This recap link isn&apos;t available.</p>
        <Button variant="outline" nativeButton={false} render={<Link href="/" />}>Back to KenyaTrace</Button>
      </div>
    </div>
  )

  if (!validTripId) return notFound
  if (data === undefined) return <div className="mx-auto max-w-3xl px-5 py-10"><div className="kt-shimmer aspect-square rounded-3xl" /></div>
  if (!data) return notFound

  const { trip } = data
  const shareLink = typeof window !== 'undefined' ? `${window.location.origin}/recap/${tripId}${token ? `?t=${token}` : ''}` : ''
  const shareText = `A recap of ${trip.destination} with KenyaTrace — plan your own trip: ${shareLink}`
  const active = lightbox != null ? moments[lightbox] : null
  // Unpacked-lite stats from real data only: shared moments, best picks, days.
  const bestCount = data.moments.filter(m => m.best).length
  const daySpan = trip.startDate && trip.endDate ? Math.max(calendarDayDiff(trip.startDate, trip.endDate) + 1, 1) : null
  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator

  async function nativeShare() {
    try {
      await navigator.share({ title: `Trip recap · ${trip.name}`, text: shareText, url: shareLink })
    } catch {
      // User dismissed the sheet — no error state needed.
    }
  }

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
    <div className="mx-auto flex max-w-3xl flex-col gap-7 px-5 py-10">
      <GradientHero>
        <Badge className="bg-accent text-accent-foreground">Trip recap</Badge>
        <h1 className="mt-3 font-serif text-3xl font-semibold tracking-tight">{trip.name}</h1>
        <p className="mt-1 opacity-80">{trip.origin ? `${trip.origin} → ` : ''}{trip.destination} · {prettyDate(trip.startDate)} → {prettyDate(trip.endDate)}</p>
        {trip.rating ? (
          <div className="mt-3 flex items-center gap-2">
            <span className="flex gap-0.5">
              {[1, 2, 3, 4, 5].map(n => <Star key={n} className={cn('size-4', n <= trip.rating! ? 'fill-amber-400 text-amber-400' : 'text-primary-foreground/30')} />)}
            </span>
            <span className="text-sm font-medium">{trip.rating}/5</span>
          </div>
        ) : null}
      </GradientHero>

      {data.moments.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-sm text-muted-foreground" aria-label="Trip statistics">
          <span><strong className="font-serif text-lg text-foreground">{data.moments.length}</strong> moment{data.moments.length === 1 ? '' : 's'}</span>
          {bestCount > 0 && <span><strong className="font-serif text-lg text-foreground">{bestCount}</strong> best pick{bestCount === 1 ? '' : 's'}</span>}
          {daySpan != null && <span><strong className="font-serif text-lg text-foreground">{daySpan}</strong> day{daySpan === 1 ? '' : 's'}</span>}
        </div>
      )}

      {moments.length === 0 ? (
        <EmptyState icon={Share2} title="Nothing shared yet" body="The traveller hasn't made any moments public on this trip, so there's no recap to show." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {moments.map((m, mi) => {
              const media = mediaOf(m)
              return (
                <div key={m._id} className="group relative aspect-square overflow-hidden rounded-xl">
                  <button className="block size-full" onClick={() => setLightbox(mi)} aria-label={`View moment: ${m.caption}`}>
                    {media[0].type === 'video' ? (
                      <video src={media[0].url} muted playsInline preload="metadata" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <Image src={media[0].url} fill className="object-cover transition-transform duration-300 group-hover:scale-105" alt={m.caption} sizes="(max-width: 768px) 33vw, 320px" />
                    )}
                  </button>
                  {m.best && <Badge className="absolute left-2 top-2 bg-accent text-accent-foreground"><Star className="size-3 fill-current" />Best</Badge>}
                </div>
              )
            })}
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-soft">
            <p className="flex items-center gap-2 font-semibold"><Share2 className="size-4 text-primary" /> Share this recap</p>
            <p className="mt-1 text-sm text-muted-foreground">Send it anywhere — it works without an account.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {canNativeShare && <Button onClick={nativeShare} className="gap-1.5"><Share2 className="size-4" />Share</Button>}
              <Button variant="outline" onClick={copy} className="gap-1.5">{copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}{copied ? 'Copied' : 'Copy link'}</Button>
              <Button variant="outline" nativeButton={false} render={<a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" />} className="gap-1.5"><MessageCircle className="size-4" />WhatsApp</Button>
              <Button variant="outline" nativeButton={false} render={<a href={`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" />} className="gap-1.5"><Send className="size-4" />Telegram</Button>
              <Button variant="outline" nativeButton={false} render={<a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareLink)}`} target="_blank" rel="noopener noreferrer" />} className="gap-1.5"><Share2 className="size-4" />Post</Button>
            </div>
          </div>

          <p className="text-center text-sm text-muted-foreground">Made with <span className="font-semibold text-foreground">KenyaTrace</span> — <Link href="/plan" className="underline underline-offset-2 transition-colors hover:text-primary">plan your own Kenya trip</Link>.</p>
        </>
      )}

      <Dialog open={!!active} onOpenChange={open => { if (!open) setLightbox(null) }}>
        <DialogContent className="sm:max-w-2xl">
          {active && (
            <>
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-muted">
                {mediaOf(active)[0].type === 'video' ? (
                  <video src={mediaOf(active)[0].url} controls autoPlay playsInline className="max-h-full w-full object-contain" />
                ) : (
                  <Image src={mediaOf(active)[0].url} fill className="object-contain" alt={active.caption} sizes="(max-width: 768px) 100vw, 672px" />
                )}
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{active.caption}</span>
                <span>{new Date(active.createdAt).toLocaleDateString()}{active.location ? ` · ${active.location}` : ''}</span>
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
