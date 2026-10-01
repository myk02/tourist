import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service · KenyaTrace',
  description: 'KenyaTrace terms of service — 30-day free trial, prepaid day packs, M-Pesa payments and fair use.',
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Terms of Service</p>
      <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: October 2026</p>
      <div className="mt-8 flex flex-col gap-6 text-[15px] leading-relaxed text-foreground/90">
        <section>
          <h2 className="font-serif text-xl font-semibold">1. What KenyaTrace is</h2>
          <p className="mt-2">KenyaTrace is a Kenya-first travel companion: plan itineraries, explore stays and experiences, pay with M-Pesa, share a live GPS trace, pin trip moments and open a recap when the trip ends.</p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold">2. Accounts</h2>
          <p className="mt-2">You sign in with Clerk (Google, GitHub, Apple or email). You are responsible for activity on your account and for keeping invite links and trace tokens private — anyone with the link can view what it shares.</p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold">3. Free trial and day packs</h2>
          <p className="mt-2">Everyone gets a 30-day free trial from first sign-in. After that, access is prepaid via Weekly (7 days) or Monthly (30 days) packs. Packs are one-time purchases with no auto-renewal. Payments are processed by Paystack (M-Pesa STK push or card) in Kenyan shillings.</p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold">4. Bookings and listings</h2>
          <p className="mt-2">Catalog prices and availability come from third-party providers and can change. AI-drafted (&ldquo;gap&rdquo;) stops are clearly labelled and price-unverified — confirm with the provider before travelling. KenyaTrace is not the merchant of record for stays, flights or activities.</p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold">5. Live trace and safety</h2>
          <p className="mt-2">Live GPS sharing requires your explicit consent and only runs while you keep tracking on. Share trace links only with people you trust; you can disable or rotate the link at any time from the trip page.</p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold">6. Acceptable use</h2>
          <p className="mt-2">Don&apos;t abuse the service, scrape it aggressively, upload unlawful content, or interfere with other travellers&apos; trips. We may suspend accounts that do.</p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold">7. Refunds and support</h2>
          <p className="mt-2">If you were charged but access wasn&apos;t granted, use the in-app payment-recovery flow or contact support — verified payments are always honoured. Day packs are otherwise non-refundable once activated.</p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold">8. Liability</h2>
          <p className="mt-2">Travel involves real-world risk. KenyaTrace is provided &ldquo;as is&rdquo;; to the maximum extent permitted by law we are not liable for provider failures, route conditions, or losses from reliance on AI-generated plans.</p>
        </section>
        <p className="text-sm text-muted-foreground">
          Questions? <Link href="/" className="underline underline-offset-4 hover:text-primary">Back to KenyaTrace</Link>
        </p>
      </div>
    </div>
  )
}
