'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { UserButton, useUser } from '@clerk/nextjs'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { CalendarClock, Camera, CircleUserRound, Compass, LifeBuoy, Map, MapPin, Sparkles, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/ui/kt/brand-mark'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ThemeToggle } from '@/components/theme-toggle'
import { InstallPrompt } from './install-prompt'
import { PLANS, DayPackCheckout, PlanCard } from './paywall'

// The home page IS the AI planner — labelled "Plan", while real discovery
// lives at /discover as "Explore". Before this rename the two most important
// destinations were effectively mislabelled.
const nav = [{href:'/',label:'Plan',icon:Sparkles},{href:'/discover',label:'Explore',icon:Compass},{href:'/trips',label:'Trips',icon:Map},{href:'/essentials',label:'Essentials',icon:LifeBuoy},{href:'/moments',label:'Moments',icon:Camera},{href:'/profile',label:'Profile',icon:CircleUserRound}]

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href)
}

/**
 * Cron-less booking reminders: every app load (and every 10 minutes while
 * it stays open) checks the signed-in traveller's upcoming reservations and
 * emails the ones entering their 48h/24h window. Silent — a no-op when
 * nothing is due, signed out, or email isn't configured.
 */
function BookingReminderSweep() {
  const sweep = useAction(api.reminders.sweep)
  const { isSignedIn } = useUser()
  useEffect(() => {
    if (!isSignedIn) return
    const run = () => { void sweep().catch(() => {}) }
    run()
    const t = setInterval(run, 10 * 60 * 1000)
    return () => clearInterval(t)
  }, [isSignedIn, sweep])
  return null
}

export function KenyaTraceShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground"><BookingReminderSweep/><Header/><main className="pb-32 md:pb-8">{children}</main><MobileNav/><InstallPrompt/></div>
}

function Brand() {
  return (
    <Link href="/" className="group flex shrink-0 items-center gap-2.5">
      <BrandMark icon="navigation" size="sm" />
      <span className="font-serif text-xl font-semibold tracking-tight">KenyaTrace</span>
    </Link>
  )
}

function Header(){
  const { user } = useUser()
  const pathname = usePathname()
  const sync = useMutation(api.users.sync)

  // Anchor the 30-day trial at first sign-in, wherever that happens. `sync`
  // creates the user + subscription row (with trialEndsAt = sign-up + 30 days)
  // on first call and is a cheap no-op patch afterwards — so a fresh user who
  // signs in on any page starts counting immediately, server-side.
  useEffect(() => {
    if (!user) return
    sync({
      name: user.fullName || user.firstName || 'Traveller',
      email: user.primaryEmailAddress?.emailAddress,
      image: user.imageUrl,
    }).catch(() => {})
  }, [user, sync])

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-8">
        <Brand />
        <nav aria-label="Main navigation" className="hidden items-center gap-1 rounded-full border border-border/80 bg-muted/80 p-1 md:flex">
            {nav.map(item=>{const Icon=item.icon;const active=isActive(pathname,item.href);return (
              <Link
                key={item.href}
                href={item.href}
                className={active
                  ? 'inline-flex h-9 items-center gap-2 rounded-full bg-background px-3.5 text-sm font-semibold text-primary shadow-sm'
                  : 'inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-background/70 hover:text-foreground'}
                aria-current={active ? 'page' : undefined}
              >
                <Icon className="size-4"/><span>{item.label}</span>
              </Link>
            )})}
          </nav>
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <span className="hidden items-center gap-1.5 rounded-full border border-border bg-muted/80 px-3 py-1.5 text-xs font-medium text-muted-foreground xl:flex"><MapPin className="size-3.5 text-primary"/>Made for Kenya</span>
          <HeaderAccount />
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

function formatDate(ts: number | null | undefined) {
  if (!ts) return ''
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * Account + plans controls, present on every page. This is the ONLY pricing
 * entry point in the UI: the "Plans" button opens the checkout modal, so the
 * trial countdown and prices no longer need a banner competing with the page
 * content (the landing page in particular).
 */
function HeaderAccount() {
  const { isSignedIn, isLoaded } = useUser()
  const status = useQuery(api.subscriptions.getStatus)
  const [plansOpen, setPlansOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const ended = Boolean(isSignedIn && status != null && !status.active && status.trialStartedAt != null)
  const onTrial = Boolean(isSignedIn && status?.mode === 'trial')
  const paid = Boolean(isSignedIn && status?.mode === 'paid')

  // Tiny state chip — only when there is something real to report. Signed-out
  // visitors get the plain "Plans" button, no marketing line in the header.
  const chipLabel = onTrial
    ? `${status?.daysRemaining ?? 0}d left`
    : paid
      ? 'Active'
      : ended
        ? 'Trial ended'
        : null

  // The trial/access detail that used to sit in the page banner now lives here,
  // inside the modal, where it can be as wordy as it likes.
  const statusLine = onTrial
    ? `Free trial · ${status?.daysRemaining ?? 0} day${status?.daysRemaining === 1 ? '' : 's'} left · ends ${formatDate(status?.trialEndsAt)}`
    : paid
      ? `Access active until ${formatDate(status?.paidUntil)}`
      : ended
        ? 'Your free trial has ended. Pick a pack below to keep exploring — one-time payment, no auto-renewal.'
        : null

  // Hydration guard: Clerk (isSignedIn/isLoaded) and Convex subscription status
  // are client-only and differ between SSR and the first client render. Render a
  // static signed-out placeholder until mounted + auth loaded so server and
  // initial client HTML match, then switch to real auth UI after hydration.
  const isHydrating = !mounted || !isLoaded

  return (
    <>
      {!isHydrating && chipLabel && (
        <button
          type="button"
          onClick={() => setPlansOpen(true)}
          className="hidden items-center gap-1.5 rounded-none border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 sm:flex"
          aria-label="Open plans"
          suppressHydrationWarning
        >
          {ended ? <Wallet className="size-3.5" /> : <CalendarClock className="size-3.5" />}
          {chipLabel}
        </button>
      )}

      <Button
        size="sm"
        variant={isHydrating ? 'outline' : ended ? 'default' : 'outline'}
        onClick={() => setPlansOpen(true)}
        suppressHydrationWarning
      >
        {isHydrating ? 'Plans' : ended ? 'Subscribe' : 'Plans'}
      </Button>

      <span suppressHydrationWarning>
        {isHydrating ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:inline-flex"
              nativeButton={false}
              render={<Link href="/sign-in" />}
              suppressHydrationWarning
            >
              Sign in
            </Button>
            <Button
              size="sm"
              className="hidden sm:inline-flex"
              nativeButton={false}
              render={<Link href="/sign-up" />}
              suppressHydrationWarning
            >
              Start free trial
            </Button>
          </>
        ) : isSignedIn ? (
          <UserButton />
        ) : (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:inline-flex"
              nativeButton={false}
              render={<Link href="/sign-in" />}
              suppressHydrationWarning
            >
              Sign in
            </Button>
            <Button
              size="sm"
              className="hidden sm:inline-flex"
              nativeButton={false}
              render={<Link href="/sign-up" />}
              suppressHydrationWarning
            >
              Start free trial
            </Button>
          </>
        )}
      </span>

      <Dialog open={plansOpen} onOpenChange={setPlansOpen}>
        <DialogContent className="max-h-[86svh] overflow-y-auto p-5 sm:max-w-xl">
          <DialogHeader className="gap-2 items-center text-center">
            <BrandMark icon="sparkles" size="sm" className="mx-auto" />
            <DialogTitle className="font-serif text-xl tracking-tight">
              <span suppressHydrationWarning>
                {isHydrating ? 'Unlock KenyaTrace' : ended ? 'Pick a plan to continue' : 'Unlock KenyaTrace'}
              </span>
            </DialogTitle>
            <p className="max-w-sm text-sm text-muted-foreground" suppressHydrationWarning>
              {isHydrating
                ? 'Start with a 30-day free trial, then grab a one-time pack whenever you’re ready.'
                : ended
                  ? 'Your free trial has ended. Pick a one-time pack to keep planning — no auto-renewal.'
                  : isSignedIn
                    ? 'One-time packs — no auto-renewal. Skip any month by simply not topping up.'
                    : 'Start with a 30-day free trial, then grab a one-time pack whenever you’re ready.'}
            </p>
          </DialogHeader>
          {isHydrating || !isSignedIn ? (
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {PLANS.map(plan => (
                  <PlanCard
                    key={plan.days}
                    plan={plan}
                    footer={
                      <Button
                        size="lg"
                        className="w-full gap-2"
                        nativeButton={false}
                        render={<Link href="/sign-up" />}
                        suppressHydrationWarning
                      >
                        <Sparkles className="size-4" /> Sign up to buy
                      </Button>
                    }
                  />
                ))}
              </div>
              <Button
                variant="outline"
                size="lg"
                className="w-full"
                nativeButton={false}
                render={<Link href="/sign-in" />}
                suppressHydrationWarning
              >
                I already have an account
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {statusLine && (
                <div
                  className="flex items-center gap-2.5 rounded-none border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm"
                  suppressHydrationWarning
                >
                  <CalendarClock className="size-4 shrink-0 text-primary" />
                  <span className="text-foreground">{statusLine}</span>
                </div>
              )}
              <DayPackCheckout onPurchased={() => { setPlansOpen(false); toast.success('Your access is active') }} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function MobileNav(){
  const pathname = usePathname()
  return (
    <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-40 flex h-[calc(4rem+env(safe-area-inset-bottom))] items-center justify-around gap-0.5 rounded-t-2xl border-t border-border/80 bg-background/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgb(20_33_26_/_0.06)] backdrop-blur supports-[backdrop-filter]:bg-background/90 md:hidden">
      {nav.map(item=>{const Icon=item.icon;const active=isActive(pathname,item.href);return (
        <Link
          key={item.href}
          href={item.href}
          aria-current={active ? 'page' : undefined}
          title={item.label}
          className={active
            ? 'flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl bg-primary/10 px-0.5 py-1.5 text-primary'
            : 'flex h-12 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 py-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'}
        >
          <Icon className="size-5 shrink-0"/><span className="max-w-full truncate text-[10px] font-medium leading-tight">{item.label}</span>
        </Link>
      )})}
    </nav>
  )
}
