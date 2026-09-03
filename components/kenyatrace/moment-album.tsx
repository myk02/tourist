'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { ChevronLeft, ChevronRight, Globe, LayoutGrid, Lock, Share2, Star, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

type Moment = NonNullable<ReturnType<typeof useQuery<typeof api.moments.list>>>[number]
type Media = { type: 'video' | 'image'; url: string }

/** Collaborator-only quick reactions — counts never reach public pages. */
const REACTIONS = ['👍', '❤️', '🔥', '🎉'] as const

function mediaOf(m: Moment): Media[] {
  const images = m.imageUrls?.length ? m.imageUrls : m.imageUrl ? [m.imageUrl] : []
  const videos = m.videoUrls ?? []
  const media: Media[] = [
    ...videos.map(url => ({ type: 'video' as const, url })),
    ...images.map(url => ({ type: 'image' as const, url })),
  ]
  return media.length ? media : [{ type: 'image', url: '/placeholder.jpg' }]
}

export function MomentAlbum({ tripId, onUploadClick }: { tripId: Id<'trips'>; onUploadClick?: () => void }) {
  const { user } = useUser()
  const moments = useQuery(api.moments.list, { tripId })
  const setBest = useMutation(api.moments.setBest)
  const setPublic = useMutation(api.moments.setPublic)
  const removeMoment = useMutation(api.moments.remove)
  const react = useMutation(api.moments.react)
  const [lightbox, setLightbox] = useState<{ moment: number; media: number } | null>(null)
  // Deleting removes the stored files for good — confirm before it happens.
  const [pendingDelete, setPendingDelete] = useState<Moment | null>(null)

  async function toggleReaction(m: Moment, emoji: string) {
    try {
      await react({ id: m._id, emoji })
    } catch {
      toast.error('Only collaborators can react')
    }
  }

  /** Counts per emoji + which one (if any) is mine. */
  function reactionState(m: Moment) {
    const counts = new Map<string, number>()
    let mine: string | null = null
    for (const r of m.reactions ?? []) {
      counts.set(r.emoji, (counts.get(r.emoji) ?? 0) + 1)
      if (user?.id && r.userId === user.id) mine = r.emoji
    }
    return { counts, mine }
  }

  async function toggleBest(m: Moment) {
    try {
      await setBest({ id: m._id, best: !m.best })
      toast.success(m.best ? 'Removed best moment' : 'Marked as best moment')
    } catch {
      toast.error('Could not update best moment')
    }
  }

  async function togglePublic(m: Moment) {
    try {
      await setPublic({ id: m._id, public: !m.public })
      toast.success(m.public ? 'Moment set to private' : 'Moment made public')
    } catch {
      toast.error('Could not update visibility')
    }
  }

  async function handleRemove(m: Moment) {
    try {
      await removeMoment({ id: m._id })
      toast.success('Moment deleted')
      setLightbox(null)
    } catch {
      toast.error('Could not delete this moment')
    }
  }

  if (moments === undefined) return <div className="grid grid-cols-2 gap-4 md:grid-cols-3"><div className="kt-shimmer aspect-square rounded-xl" /><div className="kt-shimmer aspect-square rounded-xl" /><div className="kt-shimmer aspect-square rounded-xl" /></div>

  const active = lightbox ? moments[lightbox.moment] : null
  const activeMedia = active ? mediaOf(active) : []
  const activeIndex = active ? Math.min(lightbox!.media, activeMedia.length - 1) : 0

  async function share() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/moments/${tripId}`)
      toast.success('Share link copied')
    } catch {
      toast.error('Could not copy share link')
    }
  }

  // The 9-grid recap shows only moments marked public — worth saying so the
  // link isn't shared and then found empty.
  async function recap() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/recap/${tripId}`)
      const publicCount = (moments ?? []).filter(m => m.public).length
      toast.success(publicCount === 0 ? 'Recap link copied — make some moments public to fill it' : publicCount < 9 ? 'Recap link copied — up to 9 public moments will appear' : 'Recap link copied')
    } catch {
      toast.error('Could not copy recap link')
    }
  }

  return (
    <div>
      {moments.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border border-dashed p-8 text-center">
          <p className="font-serif text-2xl">No moments yet</p>
          {onUploadClick && <Button className="mt-4" variant="outline" onClick={onUploadClick}>Add your first memory</Button>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{moments.length} moment{moments.length === 1 ? '' : 's'}</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={recap}><LayoutGrid data-icon="inline-start" />Recap</Button>
              <Button variant="outline" size="sm" onClick={share}><Share2 data-icon="inline-start" />Share moments</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {moments.map((m, mi) => {
              const media = mediaOf(m)
              const { counts } = reactionState(m)
              const reactionTotal = [...counts.values()].reduce((a, b) => a + b, 0)
              return (
                <div key={m._id} className="group relative aspect-square overflow-hidden rounded-xl">
                  <button className="block size-full" onClick={() => setLightbox({ moment: mi, media: 0 })} aria-label={`Open moment: ${m.caption}`}>
                    {media[0].type === 'video' ? (
                      <video src={media[0].url} muted playsInline preload="metadata" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    ) : (
                      <Image
                          src={media[0].url}
                          alt={m.caption}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                          unoptimized
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                    )}
                  </button>
                  {media.length > 1 && <Badge className="absolute left-2 top-2 bg-card/90 text-card-foreground">+{media.length} media</Badge>}
                  {m.best && <Badge className="absolute right-2 top-2 bg-accent text-accent-foreground"><Star className="size-3 fill-current" />Best</Badge>}
                  {/* Controls stay visible on touch (no hover there); desktop
                      reveals them on hover to keep tiles clean. */}
                  <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 bg-gradient-to-t from-black/60 to-transparent p-2 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    {reactionTotal > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {[...counts.entries()].map(([emoji, n]) => (
                          <span key={emoji} className="rounded-full bg-card/90 px-1.5 py-0.5 text-[11px] font-semibold text-card-foreground">{emoji} {n}</span>
                        ))}
                      </div>
                    )}
                    <div className="flex items-end justify-between gap-2">
                      <p className="line-clamp-2 text-sm text-white">{m.caption}</p>
                      <div className="flex shrink-0 gap-1">
                        <button aria-label="Toggle best moment" onClick={() => toggleBest(m)} className={cn('flex size-8 items-center justify-center rounded-full bg-card/90 text-card-foreground transition-colors', m.best && 'text-accent')}><Star className={cn('size-4', m.best && 'fill-current')} /></button>
                        <button aria-label="Toggle visibility" onClick={() => togglePublic(m)} className="flex size-8 items-center justify-center rounded-full bg-card/90 text-card-foreground">{m.public ? <Globe className="size-4" /> : <Lock className="size-4" />}</button>
                        <button aria-label="Delete moment" onClick={() => setPendingDelete(m)} className="flex size-8 items-center justify-center rounded-full bg-card/90 text-card-foreground hover:text-destructive"><Trash2 className="size-4" /></button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <Dialog open={!!active} onOpenChange={open => { if (!open) setLightbox(null) }}>
        <DialogContent className="sm:max-w-3xl">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {active.caption}
                  {active.best && <Badge className="bg-accent text-accent-foreground"><Star className="size-3 fill-current" />Best</Badge>}
                </DialogTitle>
              </DialogHeader>
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded-2xl bg-muted">
                {activeMedia[activeIndex].type === 'video' ? (
                  <video src={activeMedia[activeIndex].url} controls autoPlay playsInline className="max-h-full w-full object-contain" />
                ) : (
                  <Image
                        src={activeMedia[activeIndex].url}
                        alt={active.caption}
                        width={1600}
                        height={1200}
                        unoptimized
                        className="max-h-full w-full object-contain"
                      />
                )}
                {activeMedia.length > 1 && (
                  <>
                    <button aria-label="Previous media" onClick={() => setLightbox({ moment: lightbox!.moment, media: activeIndex === 0 ? activeMedia.length - 1 : activeIndex - 1 })} className="absolute left-3 flex size-9 items-center justify-center rounded-full bg-card/90 text-card-foreground shadow-sm"><ChevronLeft className="size-5" /></button>
                    <button aria-label="Next media" onClick={() => setLightbox({ moment: lightbox!.moment, media: (activeIndex + 1) % activeMedia.length })} className="absolute right-3 flex size-9 items-center justify-center rounded-full bg-card/90 text-card-foreground shadow-sm"><ChevronRight className="size-5" /></button>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>{new Date(active.createdAt).toLocaleDateString()} · {active.location || active.stopName || 'Somewhere in Kenya'}{active.public ? ' · Public' : ' · Private'}</span>
                <span>{activeMedia.length > 1 ? `${activeIndex + 1} / ${activeMedia.length}` : ''}</span>
              </div>
              {/* Collaborator quick reactions — one per person, tap again to clear. */}
              <div className="flex flex-wrap gap-1.5 border-t pt-3">
                {(() => {
                  const { counts, mine } = reactionState(active)
                  return REACTIONS.map(emoji => {
                    const n = counts.get(emoji) ?? 0
                    return (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => void toggleReaction(active, emoji)}
                        aria-pressed={mine === emoji}
                        className={cn(
                          'flex h-8 items-center gap-1 rounded-full border px-2.5 text-sm transition-colors',
                          mine === emoji ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/40',
                        )}
                      >
                        {emoji}{n > 0 && <span className="text-xs font-semibold">{n}</span>}
                      </button>
                    )
                  })
                })()}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => toggleBest(active)}>{active.best ? 'Remove best' : 'Mark best'}</Button>
                <Button variant="outline" size="sm" onClick={() => togglePublic(active)}>{active.public ? 'Make private' : 'Make public'}</Button>
                <Button variant="destructive" size="sm" onClick={() => setPendingDelete(active)}>Delete</Button>
                <DialogClose render={<Button variant="ghost" size="sm" />}><X className="size-4" /> Close</DialogClose>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete this moment?</DialogTitle>
            <DialogDescription>
              “{pendingDelete?.caption?.slice(0, 80)}” and its media are removed for good. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => { if (pendingDelete) void handleRemove(pendingDelete); setPendingDelete(null) }}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
