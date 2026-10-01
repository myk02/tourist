import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy · KenyaTrace',
  description: 'KenyaTrace privacy policy — what we collect, why, and how to control it.',
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-12">
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">Privacy Policy</p>
      <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated: October 2026</p>
      <div className="mt-8 flex flex-col gap-6 text-[15px] leading-relaxed text-foreground/90">
        <section>
          <h2 className="font-serif text-xl font-semibold">1. What we collect</h2>
          <p className="mt-2">Account details from Clerk (name, email, image), your trips, stops, bookings, expenses, packing lists, saved spots, moments you upload, and — only with your consent — live GPS positions while tracking is on.</p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold">2. Why we use it</h2>
          <p className="mt-2">To run your trip space: build itineraries, sync calendars, send booking reminders (48h/24h), process M-Pesa payments via Paystack, and render live traces and recaps you choose to share.</p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold">3. Sharing</h2>
          <p className="mt-2">We never sell your data. Shared trips, trace links, moment albums and recaps are visible only to people you give the link or invite to. Processors (Clerk, Convex, Paystack, Resend) handle data only to provide the service.</p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold">4. Location data</h2>
          <p className="mt-2">Tracking consent is opt-in and revocable in your profile. Positions are stored per trip so your trace renders; deleting the trip deletes its positions. Browsers may also cache a recent copy offline so the map works without signal.</p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold">5. Your controls</h2>
          <p className="mt-2">Rotate or disable trace and calendar tokens any time, remove moments, leave shared trips, or delete trips entirely. Contact support to export or erase your account data.</p>
        </section>
        <section>
          <h2 className="font-serif text-xl font-semibold">6. Retention and security</h2>
          <p className="mt-2">We keep trip data while your account is active and protect it with authenticated Convex queries, HMAC-verified payment webhooks, and token-gated public feeds. No method is 100% secure, but we follow industry practice.</p>
        </section>
        <p className="text-sm text-muted-foreground">
          Questions? <Link href="/" className="underline underline-offset-4 hover:text-primary">Back to KenyaTrace</Link>
        </p>
      </div>
    </div>
  )
}
