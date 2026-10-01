'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { CalendarClock, Camera, Check, CircleUserRound, Compass, Heart, Loader2, Sparkles, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/ui/kt/brand-mark'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatKES } from '@/lib/kenya-data'
import { toMinorKES } from '@/lib/money'
import { readCache, writeCache } from '@/lib/offline-cache'
import { loadPaystackScript } from '@/lib/paystack-inline'
import { PLAN_PRICES } from '@/lib/plans'
import { cn } from '@/lib/utils'

type Status = NonNullable<ReturnType<typeof useQuery<typeof api.subscriptions.getStatus>>>

// Prices come from lib/plans.ts (single source of truth shared with the
// Convex backend), so what the UI shows is always what gets charged.
// Per-day and savings lines are DERIVED, never hardcoded — a price change in
// plans.ts flows through automatically instead of silently drifting.
function perDay(price: number, days: number): string {
  return `≈ KES ${Math.round(price / days)}/day`
}
// Monthly vs the pro-rata weekly rate for the same 30 days.
const MONTHLY_SAVINGS = Math.max(0, Math.round((30 * (PLAN_PRICES[7] / 7)) - PLAN_PRICES[30]))

export const PLANS = [
  {
    days: 7,
    name: 'Weekly pack',
    price: PLAN_PRICES[7],
    suffix: '7 days',
    perDay: perDay(PLAN_PRICES[7], 7),
    duration: '7 days of full access',
    benefits: ['Plan unlimited Kenya trips', 'Live tracking & share traces', 'Save spots & moments'],
    popular: false,
  },
  {
    days: 30,
    name: 'Monthly pack',
    price: PLAN_PRICES[30],
    suffix: 'month',
    perDay: perDay(PLAN_PRICES[30], 30),
    savings: MONTHLY_SAVINGS > 0 ? `Save KES ${MONTHLY_SAVINGS}` : undefined,
    duration: '30 days of full access',
    benefits: ['Everything in Weekly', 'More than 4× the days', 'Best per-day value', 'No auto-renewal'],
    popular: true,
  },
] as const

/**
 * Shared, self-contained pricing card. `footer` lets callers swap the CTA —
 * signed-in users get the Paystack "buy" button, signed-out users get a
 * sign-up prompt instead. The card visuals stay identical in both places.
 */
export function PlanCard({
  plan,
  footer,
}: {
  plan: (typeof PLANS)[number]
  footer: React.ReactNode
}) {
  const isHero = plan.popular
  return (
    <div
      className={cn(
        'relative flex h-full flex-col items-center rounded-none border p-5 text-center transition-colors duration-200',
        isHero
          ? 'border-primary bg-primary/[0.06] shadow-lg shadow-primary/10 ring-1 ring-primary/40'
          : 'border-border bg-card hover:border-primary/30 hover:shadow-md',
      )}
    >
      {isHero && (
        <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-none bg-primary px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground shadow-sm">
          Best value
        </span>
      )}

      <span
        className={cn(
          'flex size-10 items-center justify-center rounded-none',
          isHero ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
        )}
      >
        {isHero ? <Sparkles className="size-5" /> : <CalendarClock className="size-5" />}
      </span>

      <p className="mt-2.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{plan.name}</p>

      <div className="mt-1.5 flex items-end gap-1.5">
        <span className="font-serif text-3xl font-semibold tracking-tight">{formatKES(plan.price)}</span>
        <span className="pb-1 text-sm font-medium text-muted-foreground">/ {plan.suffix}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-center gap-1.5">
        <p className="text-xs font-semibold text-primary">Pay with M-Pesa · {plan.perDay}</p>
        {'savings' in plan && plan.savings && (
          <span className="rounded-none bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{plan.savings}</span>
        )}
      </div>

      <ul className="mt-4 flex w-full grow flex-col gap-2 border-t border-border pt-4 text-left">
        {plan.benefits.map(benefit => (
          <li key={benefit} className="flex items-start gap-2 text-sm text-foreground/90">
            <span
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-none',
                isHero ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary',
              )}
            >
              <Check className="size-3" />
            </span>
            {benefit}
          </li>
        ))}
      </ul>

      <div className="mt-5 w-full">{footer}</div>
    </div>
  )
}

/**
 * Buy-days flow shared by the paywall and the profile page. Renders the pack
 * buttons and runs the Paystack checkout (public key + reference in the
 * popup, server-side verify — the secret key never leaves Convex).
 */
export function DayPackCheckout({ onPurchased }: { onPurchased?: (days: number) => void }) {
  const { user } = useUser()
  const initialize = useMutation(api.subscriptions.initializeDayPack)
  const verifyAndConfirm = useAction(api.subscriptions.verifyAndConfirmDayPack)
  const [busy, setBusy] = useState<number | null>(null)
  const busyRef = useRef(false)

  async function buy(days: number) {
    if (busyRef.current) return
    const email = user?.primaryEmailAddress?.emailAddress
    if (!email) {
      toast.error('Add an email to your account to pay')
      return
    }
    if (!process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY) {
      toast.error('Payment provider is not configured')
      return
    }
    busyRef.current = true
    setBusy(days)
    try {
      const { purchaseId, reference, amount } = await initialize({ days, email })
      await loadPaystackScript()
      if (!window.PaystackPop) throw new Error('Payment provider unavailable')

      // Paystack's inline script validates that `callback` is a plain
      // function (Object.prototype.toString must be "[object Function]"), so
      // it can't be an async arrow — the async confirmation runs inside a
      // synchronous wrapper instead.
      const confirm = async () => {
        try {
          const result = await verifyAndConfirm({ purchaseId })
          if (result.verified) {
            toast.success(`${result.days} days added — welcome aboard!`)
            onPurchased?.(result.days)
          } else {
            // Support loop: flag the reference for a human instead of leaving
            // the traveller with only an error toast.
            void fetch('/api/payment-recovery', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ reference, email }),
            }).catch(() => {})
            toast.error('Payment could not be confirmed — we\'ve flagged your reference for support. If you were charged, you won\'t lose out.')
          }
        } catch {
          // A thrown verify may mean the charge landed but confirmation died
          // (network/server) — flag it for support either way.
          void fetch('/api/payment-recovery', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ reference, email }),
          }).catch(() => {})
          toast.error('Could not confirm the payment — we\'ve flagged your reference for support')
        } finally {
          busyRef.current = false
          setBusy(null)
        }
      }
      const handler = window.PaystackPop.setup({
        key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
        email,
        amount: toMinorKES(amount), // KES → minor units
        currency: 'KES',
        ref: reference,
        callback: () => { void confirm() },
        onClose: () => {
          busyRef.current = false
          setBusy(null)
        },
      })
      handler.openIframe()
      // M-Pesa STK guidance: the prompt lands on the payer's phone, not in
      // this tab — tell them where to look or first-time payers stall here.
      toast.info('Check your phone — enter your M-Pesa PIN to complete payment')
    } catch (error) {
      busyRef.current = false
      setBusy(null)
      toast.error(error instanceof Error ? error.message : 'Could not start payment')
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {PLANS.map(plan => (
          <PlanCard
            key={plan.days}
            plan={plan}
            footer={
              <Button
                className="w-full gap-2"
                variant={plan.popular ? 'default' : 'outline'}
                disabled={busy !== null}
                onClick={() => buy(plan.days)}
              >
                {busy === plan.days ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}
                {busy === plan.days ? 'Starting…' : `Get ${plan.days} days`}
              </Button>
            }
          />
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">Pay with M-Pesa or card · One-time · No auto-renewal</p>
    </div>
  )
}

/** The full-screen paywall shown when access has run out. */
function PaywallScreen({ status, compact = false }: { status: Status; compact?: boolean }) {
  // Value-first: show the traveller exactly what they'd get back — their own
  // trips, saved spots and moments — so the wall is about restoring real
  // value, not just paying for access.
  const context = useQuery(api.subscriptions.paywallContext)
  const hasValue = (context?.tripCount ?? 0) > 0 || (context?.savedCount ?? 0) > 0 || (context?.momentCount ?? 0) > 0
  return (
    <div className={cn('mx-auto flex w-full flex-col', compact ? 'gap-4 max-w-3xl' : 'max-w-3xl gap-6 px-5 py-16')}>
      <div className="flex flex-col items-center gap-2.5 text-center">
        <BrandMark icon="sparkles" size={compact ? 'sm' : 'lg'} className="shadow-pop" />
        <h1 className={cn('font-serif font-semibold tracking-tight text-balance', compact ? 'text-xl' : 'text-4xl')}>Pick a plan</h1>
        <p className="max-w-md text-muted-foreground">
          {status.mode === 'none' ? 'Your 30-day free trial has ended.' : 'Your access has ended.'} Pay with M-Pesa — one-time packs, no auto-renewal.
        </p>
      </div>

      {hasValue && (
        <div className="w-full rounded-none border bg-card p-4 text-left shadow-soft">
          <p className="text-sm font-semibold">What&apos;s waiting for you</p>
          {context!.upcomingTrip && (
            <p className="mt-1 text-sm text-muted-foreground">
              Next up: <span className="font-medium text-foreground">{context!.upcomingTrip.name}</span>
              {context!.upcomingTrip.destination ? ` · ${context!.upcomingTrip.destination}` : ''}
              {context!.upcomingTrip.startDate ? ` · starts ${context!.upcomingTrip.startDate}` : ''}
            </p>
          )}
          <div className="mt-2.5 flex flex-wrap gap-2">
            {context!.tripCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-none bg-secondary px-2.5 py-1 text-xs font-medium"><Compass className="size-3.5 text-primary" />{context!.tripCount} trip{context!.tripCount === 1 ? '' : 's'}</span>
            )}
            {context!.savedCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-none bg-secondary px-2.5 py-1 text-xs font-medium"><Heart className="size-3.5 text-primary" />{context!.savedCount} saved spot{context!.savedCount === 1 ? '' : 's'}</span>
            )}
            {context!.momentCount > 0 && (
              <span className="flex items-center gap-1.5 rounded-none bg-secondary px-2.5 py-1 text-xs font-medium"><Camera className="size-3.5 text-primary" />{context!.momentCount} moment{context!.momentCount === 1 ? '' : 's'}</span>
            )}
          </div>
        </div>
      )}

      <DayPackCheckout />
    </div>
  )
}

/**
 * Modal version of the paywall — used for actions like reserving a place
 * when the signed-in user's access has run out. Auto-opens when access is
 * inactive.
 */
export function PaywallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const status = useQuery(api.subscriptions.getStatus)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[86svh] overflow-y-auto p-5 sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Pick a plan</DialogTitle>
          <DialogDescription>Choose a day pack to continue planning</DialogDescription>
        </DialogHeader>
        {status === undefined ? (
          <div className="kt-shimmer h-48 rounded-none" />
        ) : status === null ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <p className="text-sm text-muted-foreground">Sign in to pick a day pack and continue planning.</p>
            <Button nativeButton={false} render={<Link href="/sign-in" />}>Sign in to continue</Button>
          </div>
        ) : (
          <PaywallScreen status={status} compact />
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Gates a page (or section) behind an active subscription. Signed-out users
 * see the sign-in prompt; signed-in users without active access see the
 * paywall; everyone else sees the content.
 */
export function RequireSubscription({ children, enabled = true }: { children: React.ReactNode; enabled?: boolean }) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const status = useQuery(api.subscriptions.getStatus)
  const ensureTrial = useMutation(api.subscriptions.ensureTrial)
  // True only while the lazy trial-start mutation is actually in flight.
  const [trialPending, setTrialPending] = useState(false)
  // Offline tolerance: remember the last known-active access on this browser
  // so a dead zone (safari park, highway) doesn't trap the traveller behind
  // an endless skeleton. This is UX gating only — the server re-checks
  // access on every query and mutation, and the cached copy only ever shows
  // the user their own previously-loaded data.
  const [cachedActive, setCachedActive] = useState(false)
  useEffect(() => {
    const entry = readCache<boolean>('kt-access-active')
    if (entry?.value && Date.now() - entry.at < 14 * 86_400_000) setCachedActive(true)
  }, [])
  useEffect(() => {
    if (status?.active) writeCache('kt-access-active', true)
  }, [status])
  // Offline awareness: on a cold load with no network the Clerk↔Convex
  // handshake can never complete, so `isLoading` would spin forever and the
  // saved-copy path below would stay unreachable — exactly when it's needed.
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])

  // Lazily start the 30-day trial on first gated visit (idempotent). For a
  // brand-new user `ensureTrial` returns `{ started: true }` and status flips
  // to `trial`; for an existing-but-expired user it returns `{ started: false }`
  // with no error — so clear the pending flag there or the skeleton shows
  // forever and the paywall is unreachable.
  useEffect(() => {
    if (isAuthenticated && status && status.mode === 'none' && !trialPending) {
      setTrialPending(true)
      ensureTrial()
        .then(result => {
          if (!result.started) setTrialPending(false)
        })
        .catch(() => setTrialPending(false))
    }
  }, [isAuthenticated, status, trialPending, ensureTrial])

  if (!enabled) return <>{children}</>
  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-5 px-5 py-24 text-center">
        <span className="flex size-16 items-center justify-center rounded-none bg-primary/10 text-primary ring-1 ring-primary/20"><CircleUserRound className="size-8" /></span>
        <h1 className="font-serif text-4xl tracking-tight">Your trip space is private</h1>
        <p className="text-muted-foreground">Sign in to plan routes, save reservations, live traces and moments.</p>
        <Button size="lg" nativeButton={false} render={<Link href="/sign-in" />}>
          Sign in to continue
        </Button>
      </div>
    )
  }
  if (isLoading || status === undefined || status === null) {
    // Server unreachable or the auth handshake is hanging: when this browser
    // recently had active access, keep the traveller working against their
    // saved copy instead of a skeleton. Offline wins even though neither
    // isLoading nor isAuthenticated can resolve — the cache IS the proof
    // this device had access, and the server re-checks on reconnect.
    if (cachedActive && (offline || (isAuthenticated && !isLoading))) {
      return (
        <div className="flex flex-col">
          <div className="border-b border-amber-500/20 bg-amber-500/10 px-5 py-2 text-center text-xs font-medium text-amber-700 dark:text-amber-300">
            Offline — showing your saved session. Changes sync when you reconnect.
          </div>
          {children}
        </div>
      )
    }
    return <div className="mx-auto max-w-6xl p-8"><div className="kt-shimmer h-48 rounded-none" /></div>
  }
  // A brand-new signed-in user has no row yet — the trial-start mutation is
  // in flight, so keep showing the skeleton instead of flashing the paywall.
  if (status.mode === 'none' && trialPending) {
    return <div className="mx-auto max-w-6xl p-8"><div className="kt-shimmer h-48 rounded-none" /></div>
  }
  if (!status.active) return <PaywallScreen status={status} />
  return (
    <div className="flex flex-col">
      {status.mode === 'trial' && (
        <div className="border-b border-primary/10 bg-primary/5">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm">
            <p className="flex items-center gap-2 text-muted-foreground">
              <CalendarClock className="size-4 text-primary" />
              <span className="font-medium text-foreground">Free trial</span> — {status.daysRemaining} day{status.daysRemaining === 1 ? '' : 's'} left
            </p>
            <Button variant="link" size="sm" className="h-auto px-0 text-primary" nativeButton={false} render={<Link href="/profile?tab=subscription" />}>Buy days</Button>
          </div>
        </div>
      )}
      {children}
    </div>
  )
}
