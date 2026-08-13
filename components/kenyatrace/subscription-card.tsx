'use client'

import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { CalendarClock, Check, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatKES } from '@/lib/kenya-data'
import { DayPackCheckout } from './paywall'

function formatDate(ts: number | null) {
  if (!ts) return '—'
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/** Profile tab: current access status, buy-more-days packs, purchase history. */
export function SubscriptionSection() {
  const status = useQuery(api.subscriptions.getStatus)
  const purchases = useQuery(api.subscriptions.listPurchases)

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" />
            <CardTitle className="font-serif text-2xl tracking-tight">Your access</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {status === undefined || status === null ? (
            <div className="h-20 animate-pulse rounded-lg bg-secondary" />
          ) : status.active ? (
            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-primary/5 p-4">
              <span className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground"><Check className="size-5" /></span>
              <div className="flex-1">
                <p className="font-semibold">
                  {status.daysRemaining} day{status.daysRemaining === 1 ? '' : 's'} left
                </p>
                <p className="text-sm text-muted-foreground">
                  {status.mode === 'trial' ? `Trial ends ${formatDate(status.trialEndsAt)}` : `Access until ${formatDate(status.paidUntil)}`}
                </p>
              </div>
              <Badge className="bg-primary text-primary-foreground">Active</Badge>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Your access has ended.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-2xl tracking-tight">Choose a plan</CardTitle>
        </CardHeader>
        <CardContent>
          <DayPackCheckout />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl tracking-tight">Purchase history</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {purchases === undefined ? (
            <div className="h-16 animate-pulse rounded-lg bg-secondary" />
          ) : purchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">No successful purchases yet.</p>
          ) : (
            purchases.map(p => (
              <div key={p._id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <div className="flex items-center gap-2">
                  <CalendarClock className="size-4 text-primary" />
                  <span className="font-medium">{p.days} days</span>
                  <span className="text-muted-foreground">· {p.reference}</span>
                  <span className="text-muted-foreground">· {formatDate(p.paidAt ?? p.createdAt)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <strong>{formatKES(p.amount)}</strong>
                  <Badge className="bg-emerald-600 text-white">Paid</Badge>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}
