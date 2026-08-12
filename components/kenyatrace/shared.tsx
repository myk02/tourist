'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useConvexAuth, useQuery } from 'convex/react'
import { SignInButton } from '@clerk/nextjs'
import { api } from '@/convex/_generated/api'
import type { Doc, Id } from '@/convex/_generated/dataModel'
import { CircleUserRound, Compass, MapPin } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatKES, wikimediaThumb } from '@/lib/kenya-data'
import { cn } from '@/lib/utils'

/**
 * next/image wrapper for listing photos. Normalizes Wikimedia URLs to a fast,
 * valid 960px thumbnail and falls back to a local asset if the image fails to
 * load — so a listing card never renders blank or broken.
 */
export function ListingImage({ src, alt, ...props }: React.ComponentProps<typeof Image>) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [src])
  const effectiveSrc = failed ? '/kenya-hero.png' : wikimediaThumb(src)
  return <Image src={effectiveSrc} alt={alt} {...props} onError={() => setFailed(true)} />
}

const SOURCE_META: Record<string, { label: string; dot: string }> = {
  firecrawl: { label: 'Firecrawl', dot: 'bg-emerald-400' },
  scraper: { label: 'Live web', dot: 'bg-sky-400' },
  wikipedia: { label: 'Wikipedia', dot: 'bg-amber-400' },
}

/** The source dimension used by the Discover filter (?source=). */
export type SourceFilterValue = 'all' | 'firecrawl' | 'live' | 'curated'

/** Maps a listing's `source` field to its Discover filter value (null when curated/unknown). */
export function sourceToFilter(source?: string | null): Exclude<SourceFilterValue, 'all' | 'curated'> | null {
  if (source === 'firecrawl') return 'firecrawl'
  if (source === 'scraper' || source === 'wikipedia') return 'live'
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
  const classes = cn('inline-flex items-center gap-1.5 rounded-full bg-black/45 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur-sm', className)
  if (onClick) {
    return (
      <button
        type="button"
        aria-label={`Filter to ${meta.label} listings`}
        onClick={onClick}
        className={cn(classes, 'cursor-pointer transition-opacity hover:opacity-85 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white')}
      >
        <span className={cn('size-1.5 rounded-full', meta.dot)} />
        {meta.label}
      </button>
    )
  }
  return (
    <span className={classes}>
      <span className={cn('size-1.5 rounded-full', meta.dot)} />
      {meta.label}
    </span>
  )
}

export function RequireAuth({children}:{children:React.ReactNode}){const {isAuthenticated,isLoading}=useConvexAuth();if(isLoading)return <div className="mx-auto max-w-6xl p-8"><div className="h-48 animate-pulse rounded-lg bg-secondary"/></div>;if(!isAuthenticated)return <div className="mx-auto flex max-w-lg flex-col items-center gap-5 px-5 py-24 text-center"><span className="flex size-16 items-center justify-center rounded-lg bg-secondary text-primary"><CircleUserRound className="size-8"/></span><h1 className="font-serif text-4xl tracking-tight">Your trip space is private</h1><p className="text-muted-foreground">Sign in to save routes, reservations, live traces and moments.</p><SignInButton mode="modal"><Button size="lg">Sign in to continue</Button></SignInButton></div>;return <>{children}</>}

/**
 * One reservation row, resolving the listing by id. Used on the Profile
 * bookings tab and the trip detail Bookings tab.
 */
export function BookingRow({ booking, onCancel }: { booking: Doc<'bookings'>; onCancel: (id: Id<'bookings'>) => void }) {
  const listing = useQuery(api.listings.get, { id: booking.listingId as Id<'listings'> })
  const item = listing
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-0">
          <p className="font-semibold">{item?.name || 'Reserved place'}</p>
          <p className="text-sm text-muted-foreground">{booking.reference} · {item ? `${item.location} · ` : ''}{booking.checkIn ? `${booking.checkIn} → ${booking.checkOut}` : ''}{booking.guests ? ` · ${booking.guests} guest${booking.guests === 1 ? '' : 's'}` : ''}</p>
        </div>
        <div className="flex items-center gap-4">
          <strong>{formatKES(booking.amount)}</strong>
          <Badge className={cn(booking.status === 'cancelled' && 'bg-card text-card-foreground')}>{booking.status}</Badge>
          {booking.status !== 'cancelled' && <Button variant="outline" size="sm" onClick={() => onCancel(booking._id)}>Cancel</Button>}
        </div>
      </CardContent>
    </Card>
  )
}

export function Stat({label,value}:{label:string;value:number}){return <Card><CardHeader><CardDescription>{label}</CardDescription><CardTitle className="text-3xl">{value}</CardTitle></CardHeader></Card>}

export function Empty({title,text,action}:{title:string;text:string;action?:()=>void}){return <div className="col-span-full flex min-h-52 flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center"><Compass className="size-8 text-primary"/><h2 className="mt-4 font-serif text-2xl">{title}</h2><p className="mt-2 max-w-md text-muted-foreground">{text}</p>{action&&<Button className="mt-4" variant="outline" onClick={action}>Clear filters</Button>}</div>}

export function NotFound(){return <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-5 py-24 text-center"><MapPin className="size-10 text-primary"/><h1 className="font-serif text-4xl">This trail ends here</h1><p className="text-muted-foreground">The page or place you requested could not be found.</p><Button nativeButton={false} render={<Link href="/"/>}>Back to discover</Button></div>}

export function useTripId(){const pathname=usePathname();const id=pathname.split('/')[2];return id as Id<'trips'>}
