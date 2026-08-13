'use client'

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: {
        key: string
        email: string
        amount: number
        currency: string
        ref: string
        metadata?: Record<string, unknown>
        channels?: string[]
        // NOTE: must be a plain (non-async) function — the script validates
        // it with Object.prototype.toString === "[object Function]".
        callback: (response: { reference: string; status: string; trans?: string; trxref?: string }) => void
        onClose: () => void
      }) => { openIframe: () => void }
    }
  }
}

let paystackPromise: Promise<void> | null = null

/** Loads Paystack's inline checkout script once and caches the promise. */
export function loadPaystackScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('Client only'))
  if (window.PaystackPop) return Promise.resolve()
  if (paystackPromise) return paystackPromise
  paystackPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://js.paystack.co/v1/inline.js'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      paystackPromise = null
      reject(new Error('Could not load the payment provider'))
    }
    document.head.appendChild(script)
  })
  return paystackPromise
}
