'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { SignInButton, SignUpButton, UserButton, useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { CalendarClock, Camera, CircleUserRound, Compass, Map, MapPin, Navigation, Sparkles, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PLANS, DayPackCheckout, PlanCard } from './paywall'

const nav = [{href:'/',label:'Discover',icon:Compass},{href:'/plan',label:'Plan',icon:Sparkles},{href:'/trips',label:'Trips',icon:Map},{href:'/moments',label:'Moments',icon:Camera},{href:'/profile',label:'Profile',icon:CircleUserRound}]

export function KenyaTraceShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground"><Header/><main className="pb-24 md:pb-8">{children}</main><MobileNav/></div>
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

  // The landing page keeps just the brand — no nav links up top.
  const isLanding = pathname === '/'
  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 md:px-8">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground"><Navigation className="size-5"/></span>
          <span className="font-serif text-xl font-semibold tracking-tight">KenyaTrace</span>
        </Link>
        {!isLanding && (
          <nav aria-label="Main navigation" className="hidden items-center gap-1 md:flex">
            {nav.map(item=>{const Icon=item.icon;return <Button key={item.href} variant="ghost" className="gap-2 px-3.5" nativeButton={false} render={<Link href={item.href}/>}><Icon className="size-4"/><span className="text-sm">{item.label}</span></Button>})}
          </nav>
        )}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span className="hidden items-center gap-2 rounded-md border border-border px-2.5 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground xl:flex"><MapPin className="size-4 text-primary"/>Made for Kenya</span>
          <HeaderAccount />
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
  const { isSignedIn } = useUser()
  const status = useQuery(api.subscriptions.getStatus)
  const [plansOpen, setPlansOpen] = useState(false)

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

  return (
    <>
      {chipLabel && (
        <button
          type="button"
          onClick={() => setPlansOpen(true)}
          className="hidden items-center gap-1.5 rounded-md border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 sm:flex"
          aria-label="Open plans"
        >
          {ended ? <Wallet className="size-3.5" /> : <CalendarClock className="size-3.5" />}
          {chipLabel}
        </button>
      )}

      <Button
        size="sm"
        variant={ended ? 'default' : 'outline'}
        onClick={() => setPlansOpen(true)}
      >
        {ended ? 'Subscribe' : 'Plans'}
      </Button>

      {isSignedIn ? (
        <UserButton />
      ) : (
        <>
          <SignInButton mode="modal">
            <Button variant="ghost" size="sm">Sign in</Button>
          </SignInButton>
          <SignUpButton mode="modal">
            <Button size="sm" className="hidden sm:inline-flex">Start free trial</Button>
          </SignUpButton>
        </>
      )}

      <Dialog open={plansOpen} onOpenChange={setPlansOpen}>
        <DialogContent className="max-h-[86svh] overflow-y-auto p-5 sm:max-w-xl">
          <DialogHeader className="gap-2 items-center text-center">
            <span className="mx-auto flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="size-5" />
            </span>
            <DialogTitle className="font-serif text-xl tracking-tight">
              {ended ? 'Pick a plan to continue' : 'Unlock KenyaTrace'}
            </DialogTitle>
            <p className="max-w-sm text-sm text-muted-foreground">
              {ended
                ? 'Your free trial has ended. Pick a one-time pack to keep planning — no auto-renewal.'
                : isSignedIn
                  ? 'One-time packs — no auto-renewal. Skip any month by simply not topping up.'
                  : 'Start with a 30-day free trial, then grab a one-time pack whenever you’re ready.'}
            </p>
          </DialogHeader>
          {isSignedIn ? (
            <div className="flex flex-col gap-3">
              {statusLine && (
                <div className="flex items-center gap-2.5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-2.5 text-sm">
                  <CalendarClock className="size-4 shrink-0 text-primary" />
                  <span className="text-foreground">{statusLine}</span>
                </div>
              )}
              <DayPackCheckout onPurchased={() => { setPlansOpen(false); toast.success('Your access is active') }} />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                {PLANS.map(plan => (
                  <PlanCard
                    key={plan.days}
                    plan={plan}
                    footer={
                      <SignUpButton mode="modal">
                        <Button size="lg" className="w-full gap-2">
                          <Sparkles className="size-4" /> Sign up to buy
                        </Button>
                      </SignUpButton>
                    }
                  />
                ))}
              </div>
              <SignInButton mode="modal">
                <Button variant="outline" size="lg" className="w-full">I already have an account</Button>
              </SignInButton>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function MobileNav(){return <nav className="fixed inset-x-0 bottom-0 z-40 flex h-20 items-center justify-around border-t bg-background md:hidden">{nav.map(item=>{const Icon=item.icon;return <Button key={item.href} variant="ghost" className="flex-col gap-1 text-muted-foreground" nativeButton={false} render={<Link href={item.href}/>}><Icon/><span className="text-xs">{item.label}</span></Button>})}</nav>}
