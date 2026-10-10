'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useAction, useConvexAuth, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import { CircleUserRound, Loader2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/kt/progress-bar'
import { Card, CardContent } from '@/components/ui/card'
import { formatKES, wikimediaThumb } from '@/lib/kenya-data'
import { kindHex } from '@/lib/kind'
import { isValidConvexId } from '@/lib/id'
import { cn } from '@/lib/utils'
import { PayNowButton } from './pay-now'

/**
 * next/image wrapper for listing photos. Normalizes Wikimedia URLs to a fast,
 * valid 960px thumbnail and falls back to a local asset if the image fails to
 * load — so a listing card never renders blank or broken.
 */
export function ListingImage({ src, alt, ...props }: Omit<React.ComponentProps<typeof Image>, 'src' | 'alt'> & { src: string; alt: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  const effectiveSrc = failed ? '/kenya-hero.png' : wikimediaThumb(src)
  return <Image src={effectiveSrc} alt={alt} {...props} onError={() => setFailed(true)} />
}

const SOURCE_META: Record<string, { label: string; dot: string }> = {
  firecrawl: { label: 'Firecrawl', dot: 'bg-emerald-400' },
  scraper: { label: 'Live web', dot: 'bg-sky-400' },
  'scraper:estimated': { label: 'Estimated', dot: 'bg-sky-400' },
  wikipedia: { label: 'Wikipedia', dot: 'bg-amber-400' },
}

/** True for http-scraped or Wikipedia-sourced listings (incl. scraper:estimated). */
export function isLiveSource(source?: string | null): boolean {
  if (!source) return false
  return source === 'wikipedia' || source === 'scraper' || source.startsWith('scraper:')
}

/** The source dimension used by the Discover filter (?source=). */
export type SourceFilterValue = 'all' | 'firecrawl' | 'live' | 'curated'

/** Maps a listing's `source` field to its Discover filter value (null when curated/unknown). */
export function sourceToFilter(source?: string | null): Exclude<SourceFilterValue, 'all' | 'curated'> | null {
  if (source === 'firecrawl') return 'firecrawl'
  if (isLiveSource(source)) return 'live'
  return null
}

/**
 * Provenance chip for listing cards — tells Firecrawl-scraped data apart
 * from http/web-scraped or curated (seed) rows at a glance. Pass `onClick`
 * to render it as a button (e.g. to filter Discover by that source).
 */
export function SourceBadge({ source, className, onClick }: { source?: string | null; className?: string; onClick?: () => void }) {
  const meta = source ? SOURCE_META[source] : undefined
  if (!meta) return null
  const classes = cn('inline-flex items-center gap-1.5 rounded-none bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white', className)
  if (onClick) {
    return (
      <button
        type="button"
        aria-label={`Filter to ${meta.label} listings`}
        onClick={onClick}
        className={cn(classes, 'cursor-pointer transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white')}
      >
        <span className={cn('size-1.5 rounded-none', meta.dot)} />
        {meta.label}
      </button>
    )
  }
  return (
    <span className={classes}>
      <span className={cn('size-1.5 rounded-none', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  if (isLoading) return <div className="mx-auto max-w-6xl p-8"><div className="kt-shimmer h-48 rounded-none" /></div>
  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-5 px-5 py-24 text-center">
        <span className="flex size-16 items-center justify-center rounded-none bg-primary/10 text-primary ring-1 ring-primary/20"><CircleUserRound className="size-8" /></span>
        <h1 className="font-serif text-4xl tracking-tight">Your trip space is private</h1>
        <p className="text-muted-foreground">Sign in to save routes, reservations, live traces and moments.</p>
        <Button size="lg" nativeButton={false} render={<Link href="/sign-in" />}>Sign in to continue</Button>
      </div>
    )
  }
  return <>{children}</>
}

/**
 * One reservation row, resolving the listing by id. Used on the Profile
 * bookings tab and the trip detail Bookings tab.
 */
export function BookingRow({ booking, onCancel }: { booking: Doc<'bookings'>; onCancel: (id: Id<'bookings'>) => void }) {
  // Email-forwarded bookings have no marketplace listing (empty listingId) —
  // skip the lookup so Convex doesn't reject the empty id.
  const listing = useQuery(api.listings.get, booking.listingId ? { id: booking.listingId as Id<'listings'> } : 'skip')
  const item = listing
  // A pending attempt from a closed-tab checkout: offer re-confirmation
  // against the SAME reference instead of a new checkout (no double charge).
  const pending = useQuery(api.payments.pendingForBooking, (booking.status === 'requested' || booking.status === 'pending') && booking.amount > 0 ? { bookingId: booking._id } : 'skip')
  const verifyAndConfirm = useAction(api.payments.verifyAndConfirm)
  const [confirming, setConfirming] = useState(false)
  async function checkStatus() {
    if (!pending || confirming) return
    setConfirming(true)
    try {
      const result = await verifyAndConfirm({ paymentId: pending.paymentId })
      if (result.verified) toast.success(`Payment received — ${booking.reference} is confirmed`)
      else toast.error('Not confirmed yet — if you paid, wait a minute and try again')
    } catch {
      toast.error('Could not check the payment — try again shortly')
    } finally {
      setConfirming(false)
    }
  }
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="font-semibold">{item?.name || 'Reserved place'}</p>
          <p className="text-sm text-muted-foreground">{booking.reference} · {item ? `${item.location} · ` : ''}{booking.checkIn ? `${booking.checkIn} → ${booking.checkOut}` : ''}{booking.guests ? ` · ${booking.guests} guest${booking.guests === 1 ? '' : 's'}` : ''}</p>
          {pending && <p className="mt-1 text-xs text-muted-foreground">A payment attempt is pending — paid already? Check its status instead of paying again.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <strong>{formatKES(booking.amount)}</strong>
          <Badge className={cn(
            booking.status === 'cancelled' && 'bg-card text-card-foreground',
            booking.status === 'paid' && 'bg-emerald-600 text-white',
            (booking.status === 'requested' || booking.status === 'pending') && 'bg-secondary text-secondary-foreground',
          )}>
            {booking.status === 'paid' ? 'Paid' : booking.status}
          </Badge>
          {pending && (
            <Button variant="outline" size="sm" onClick={checkStatus} disabled={confirming} className="gap-1.5">
              {confirming && <Loader2 className="size-3.5 animate-spin" />}
              {confirming ? 'Checking' : 'Check status'}
            </Button>
          )}
          {(booking.status === 'requested' || booking.status === 'pending') && booking.amount > 0 && <PayNowButton booking={booking} />}
          {booking.status !== 'cancelled' && booking.status !== 'paid' && <Button variant="outline" size="sm" onClick={() => onCancel(booking._id)}>Cancel</Button>}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Compact trip-cost card: total vs budget progress bar, plus a stacked
 * breakdown by spend category. Reused on the plan journey and trip detail.
 * Category hues come from lib/kind.ts (single source).
 */
export function BudgetBar({ stops, budget, perDay, className }: { stops: { cost: number; kind: string }[]; budget: number; perDay?: number; className?: string }) {
  const total = stops.reduce((s, x) => s + x.cost, 0)
  const pct = Math.min(100, Math.round((total / Math.max(budget, 1)) * 100))
  const over = total > budget
  const kinds = (['Stay', 'Transport', 'Experience', 'Food'] as const)
    .map(kind => ({ kind, total: stops.filter(s => s.kind === kind).reduce((a, s) => a + s.cost, 0) }))
    .filter(k => k.total > 0)
  return (
    <div className={cn('rounded-none border bg-card p-4 shadow-soft', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-medium">Trip cost</span>
        <span className="font-semibold">
          {formatKES(total)}
          <span className="text-muted-foreground"> of {formatKES(budget)}</span>
          {over && <span className="ml-2 text-xs font-semibold text-destructive">over budget</span>}
        </span>
      </div>
      <ProgressBar value={pct} label="Trip cost against budget" barClassName={over ? 'bg-destructive' : undefined} className="mt-2" />
      <p className="mt-1 text-xs text-muted-foreground">{pct}% of your budget used{perDay != null ? ` · ≈ ${formatKES(perDay)} per day` : ''}</p>
      {kinds.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <div className="flex h-2 w-full overflow-hidden rounded-none bg-muted">
            {kinds.map(k => <div key={k.kind} style={{ width: `${(k.total / Math.max(total, 1)) * 100}%`, backgroundColor: kindHex(k.kind) }} />)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {kinds.map(k => (
              <span key={k.kind} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="size-2.5 rounded-none" style={{ backgroundColor: kindHex(k.kind) }} />
                {k.kind} · {formatKES(k.total)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function NotFound(){return <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-5 py-24 text-center"><MapPin className="size-10 text-primary"/><h1 className="font-serif text-4xl">This trail ends here</h1><p className="text-muted-foreground">The page or place you requested could not be found.</p><Button nativeButton={false} render={<Link href="/"/>}>Back home</Button></div>}

export function useTripId() {
  const params = useParams<{ id?: string | string[] }>()
  const raw = params?.id
  const id = Array.isArray(raw) ? raw[0] : raw
  // Validate the route param before querying — a malformed id would make
  // Convex throw and crash the page instead of showing NotFound.
  return isValidConvexId(id) ? id as Id<'trips'> : null
}
