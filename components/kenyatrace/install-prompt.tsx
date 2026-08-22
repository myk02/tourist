'use client'

import { useEffect, useState } from 'react'
import { Navigation, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'kt-install-dismissed'
const REASK_AFTER_MS = 14 * 86_400_000

/**
 * Install nudge aimed at the in-trip audience: when the browser says the app
 * is installable (or on iOS Safari, which needs the manual Share → Add to
 * Home Screen route), offer it once — then stay quiet for two weeks if
 * dismissed. Hidden entirely once running as an installed app.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showNative, setShowNative] = useState(false)
  const [showIosTip, setShowIosTip] = useState(false)

  useEffect(() => {
    // The service worker only exists to make the installed shell open on weak
    // connections — production only, never interferes with dev HMR.
    if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    try {
      const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
      if (Number.isFinite(dismissedAt) && Date.now() - dismissedAt < REASK_AFTER_MS) return
    } catch { /* private mode */ }

    // Already installed? Never nag.
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    if (standalone) return

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setShowNative(true)
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    // iOS Safari has no install event — surface the manual route instead.
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    if (isIOS) {
      const t = setTimeout(() => setShowIosTip(true), 4000)
      return () => {
        clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', onPrompt)
      }
    }

    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
    setShowNative(false)
    setShowIosTip(false)
  }

  async function install() {
    if (!deferred) return
    try {
      await deferred.prompt()
      await deferred.userChoice
    } catch { /* user closed the native dialog */ }
    setDeferred(null)
    setShowNative(false)
  }

  if (!showNative && !showIosTip) return null

  return (
    <div className="fixed bottom-20 left-4 z-[700] w-[calc(100%-2rem)] max-w-sm rounded-2xl border bg-card p-4 shadow-pop md:bottom-6">
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="absolute right-2.5 top-2.5 text-muted-foreground transition-colors hover:text-foreground">
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-xs"><Navigation className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Take KenyaTrace with you</p>
          {showNative ? (
            <>
              <p className="mt-0.5 text-xs text-muted-foreground">Install the app so your itinerary and live trace are one tap away on the road.</p>
              <div className="mt-2.5 flex gap-2">
                <Button size="sm" onClick={() => void install()}>Install</Button>
                <Button size="sm" variant="ghost" onClick={dismiss}>Not now</Button>
              </div>
            </>
          ) : (
            <p className="mt-0.5 text-xs text-muted-foreground">In Safari, tap <span className="font-medium text-foreground">Share</span> then <span className="font-medium text-foreground">Add to Home Screen</span> to keep your trip one tap away.</p>
          )}
        </div>
      </div>
    </div>
  )
}
