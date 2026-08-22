# KenyaTrace — Frontend Restructure Plan v2

A fresh audit of every page, function, workflow and UI pattern in the current codebase, combined with new research into how leading travel products work in 2025–2026 (Airbnb's app relaunch, Mindtrip/Layla/JRNEY AI-planner studies, Wanderlog/TripIt, and Kenyan platforms Tukio, Safari Wallet, Klickenya). This plan supersedes `restructure.md` and `AI-RESTRUCTURE-PLAN.md`, whose phases are already implemented.

---

## Part 1 — Audit: what the product is today

### Stack
Next.js 16 (App Router) · Convex (DB + actions) · Clerk auth · Paystack (KES) · MapLibre · Tailwind v4 · dnd-kit · sonner. Monetization: 30-day trial, one-time packs KES 100/7d and KES 400/30d.

### Page inventory

| Route | Component | What it does today |
|---|---|---|
| `/` | `guided-journey.tsx` (1,387 lines) | The whole journey as a 6-stage wizard: where → budget → plan → track → share → done |
| `/discover` | thin wrapper | Category hub entry |
| `/discover/[vertical]` | `discover-page.tsx` | Stays/flights/attractions/cars/taxis browse: hero, search+sort+filters, card grid ↔ live map split, saved hearts, add-to-trip |
| `/discover/[vertical]/[id]` | `listing-detail.tsx` | Public listing page: photos, tags, map, Reserve (paywalled), add-to-trip, price-drop banner |
| `/trips` | `trips-page.tsx` | Grouped Upcoming / In-progress / Completed cards with duplicate/copy/delete |
| `/trips/[id]` | `trip-detail.tsx` | Hero + 8 action buttons, checklist card, AI brief, budget bar, tabs: Itinerary (editor) / Route map / Budget / Bookings / Moments |
| `/trips/[id]/track` | `live-page.tsx` | Full-screen GPS tracing: consent → start → arrival detection, checklist dialog |
| `/moments` | `moments-page.tsx` | Per-trip album/map/timeline views, upload dialog with auto stop-pinning + AI caption, free-days credit loop |
| `/moments/[tripId]` | `moments-share.tsx` | Anonymous shared album + social share intents |
| `/recap/[tripId]` | `recap-view.tsx` | Shareable best-9 grid |
| `/trace/[id]?t=` | `trace-view.tsx` | Token-gated public live route replay |
| `/profile` | `profile-page.tsx` | Tabs: Overview / Bookings / Saved / Preferences / Subscription / Settings |

Supporting systems: collaboration sharing (`share-trip.tsx`), email-forward booking import (`forward-booking.tsx`), printable PDF (`lib/itinerary.ts`), catalog-grounded AI planner (`/api/plan` + client-side candidate scoring), OSRM travel times, scraper pipeline feeding listings.

### Confirmed issues found in this audit (with file refs)

**Bugs / correctness**
1. `itinerary-editor.tsx` uses `${stop.title}-${i}` as drag/edit keys — duplicate stop titles collide; reorder targets wrong row.
2. `itinerary-editor.tsx` search fires on every keystroke, no debounce; cost/time/duration column hidden below `sm:` so mobile users cannot see or edit them; `parseInt() || 0` snaps cleared fields.
3. `live-page.tsx` consent Switch is hard-coded `checked={false}` — looks dead until refetch; no way anywhere in-app to revoke consent mid-trip except Profile settings.
4. `tracking-provider.tsx`: silent failure if Convex trail writes fail; no handling for POSITION_UNAVAILABLE/TIMEOUT (session stalls silently); no browser-without-geolocation guard before toast success; arrival auto-navigation can refire after reload; no cross-tab session guard.
5. `live-page.tsx` loads the entire positions history every visit — unbounded growth over long trips.
6. `listing-detail.tsx` paywall race: form opens while `getStatus` still loading (`undefined` falsy); `confirmAdd`/`createNewTrip` lack try/catch (silent failures).
7. `share-trip.tsx` shows "Copied" even when clipboard throws; removing collaborators/link has no confirmation.
8. `moment-album.tsx` delete has no confirm; tile controls are hover-only — unreachable on touch devices.
9. `forward-booking.tsx` parsed fields are not editable before saving (KSh 0 amounts get waved through).
10. `trips-page.tsx` status progress bars are fake constants (planning=25%…) — not derived from actual stop completion; "Plan fast" nudge shows for *every* planning trip regardless of dates.
11. `discover-page.tsx` exposes internal scraping concepts as filters: "Firecrawl / Live web / Curated".
12. `trace-view.tsx` says "Live" but never polls/refetches — static snapshot, no last-updated time.

**Information architecture**
13. Bottom nav labels `/` as **"Discover"**, but `/` is actually the AI planner wizard — while a *different* page (`/discover`) is real discovery. The two most important destinations are mislabeled.
14. The journey forces sequential stages; "Track" and "Share" sit between the user and finishing a session even when they only wanted a plan. Skip paths exist but are ghost buttons.
15. Trip-detail hero carries **8 competing buttons** (Start tracking, Moments, Share, Status, Duplicate, Trace link, Copy link, Print, Delete) — no hierarchy.
16. Booking state lives in three places (trip tab, profile tab, listing dialogs) with no unified narrative of requested → pay → paid.
17. No offline story at all — fatal for a travel companion used on safari/road (see research).
18. Trial/paywall messaging is scattered (header chip, modal, banners injected by wrappers) with inconsistent tone across surfaces.

---

## Part 2 — Research findings that drive this plan

**AI-trust (perpet.io 1.2M-plan study; VP0 itinerary kit; Layla-vs-Mindtrip teardown)**
- A visible one-line reason per suggestion beats model accuracy; unexplained cards get challenged even when right.
- Edits must stay local — regenerating a whole day to fix one item teaches users to stop trusting edits.
- Honest confidence ("popular with travellers heading to Mara in August") outperforms absolute claims; flagged low-confidence beats confident wrong.
- Acceptance peaks around **~3 stops/day**; past 5–6 it collapses regardless of quality.
- Draft-first planners (Mindtrip) beat consultation-style ones on speed-to-value; Layla wins on *value before commitment* — users build and see a full plan **before any signup/paywall**.
- Generation wait should show progress + destination tips, not spinners.

**Airbnb 2025 relaunch**
- Three-tab IA: Explore / **Trips as a "living itinerary"** / Messages. The trips tab merges bookings, schedule, and context into one scannable timeline — the product's post-purchase home.
- Density handled by 2×2 grids, carousels, and ruthless scanning hierarchy — breadth without overwhelm.

**Wanderlog / TripIt**
- Itinerary and map must be one view; travel-time gaps as first-class rows.
- Import reservations by forwarding email (KenyaTrace has this — underexposed).
- Route optimization, export to Google Maps, **offline access**, sample trips to defeat blank-canvas fear, visual feature-completion gamification.
- TripIt research: timeline views consistently test best; too many fields/clutter kills usability; hidden gear-menu CTAs fail — use descriptive actions.

**Kenyan market (Tukio, Safari Wallet, Klickenya, SafariEA)**
- Instant M-Pesa booking is *the* local trust pattern: "Booked Maasai Mara in literally 2 minutes via M-Pesa."
- Tukio disrupted quote-waiting with pre-priced components assembled into a bookable itinerary — exactly KenyaTrace's shape; lean into instant confirmation language.
- WhatsApp is the support/trust channel of record. Offline itineraries explicitly marketed. KES-native pricing everywhere.

---

## Part 3 — North-star IA restructure

```
Nav (mobile bottom + desktop pill):   PLAN   ·   EXPLORE   ·   TRIPS   ·   MOMENTS   ·   PROFILE
                                        │           │           │           │           └ account, prefs, billing
                                        │           │           │           └ journal + public share pages
                                        │           │           └ living-itinerary hubs (one per trip)
                                        │           └ stays/flights/things/cars/taxis marketplace
                                        └ the guided journey (rename from misleading "Discover")

Core product loop:  EXPLORE ──┐
                              ├─▶ PLAN ──▶ TRIP HUB ──▶ TRACK ──▶ SHARE (moments/recap/trace)
              (saved places ──┘        save = account      tracking/bookings
                                                            gated by trial/pack)
```

Decisions:
- **D1.** Rename nav: `/` becomes **Plan**, `/discover` becomes **Explore**. Fixes issue #13 with zero routing churn.
- **D2.** The journey shrinks from 6 stages to **3**: *Brief* (where/who/days/month/budget/interests — one composer), *Plan* (review + adjust), *Saved* (confirmation → deep-link into the trip hub). Tracking and sharing leave the wizard entirely — they become actions inside the trip hub. This removes both dead-end stages (#14).
- **D3.** Trip detail becomes the **living-itinerary hub** (Airbnb Trips-tab pattern): one timeline of days with stops, bookings, moments, and tracking state woven together — tabs demote to secondary views.
- **D4.** Signed-out visitors can generate and fully view a plan; sign-in is required only at **Save**; subscription only gates **bookings, tracking, and moments uploads** (trial/pack). Matches Layla's create-before-you-pay conversion driver and keeps current gating semantics intact.

---

## Part 4 — Page-by-page restructure

### 4.1 Plan (home, `guided-journey.tsx`) — split and simplify

Current: 1,387-line component, six stages, sessionStorage draft, prefill from profile, auto-geolocation, catalog-grounded generation, budget-fit rejection loop.

Target workflow:
1. **Brief composer** (single screen, replaces "where"+"budget"):
   - Location card (auto-detect + manual fallback — keep, it's good).
   - Traveller type, days slider, month picker with season chip — inline, not on separate screens.
   - Budget slider with tier chip + interest chips (keep) + **group size** field (adults/kids) — feeds per-person pricing honesty later.
   - Primary CTA: **"Build my plan"**. Sample-trace dialog stays as the blank-canvas antidote.
   - During generation: keep step list, **add rotating Kenya travel tips** (season trivia, packing, park-fee facts) — proven wait-time pattern; tips must be evergreen, never prices/hours.
2. **Plan review** (current plan stage, tightened):
   - Header: name, summary, origin note, season line (keep).
   - BudgetBar + "How to get there" leg cards + map + WhereYouStay swaps (keep all — strong).
   - Day groups: enforce the research finding — if any day exceeds 5 stops, show an amber **"Heavy day" pace warning** with a "Re-balance" button (calls replanDay).
   - Reason lines stay mandatory (they already are — keep enforcing).
   - Confidence copy: suggested stops read "Suggested · fits your Wildlife interest", verified read "Verified · real place, checked price".
3. **Saved** (new terminal stage): replaces track/share/done stages. Shows trip-card preview + three equal actions: *Open trip hub*, *Start live tracking*, *Share plan*. Session-complete stats move into the trip hub, not a dead end.

Engineering notes: extract each stage into its own component file (the monolith is the maintainability risk now); draft persistence stays; add **"Continue your last journey"** resume banner if a saved draft has a generated plan (issue: none today — cheap win from AI-PLAN backlog).

### 4.2 Explore (`/discover/*`)

Current is close to best-practice (map↔list sync, pills, URL state, hearts, load-more). Changes:
1. **Kill the Firecrawl/Live-web/Curated source filter** (#11) — replace with a single honest freshness chip on cards ("updated 2d ago", already present) and drop the filter UI entirely.
2. **Hub page** (`/discover`): turn the category entry into a real merchandising surface — category tiles with hero images + counts, plus 2–3 editorial rails ("Beach escapes", "Weekend safari under KES 30k", "Best of Nairobi") powered by tag queries over `listings`. This is what makes Explore feel like Airbnb's homepage instead of five parallel search pages.
3. **Listing detail**: fix the paywall race (#6) — gate the dialog open on `getStatus !== undefined`; wrap all mutations in try/catch with toasts; add a sticky mobile bottom bar (price + Reserve) since the booking card scrolls away.
4. **Booking flow clarity**: Reserve dialog gains an explicit status stepper (Requested → Payment → Confirmed). After payment success, land on the **trip hub bookings section**, not a toast void.

### 4.3 Trips — the living-itinerary hub (`trips-page.tsx`, `trip-detail.tsx`)

List page:
1. Replace fake status percentages with **real progress** = completed stops ÷ total stops (data already exists via `completedAt`).
2. Countdown logic stays; suppress the "Plan fast" nudge unless start date is within 14 days (#10).
3. Card keeps: cover, countdown, budget-spend bar, real-progress bar.

Detail page — rebuild hero into hierarchy:
- **Primary:** contextual CTA (Planning → "Finish plan"; Ready → "Start live tracking"; Travelling → "Open tracker").
- **Secondary row:** Share, Moments, Bookings anchor.
- **Overflow menu:** Duplicate, Copy link, Print/PDF, Trace link, Delete. Eight buttons become one button + one menu (#15).

Body — weave into one scrollable living itinerary:
1. **Timeline-first**: day sections with stops as rows (time chip, title, kind icon, verified badge, cost, inline checkbox from TripChecklist) and travel-time rows between them. Checklist card disappears as a separate block (#15/#16 merge).
2. Bookings appear inline on their day ("Tonight: Emashkie Lodge · Paid ✓" / "Requested · **Pay KES X**" → opens Paystack inline). The Bookings tab remains for the full ledger + forward-email import.
3. Moments strip per day (first photo + count) linking to the album — closes the loop between planning and remembering.
4. Route map stays as a tab; add per-stop "Open in Google Maps" links (Wanderlog's most-praised export; zero backend cost).
5. AI brief + Budget dashboard remain, positioned after the timeline.

### 4.4 Live tracking (`live-page.tsx`, `tracking-provider.tsx`, `tracker-widget.tsx`)

Hardening (fixes #3–#5):
1. Consent switch binds to real state; add **revoke** affordance on the track page itself ("Stop & erase trail" clears consent + ends session).
2. Handle POSITION_UNAVAILABLE/TIMEOUT: show staleness chip ("last fix 4m ago") instead of silently stalling.
3. Guard `navigator.geolocation` existence before success toast; cross-tab guard via `localStorage` lock; window the positions query (last N hours / last 500 points) with older points summarized server-side.
4. Arrival card CTAs reduced to: Share trace (primary), Open moments (secondary) — matches D2's removal of tracking-as-stage.
5. Trace-view: poll positions every 30s while page visible + "Updated 12s ago" chip, so "Live" is honest (#12).

Widget: compact persistent pill showing distance-to-go + progress ring; expands to mini-map. Already solid concept — just bind to hardened provider.

### 4.5 Moments + public pages

1. Album tiles: replace hover-only controls with always-visible compact icon row (best ★, globe, trash) — touch parity (#8).
2. Delete gets an undo toast (sonner action) instead of confirm dialog — faster and safe.
3. Post-trip completion (status → completed), the trip hub surfaces a **"Make your recap"** prompt once ≥9 public moments exist — turns the strongest growth asset into a guided moment.
4. Public pages (share/recap/trace): keep; they're well-executed. Add polling to trace only (above).

### 4.6 Profile

Structure is right. Changes:
1. Bookings tab becomes the **bookings ledger**: status pills, Pay CTA on unpaid, cancel on requested, receipt link on paid — one authoritative place (#16).
2. Overview adds **"Continue planning"** resume card when a journey draft exists (ties to 4.1).
3. Settings: keep tracking-consent toggle here as the global authority (now also reachable from track page per 4.4).

### 4.7 Paywall & checkout

1. Keep gating exactly where it is (save=account; bookings/tracking/moments=access) — it matches D4 and Layla's pattern.
2. Unify tone: one `AccessChip` component used everywhere (header, trip hub, track page) — same copy rules: trial shows days left; expired shows "Pick a pack"; paid shows nothing unless expiring ≤7 days.
3. Checkout modal: lead with M-Pesa ("Pay with M-Pesa or card — instant access"), show pack comparison as two cards (keep), and after purchase return the user to the exact gated action they were attempting (state is already threaded through `RequireSubscription` contexts — finish the job).

### 4.8 Cross-cutting foundations

| Theme | Decision |
|---|---|
| **Offline (highest-leverage gap)** | Ship a PWA manifest + service worker; persist active trip JSON + stop images to localStorage/Cache API on open; itinerary reads work fully offline (VP0: "an itinerary app that needs bandwidth at its moment of use has failed"). Phase-later: offline map tiles for the active trip. |
| **WhatsApp support** | Persistent "Questions? WhatsApp us" entry point in profile + booking-failure toasts. Local-market trust pattern. |
| **States** | Standardize via `shared.tsx`: every async region gets loading shimmer, empty state with CTA, error state with Retry. Audit hits: editor search errors, geocode failures, clipboard failures. |
| **Destructive ops** | Undo-toast pattern everywhere (stops, moments, collaborators, saved items); confirm dialogs only for irreversible cascades (delete trip). |
| **SEO** | Server-render listing detail metadata (exists for share pages); add `generateMetadata` to `/discover/[vertical]/[id]`. Destination landing pages deferred until content ops exist. |
| **Analytics** | Instrument funnel: brief→generated→saved→tracked→booked→moment→recap-shared. These are the success metrics below. |

---

## Part 5 — Quick-fix list (do first, independent of phases)

| # | Fix | File |
|---|---|---|
| 1 | Stable stop keys (`stopId ?? crypto.randomUUID()` at ingest) | `itinerary-editor.tsx` |
| 2 | Debounce editor search 300ms; show mobile cost/time column | `itinerary-editor.tsx` |
| 3 | Consent switch real state + revoke path | `live-page.tsx` |
| 4 | Geolocation guards + staleness indicator | `tracking-provider.tsx`, `live-page.tsx` |
| 5 | Window positions query | `live-page.tsx` + `positions.forTrip` |
| 6 | Paywall race + try/catch on listing mutations | `listing-detail.tsx` |
| 7 | Honest copy-feedback + confirm on collaborator remove | `share-trip.tsx` |
| 8 | Touch-visible album controls + undo delete | `moment-album.tsx` |
| 9 | Real progress % + conditional nudge | `trips-page.tsx` |
| 10 | Remove source-filter UI | `discover-page.tsx` |
| 11 | Editable parsed fields in forward-booking preview | `forward-booking.tsx` |
| 12 | Trace polling + updated-at | `trace-view.tsx` |

## Part 6 — Roadmap

| Phase | Scope | Est. |
|---|---|---|
| **0. Stabilize** | Quick-fix table above | 1 day |
| **1. IA rename** | Nav Plan/Explore swap, landing treatment for signed-out `/` | 0.5 day |
| **2. Planner v2** | Split monolith into stage files; Brief composer; Saved terminal stage; generation tips; heavy-day warnings; resume banner | 2–3 days |
| **3. Trip hub** | Living-itinerary timeline, hero hierarchy + overflow menu, inline bookings/moments, Google-Maps links, real progress | 2–3 days |
| **4. Tracking hardening** | All of 4.4 incl. trace polling | 1–2 days |
| **5. Explore polish** | Hub merchandising, listing-detail fixes + sticky CTA, booking stepper | 1–2 days |
| **6. Moments + Profile** | Touch controls, recap prompt, bookings ledger, resume card | 1 day |
| **7. Offline/PWA** | Manifest, service worker, cached trip view | 2 days |
| **8. Paywall unification** | AccessChip, M-Pesa-first checkout, return-to-action | 1 day |

**Success metrics:** brief→saved conversion (target +20%), saved→tracking-start rate, booking payment completion rate, moments-per-completed-trip, recap shares per completed trip, trial→pack conversion, D7 retention.

---

## Sources
- perpet.io — "1.2M trips planned: what an AI travel planner taught us about trust" (Jul 2026)
- vp0.com — "Travel Itinerary Planner AI UI Kit: Honest Trip Design" (Jun 2026)
- aitravel.tools — "Layla vs Mindtrip vs Wonderplan tested" (May 2026)
- orbix.studio — AI Travel case study (Oct 2025); zenn.dev — Tabidea generation-wait UX (Apr 2026)
- Airbnb Newsroom / Design Week / It's Nice That / The Verge — 2025 Summer Release app redesign (May 2025)
- wanderlog.com feature set; katangeles.com — TripIt web explorations; screensdesign.com — TripIt/Layla breakdowns
- disruptafrica.com — Tukio coverage; mysafarico.ke / Safari Wallet; klickenya.com; safariea.com; github.com/gabrielmahia/nairobi-stack (East-African mobile-first UX reference)
