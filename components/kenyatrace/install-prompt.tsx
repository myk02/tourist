'use client'

import { useEffect, useState } from 'react'
import { Navigation, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'kt-install-dismissed'

/**
 * Install nudge aimed at the in-trip audience: when the browser says the app
 * is installable (or on iOS Safari, which needs the manual Share → Add to
 * Home Screen route), offer it once — then stay quiet for good if dismissed,
 * installed, or the native install dialog is closed. Hidden entirely once
 * running as an installed app.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [showNative, setShowNative] = useState(false)
  const [showIosTip, setShowIosTip] = useState(false)

  useEffect(() => {
    // Register SW for offline shell: production + localhost (so PWA is testable
    // in dev) but not on other hosts where it would interfere with HMR.
    if ('serviceWorker' in navigator) {
      const isLocalhost = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
      if (process.env.NODE_ENV === 'production' || isLocalhost) {
        navigator.serviceWorker.register('/sw.js').catch(() => {})
      }
    }

    let permanentlyDismissed = false
    try {
      permanentlyDismissed = localStorage.getItem(DISMISS_KEY) === '1'
    } catch { /* private mode */ }
    if (permanentlyDismissed) return

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
    const onInstalled = () => {
      try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
      setShowNative(false)
      setShowIosTip(false)
      setDeferred(null)
    }
    window.addEventListener('appinstalled', onInstalled)

    // iOS Safari has no install event — surface the manual route instead.
    // iPadOS 13+ reports as MacIntel with touch points, so check that too.
    const ua = navigator.userAgent
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    if (isIOS) {
      const t = setTimeout(() => setShowIosTip(true), 4000)
      return () => {
        clearTimeout(t)
        window.removeEventListener('beforeinstallprompt', onPrompt)
        window.removeEventListener('appinstalled', onInstalled)
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    setShowNative(false)
    setShowIosTip(false)
  }

  async function install() {
    if (!deferred) return
    let accepted = false
    try {
      await deferred.prompt()
      const choice = await deferred.userChoice
      accepted = choice?.outcome === 'accepted'
    } catch { /* user closed the native dialog */ }
    // A successful install is a one-time deal: remember it so the nudge
    // never comes back (dismissed native dialogs still hide the banner, but
    // can be re-offered on a later visit — only the explicit "Not now" / X
    // and a completed install are permanent).
    if (accepted) {
      try { localStorage.setItem(DISMISS_KEY, '1') } catch { /* ignore */ }
    }
    setDeferred(null)
    setShowNative(false)
  }

  if (!showNative && !showIosTip) return null

  return (
    <div className="fixed bottom-20 left-4 z-[700] w-[calc(100%-2rem)] max-w-sm rounded-none border bg-card p-4 shadow-pop md:bottom-6">
      <button type="button" aria-label="Dismiss" onClick={dismiss} className="absolute right-1.5 top-1.5 flex min-h-11 min-w-11 items-center justify-center rounded-none text-muted-foreground transition-colors hover:text-foreground">
        <X className="size-4" />
      </button>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-none bg-primary text-primary-foreground shadow-xs"><Navigation className="size-5" /></span>
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
