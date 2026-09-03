'use client'

import { useRef, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useAction, useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Doc } from '@/convex/_generated/dataModel'
import { Loader2, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { toMinorKES } from '@/lib/money'
import { loadPaystackScript } from '@/lib/paystack-inline'

/**
 * "Pay now" for a reservation. Creates a pending payment server-side (the
 * amount comes from the booking record, the secret key never leaves Convex),
 * opens the Paystack Inline popup with the public key + reference (the served
 * inline.js has no access-code support, so the checkout initializes the
 * transaction client-side), then verifies and confirms the payment.
 */
export function PayNowButton({ booking }: { booking: Doc<'bookings'> }) {
  const { user } = useUser()
  const initialize = useMutation(api.payments.initialize)
  const verifyAndConfirm = useAction(api.payments.verifyAndConfirm)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  async function pay() {
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
    setBusy(true)
    try {
      const { paymentId, reference, amount } = await initialize({ bookingId: booking._id, email })
      await loadPaystackScript()
      if (!window.PaystackPop) throw new Error('Payment provider unavailable')

      // Paystack's inline script validates that `callback` is a plain
      // function (Object.prototype.toString must be "[object Function]"), so
      // it can't be an async arrow — the async confirmation runs inside a
      // synchronous wrapper instead.
      const confirm = async () => {
        // Keep the button disabled until verification settles so a fast
        // user can't re-open a second checkout while the first is still
        // being confirmed server-side.
        try {
          const result = await verifyAndConfirm({ paymentId })
          if (result.verified) {
            toast.success(`Payment received — ${booking.reference} is confirmed`)
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
          setBusy(false)
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
          setBusy(false)
        },
      })
      handler.openIframe()
      // M-Pesa STK guidance: the prompt lands on the payer's phone, not in
      // this tab — tell them where to look or first-time payers stall here.
      toast.info('Check your phone — enter your M-Pesa PIN to complete payment')
    } catch (error) {
      busyRef.current = false
      setBusy(false)
      toast.error(error instanceof Error ? error.message : 'Could not start payment')
    }
  }

  return (
    <Button size="sm" onClick={pay} disabled={busy} className="gap-1.5">
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wallet className="size-3.5" />}
      {busy ? 'Starting…' : 'Pay now'}
    </Button>
  )
}
