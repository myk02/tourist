'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Check, ChevronRight, GripVertical, Route, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/kt/progress-bar'
import { cn } from '@/lib/utils'
import { useTracking } from './tracking-provider'

const POS_KEY = 'ktTrackerPos'
const MARGIN = 8

/**
 * The pinned "tracking in progress" model: a compact card that stays visible
 * on every page while a trip is being tracked. It is freely draggable — grab
 * the header and move it anywhere on screen (the spot is remembered), or
 * double-click the header to snap it back to its default corner.
 */
export function TrackerWidget() {
  const { session, stop } = useTracking()
  const router = useRouter()
  const pathname = usePathname()
  const enableTraceShare = useMutation(api.trips.enableTraceShare)
  // On arrival the X just hides the widget (the moment is preserved); while
  // tracking it ends the session.
  const [dismissed, setDismissed] = useState(false)
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ pointerId: number; offsetX: number; offsetY: number } | null>(null)
  const clearDragRef = useRef<(() => void) | null>(null)
  const lastAnnouncedRef = useRef('')
  const lastTapRef = useRef(0)

  // If the widget unmounts mid-drag (session ends, page navigates), drop the
  // window listeners so they never leak.
  useEffect(() => () => { clearDragRef.current?.() }, [])

  // A dismissal only applies to the current session — the next session (or a
  // state change like arriving) must bring the widget back.
  useEffect(() => {
    setDismissed(false)
  }, [session?.tripId, session?.status])

  // Hydration-safe restore of a previously dragged position (clamped to the
  // viewport so a smaller window can never strand the widget off-screen).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(POS_KEY)
      if (!raw) return
      const p = JSON.parse(raw) as { x?: number; y?: number }
      if (typeof p.x !== 'number' || typeof p.y !== 'number') return
      setPos({
        x: Math.min(Math.max(MARGIN, p.x), window.innerWidth - 320),
        y: Math.min(Math.max(MARGIN, p.y), window.innerHeight - 140),
      })
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    try {
      if (pos) localStorage.setItem(POS_KEY, JSON.stringify(pos))
      else localStorage.removeItem(POS_KEY)
    } catch { /* ignore */ }
  }, [pos])

  // Announce to screen readers only on meaningful changes (status or whole km),
  // not on every ~1s fix. Computed before the early return — hooks can't be
  // conditional.
  const announcement = session
    ? session.status === 'arrived'
      ? `You have arrived at ${session.destinationName}`
      : `${Math.max(1, Math.round(session.distanceKm ?? 0))} km to ${session.destinationName}`
    : ''
  useEffect(() => {
    if (lastAnnouncedRef.current !== announcement) lastAnnouncedRef.current = announcement
  }, [announcement])

  if (!session || dismissed) return null
  const arrived = session.status === 'arrived'
  const trackPath = `/trips/${session.tripId}/track`
  // The full tracking page already shows everything — don't double-render.
  if (pathname === trackPath) return null

  const dist = session.distanceKm != null ? `${session.distanceKm.toFixed(1)} km` : '…'

  function onDragStart(e: React.PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const card = cardRef.current
    if (!card) return
    e.preventDefault()
    const rect = card.getBoundingClientRect()
    dragRef.current = { pointerId: e.pointerId, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top }
    const onMove = (ev: PointerEvent) => {
      const d = dragRef.current
      if (!d || ev.pointerId !== d.pointerId) return
      const w = card.offsetWidth
      const h = card.offsetHeight
      setPos({
        x: Math.min(Math.max(MARGIN, ev.clientX - d.offsetX), window.innerWidth - w - MARGIN),
        y: Math.min(Math.max(MARGIN, ev.clientY - d.offsetY), window.innerHeight - h - MARGIN),
      })
    }
    const onUp = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      clearDragRef.current = null
    }
    clearDragRef.current?.()
    clearDragRef.current = onUp
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  // Double-click the header to snap back to the default corner.
  function onHandleClick() {
    const now = Date.now()
    if (now - lastTapRef.current < 350) setPos(null)
    lastTapRef.current = now
  }

  return (
    <aside
      aria-label="Live trip tracking"
      className={cn('fixed z-50', pos ? '' : 'inset-x-4 bottom-24 md:inset-x-auto md:bottom-6 md:right-6 md:w-80')}
      style={pos ? { left: pos.x, top: pos.y, width: '20rem', maxWidth: 'calc(100vw - 2rem)' } : undefined}
    >
      {/* Screen readers hear distance/arrival updates without the visual noise. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {lastAnnouncedRef.current}
      </div>
      <div ref={cardRef} className="rounded-none border border-border bg-card p-3 shadow-pop">
        <div
          title="Drag to move · double-click to reset"
          className="flex cursor-grab touch-none select-none items-center gap-2 active:cursor-grabbing"
          onPointerDown={onDragStart}
          onClick={onHandleClick}
        >
          <GripVertical className="size-4 shrink-0 text-muted-foreground" />
          <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-none text-white', arrived ? 'bg-emerald-600' : 'bg-primary')}>
            {arrived ? <Check className="size-5" /> : <span className="size-2.5 animate-pulse bg-white" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">
              {arrived ? `You've arrived at ${session.destinationName}` : `Heading to ${session.destinationName}`}
            </p>
            <p className="text-xs text-muted-foreground">
              {arrived ? 'Live tracking complete' : `${dist} to go · ${session.progressPct}% of the way`}
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label={arrived ? 'Dismiss' : 'Stop tracking'}
            onClick={arrived ? () => setDismissed(true) : stop}
            onPointerDown={e => e.stopPropagation()}
            className="shrink-0"
          >
            <X className="size-4" />
          </Button>
        </div>
        <ProgressBar value={session.progressPct} label="Trip progress" barClassName={arrived ? 'bg-emerald-600' : undefined} className="mt-2" />
        {arrived ? (
          <div className="mt-3 flex gap-2">
            <Button size="sm" className="flex-1 gap-1" onClick={() => router.push(trackPath)}>
              Continue <ChevronRight className="size-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 gap-1"
              onClick={() => {
                void (async () => {
                  if (!session) return
                  try {
                    const { token } = await enableTraceShare({ tripId: session.tripId as Id<'trips'> })
                    await navigator.clipboard.writeText(`${window.location.origin}/trace/${session.tripId}?t=${token}`)
                    toast.success('Trace link copied — anyone with it can see your route')
                  } catch {
                    toast.error('Could not share this trace')
                  }
                })()
              }}
            >
              <Route className="size-4" />Share trace
            </Button>
          </div>
        ) : (
          <Button size="sm" className="mt-3 w-full gap-1" onClick={() => router.push(trackPath)}>
            Open tracking <ChevronRight className="size-4" />
          </Button>
        )}
      </div>
    </aside>
  )
}
