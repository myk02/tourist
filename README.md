# KenyaTrace

**Travel Kenya your way.**

KenyaTrace is a Kenya-first travel companion: plan an itinerary, explore stays and things to do, pay with M-Pesa, share a live GPS trace with people at home, pin moments on the road, and open a recap when the trip is done.

**Live app:** [kenyatrace.vercel.app](https://kenyatrace.vercel.app)

---

## What you can do

| Feature | Description |
|---------|-------------|
| **Plan** | Tell KenyaTrace where you're going, your dates, and your budget. It builds a day-by-day itinerary with stops, travel time, and cost. |
| **Explore** | Browse stays, flights, things to do, cars, and taxis on a map + grid. Save spots and drop them onto a day of your trip. |
| **Book & pay** | Confirm bookings in Kenyan shillings. Checkout is M-Pesa-first via Paystack, with card as a fallback. |
| **Live trace** | Share a private link so family can follow the journey on a map in real time. You can disable or rotate the link at any time. |
| **Moments** | Pin photos and short clips to a stop. Earn extra days of access by saving real trip memories. |
| **Recap** | When the trip ends, get a shareable story: route, spend, highlights, and the moments that mattered. |

Install it from the browser as a home-screen app so the itinerary and live trace are one tap away on the road.

---

## How a trip flows

```
Plan  →  Explore  →  Book  →  Live trace  →  Moments  →  Recap
```

1. Start on **Plan** with destination, dates, travellers, and budget.
2. Open **Explore** for stays, flights, attractions, cars, and taxis. Add anything you like to a day.
3. Pay outstanding bookings. Invite travel partners to view and edit the same trip.
4. Hit the road. Turn on tracking; share the live trace with people who are not on the trip.
5. Capture moments as you go. Open **Recap** when you get home.

---

## Pricing

Everyone gets a **30-day free trial** from first sign-in. After that, access is prepaid — no auto-renewal.

| Pack | Price | About |
|------|-------|-------|
| Weekly | **KES 100** | 7 days of full access |
| Monthly | **KES 400** | 30 days of full access — best per-day value |

Pay with **M-Pesa** or card.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| App | [Next.js](https://nextjs.org/) 16 (App Router) + React 19 |
| Backend & realtime | [Convex](https://www.convex.dev/) |
| Auth | [Clerk](https://clerk.com/) |
| Payments | [Paystack](https://paystack.com/) (M-Pesa STK + card) |
| Maps | [MapLibre GL](https://maplibre.org/) |
| AI planning | OpenRouter |
| Email | Resend (invites + booking reminders) |
| Hosting | [Vercel](https://vercel.com/) |

---

## Local Development

**Requirements:** Node.js 20+, npm, and accounts for Convex, Clerk, Paystack, and OpenRouter.

```bash
git clone https://github.com/myk02/tourist.git
cd tourist
npm install
cp .env.example .env.local
```

Fill `.env.example` → `.env.local` with your keys, then run the app and Convex together:

```bash
npm run dev:all
```

- App: [http://localhost:17000](http://localhost:17000)
- Convex dashboard: `npx convex dashboard`

Useful commands:

```bash
npm run dev          # Next.js only, port 17000
npm run verify       # typecheck + lint + tests
npm run build        # production build
```

One-shot deploy of git, Convex, and Vercel (needs tokens in `.env.local`):

```bash
python deploy.py "your commit message"
```

---

## Routes

| Path | What it is |
|------|------------|
| `/` and `/plan` | Guided trip planner |
| `/discover` | Explore listings (stays, flights, attractions, cars, taxis) |
| `/trips` | Your trips |
| `/trips/[id]` | Itinerary, bookings, and sharing |
| `/trips/[id]/track` | Live GPS tracking |
| `/moments` | Trip photo & video album |
| `/trace/[id]` | Public live-trace link |
| `/recap/[tripId]` | Public trip recap |
| `/profile` | Account, trial, and day packs |

---

KenyaTrace is built for travellers moving through Kenya — safaris, coast, highlands, and the city in between.