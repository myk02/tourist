# KenyaTrace — AI-First Restructuring Plan

A deep audit of the whole product (codebase, UI, workflow, backend, AI pipeline) combined with web research into how the leaders in AI travel planning (Mindtrip, Google/Gemini, Layla, TripAdvisor's AI Trip Builder, Wonderplan, MonkeyTravel) and the AI-product design community handle quality, trust, and "AI slop". The goal: make KenyaTrace feel like an **intelligent system**, not a wrapper around a free LLM.

---

## ⭐ Status — what has shipped (last updated after Phases 1–5)

All five roadmap phases below have been **implemented and verified** (typecheck clean, 57/57 tests, production build succeeds, live endpoint tests). This section is the audit trail; the rest of the document keeps the original research and now marks each item with its status.

| Phase | Shipped | Notes |
|---|---|---|
| **1 · Kill the slop** | ✅ Complete | Grounded planner, provenance chips, OSRM travel times, slop rules, cross-day dedup |
| **2 · Feel intelligent** | ✅ Mostly | Preferences pre-fill + seasonal planning + images on plan cards. **Not shipped:** discover-list-then-arrange, swap-this-stop, guest plan preview, group-size/dietary fields |
| **3 · Tracking as hero** | ✅ Complete | Public trace page, stop check-off, AI trip brief |
| **4 · Moments loop** | ✅ Complete | Upload→free days credit, auto stop-association, 9-grid recap. **Not shipped:** group voting/comments |
| **5 · Monetization & polish** | ✅ Mostly | Value-first paywall, price-drop alerts, printable itinerary, share-link SEO. **Not shipped:** plan preview behind the wall, continue-where-you-left-off, Discover recommendation row / card trust chips |

### Shipped in detail

**Phase 1 (slop → curation):**
- `app/api/plan/route.ts` is now **catalog-grounded**: the client scores the real listings DB (`planCandidates` in `guided-journey.tsx`) and sends ~60 candidates; the AI **selects by id**, and the server merges real name/price/rating/coords/photo/unit back in (`resolveStops`). Gap stops (max 2, `source:'gap'`) have no invented data.
- **Real travel times**: `lib/travel.ts` (OSRM public API with haversine fallback, concurrency-limited), stamped as `travelKm`/`travelMins` on stops; shown in plan cards and the editor. Verified live: Nairobi→Naivasha = 111 km / 108 min.
- **Provenance chips** (Verified with listing link / Suggested) with reason lines that must contain a specific checkable fact; **cross-day dedup** stops the free model repeating one favourite place.
- **Data model**: `tripStops.source/listingId/vertical/unit/image/travelKm/travelMins` (+ `completedAt` in Phase 3), `trips.traceShareToken/aiBrief`, `users.momentsMediaTotal/momentsEarnedDays`, `savedListings.priceAtSave`.

**Phase 2 (feel intelligent):**
- Signed-in travellers get their profile **preferences pre-filled** (interests, pace, budget) once per fresh journey, with a visible "pre-filled from your profile" note.
- **Seasonal planning**: `lib/seasons.ts` is the shared source of truth; a "When are you going?" month picker with a live season chip drives fact-based season guidance in the AI prompt (plan + replan). Verified live with an August (migration-season) request.

**Phase 3 (tracking as hero):**
- **Public shareable live-trace page** `/trace/[id]?t=token` (secret token per trip; no costs/owner data exposed; distance computed server-side). "Share trace" CTAs on the arrival card, the pinned tracker widget, and the trip page. This fixes fix.md #13 (the old dead end).
- **Stop check-off** (`tripStops.completedAt` + `setStopCompleted`): `TripChecklist` on the track page (dialog) and trip detail (inline card), with live "7 of 14 done" progress. `completedAt` survives replans.
- **AI trip brief**: `/api/brief` grounds a short summary strictly in the trip's actual stops (anti-slop, season-aware tip, progress-aware); generated on demand, stored on the trip.

**Phase 4 (moments growth loop):**
- **Every 3 photos/videos uploaded = +1 free day** of access, stacked onto `paidUntil` like a day pack (server-side in `moments.create`); progress bar on the Moments page, "Includes N free days earned from your moments" on the Subscription tab, and an earned-day toast on upload.
- **Auto stop-association**: uploading quietly geolocates and pins the moment to the nearest itinerary stop within 60 km (manual pinning still respected).
- **Shareable 9-grid recap** `/recap/[tripId]`: best-9 public moments, gradient header, lightbox, share buttons; "Recap" button in the album and a link from the public moments page.

**Phase 5 (monetization & polish):**
- **Value-first paywall**: `api.subscriptions.paywallContext` shows "What's waiting for you" — trip/saved/moment counts and the next trip — before the plan cards.
- **Price-drop alerts**: price recorded at save time; `api.saved.drops`/`find` power a green banner + `-X%` badges + strikethrough old price in the Saved tab, and a "Price dropped KES A → KES B since you saved it" notice on the listing page.
- **Offline itinerary**: `lib/itinerary.ts` builds a self-contained printable/PDF document (day sections, travel legs, day totals, honest "suggested ~estimate" markers); "Print / PDF" button on the trip page.
- **Share-link SEO**: `lib/share-meta.ts` resolves real titles/descriptions/og:image (first public photo) from Convex at request time for `/trace`, `/recap`, `/moments/[tripId]`; `metadataBase` added. Verified live on all three pages.

### fix.md status (pre-existing bugs, verified against current source)

| fix.md # | Issue | Status |
|---|---|---|
| 1 | Expired-trial infinite skeleton | ✅ Fixed (`trialPending` cleared when `ensureTrial` returns `started:false`) |
| 2 | Scraper validator rejects `vertical` | ✅ Fixed (`vertical: v.optional(...)` tolerated); pipeline itself not live-tested |
| 3 | New plans clobbered by old storage key | ✅ Likely fixed (editor remounts per plan; no constant storage key) — worth a manual check |
| 4 | `destination` = first stop | ✅ Fixed (prefers `parsed.destination`) |
| 5 | Duplicate trips on re-save | ✅ Fixed (`createTrip` reuses existing `tripId`) |
| 6 | Day replan mixes days / truncates | ✅ Fixed — replan now filters the model output to the target day server-side |
| 7 | `/trips` gates collaborators | ✅ Fixed (`enabled={gateEnabled}`) |
| 8 | Moments page breaks for shared trips | ✅ Fixed — dropdown offers owned trips only; shared selections get a read-only notice |
| 9 | Tracking progress resets on reload | ✅ Fixed (`startDistance` persisted with the session) |
| 10 | Live trace double-draws | ✅ Fixed (DB trail + short live tail) |
| 11 | Widget permanently dismissed | ✅ Fixed (reset on session/status change) |
| 12 | `Ksh` vs `KSh` | ✅ Fixed (canonical `KSh`, tests pass) |
| 13 | No way to share a trace | ✅ Shipped (Phase 3) |

---

## Part 0 — What KenyaTrace already does well (keep these)

Don't rip out what works. These are genuinely good and match best practice:

- **The day is the core organizing unit.** Day tabs, per-stop time/cost, travel-time rows between stops (`ItineraryEditor`), per-day and per-category budget bars. This is the strongest consensus pattern in the research (VP0, To & Fro, TripIt).
- **Map + list sync** with hover/click linking on Discover and the itinerary editor. Mindtrip won awards partly for "seeing your itinerary geographically".
- **Locked stops survive regeneration** — "anchor" stops + re-plan-one-day (exactly what perpet.io's AI-trust research recommends: scoped edits, never regenerate the whole day to fix one stop).
- **Verification honesty — now real, not skeleton.** The `verified` flag is wired to the actual catalog: provenance chips (Verified / Suggested), listing links, real prices/ratings/photos, computed travel times.
- **Live tracking with a persistent widget**, arrival detection, real-time collaboration via Convex, guest-accessible Discover, and a read-only Sample Trace for pre-signup trust.
- **Location-first planning** (auto-detect, models respect your location) and **season-aware planning** (travel-date input + Kenya seasonality guidance).
- **Modern, polished design system** — light/dark themes, soft shadows, consistent radii, dark-mode maps.
- **Moments are a growth loop** — uploads earn free days, photos auto-pin to the itinerary stop, and there's a shareable 9-grid recap.
- **Public share artifacts with real SEO** — trace and recap pages carry dynamic OG metadata.

---

## Part 1 — The core problem: the AI pipeline produces "slop" by design

### 1.1 The planning engine invents everything — ✅ SOLVED

Today (`app/api/plan/route.ts` + `lib/ai.ts`) a single free LLM call (Nemotron) is asked to *create* a full trip: place names, prices, coordinates, driving times, "how to get there", reasons. Then heuristics parse whatever JSON comes back and validators retry up to 4 times to make it obey the budget and the origin.

**This is now fixed.** The model curates from a real candidate catalog by id; the server merges real listing data and real OSRM travel times; the remaining slop risks are:
- The free model still occasionally writes weak `reason` copy → the retry loop + prompt rules mitigate, but a paid model (A6 below) would raise the floor.
- Suggested gap stops are honest ("~estimate") but unverified — acceptable by design.

The original failure modes (from the research) that led to the fix:

- **Hallucinated places.** The model writes "Dunga Hill Camp" as if it's a verified business. Mindtrip built an 11M+ POI database precisely because *training-data venues hallucinate* — in the practical test, even Mindtrip suggested a Holiday Inn Express and an Intercontinental that don't exist. A free model will do far worse with Kenyan lodges.
- **Made-up prices and times.** `distanceKm`/`timeMins` are the model's guesses; there is no geometry. The itinerary's travel rows use `km/45` (a flat 45 km/h), which is fine as a fallback but not "intelligent".
- **Generic copy.** `summary`, `originNote`, `reason` are short AI sentences with the classic slop tells (vague, formulaic, no specifics, no source). The 1up "stop the slop" checklist is a direct fit: no real details, no sources, no specific numbers.
- **No grounding in the one asset KenyaTrace actually has** — its real listings database (seed + Firecrawl/http scraped rows with real names, prices, ratings, coordinates, images). The only grounding today is `enrichStops` on the *client*, which backfills missing coordinates after the fact by fuzzy-matching names to listings.

### 1.2 What the winners do instead (research)

| Tool | Anti-slop mechanism | Lesson for KenyaTrace | Status |
|---|---|---|---|
| **Mindtrip** | 11M+ POI database; AI recommends from real places; maps; booking links | Ground the AI in a real catalog; let AI **select and sequence**, never invent | ✅ Shipped (catalog-grounded planner) |
| **Google Gemini / AI Mode** | Answers grounded in Maps/Flights/Hotels live data **with citations** | Attach sources to every claim; live data beats memory | ✅ Partially — listing links + Verified chips; no per-claim citations yet |
| **Layla** | Live pricing (Skyscanner/Booking) + PriceLock | Real-time prices are the differentiator | 🟡 Partially — price-drop alerts on saved listings; no live price refresh in plans |
| **TripAdvisor AI Trip Builder** (UX teardown) | The critique: shallow interest grouping, no rationale for why things are on the same day, no distances/timing, same output for solo vs family | Show **why** each stop is on that day; factor in real distances, timing, traveler context; gather enough context before generating | 🟡 Partially — reasons + travel times exist; group size / with kids / dietary context not collected |
| **MonkeyTravel** | No-signup, three *meaningfully different* budget tiers | Budget tiers must change substance, not just restaurant price ranges; zero-friction start | 🟡 Partially — budget tiers shape substance; guest plan preview still missing |
| **perpet.io / VP0 / confidence-signal design** | "Honesty rule": AI renders as suggested/verified/booked; visible reasons; confidence signals; human-in-the-loop; progressive disclosure | Every stop carries a provenance state + reason + confidence; edits are scoped; reveal detail progressively | ✅ Largely shipped (Suggested/Verified + reasons + scoped day replan) |

### 1.3 The architectural shift — ✅ DONE

**From "model writes a plan" to "model curates a plan from real data":**

1. ✅ The client loads the real listings and sends a *candidate set* (filtered by budget tier, proximity to origin, vertical, interests) into the plan request.
2. ✅ The AI returns **references to real listings** (by id) plus optional human-authored gaps it can't fill.
3. ✅ The server merges the AI's selection with **real listing data** and computes **real travel times** (OSRM + haversine fallback) between stops.
4. ✅ Every stop gets a **provenance state**: `suggested` vs `verified`. (`booked` via reservation link is not yet rendered as a stop state.)

---

## Part 2 — Area-by-area restructuring

### A. The AI planning engine

**A1. Ground the plan in real data (RAG-lite).** ✅ Shipped.
- `candidates` in the plan request; prompt rules ("choose from these real places only, never invent"); merge in `resolveStops` with real name/price/coords/photo; `travelKm`/`travelMins` computed via OSRM with haversine fallback; `listingId`, `verified`, `source`, `image` per stop.
- Reuse in the itinerary editor's "Add a stop" search: the editor's search still queries `searchAll` independently — could be unified, but the catalog-grounded plan already covers the main path.

**A2. Compute, don't guess, travel reality.** ✅ Shipped (`lib/travel.ts` OSRM + fallback). Still not wired: a per-day **feasibility cap** (total travel + activity time vs a sane day length) — the prompt limits stops/day, but no hard server-side check.

**A3. Seasonality and dates.** ✅ Shipped (`lib/seasons.ts`, month picker, season guidance in the prompt). Improvement: persist the chosen travel month on the trip (`trips.travelDates`) so it survives the journey and feeds the trip brief automatically (currently derived from `startDate`).

**A4. Transparency & confidence (the honesty rule).** ✅ Shipped.
- Provenance chip (Suggested / Verified · our database), real rating/price, reason line, listing link.
- Still missing: explicit "travel time source" hint ("verified by routing" vs "estimate"), and a "Booked" stop state when a reservation exists for that stop.

**A5. Richer context before generating.** 🟡 Partially shipped. Traveler type, days, budget, interests, pace, travel month all collected. **Missing:** group size / with kids, dietary/accessibility notes (only the free-text "anything else" field covers this).

**A6. Model upgrades (optional but recommended).** ⏳ Not done. `JOURNEY_MODEL` is still the free Nemotron with JSON-parsing hacks and 4-retry convergence. A paid model (GPT-4o-mini-class, already used for captions) with `chatJSON` would eliminate JSON-parse fragility. With candidates grounded in real data, the model's job is easier now, so this is a quality/cost trade-off, not a correctness blocker.

### B. Plan journey UX (`guided-journey.tsx`)

- **Constraints-first composer.** 🟡 Partial — the where stage captures location/traveler/days/models; travel month sits in the budget stage. Group size/dietary not collected (see A5).
- **"Discover list first, then arrange"** (TripAdvisor's pattern that doubled save-rate). ⏳ **Not shipped** — generation still goes straight to the day plan. Highest-impact remaining plan-UX item.
- **Day timeline with real travel rows.** ✅ Shipped (OSRM travel rows on cards + editor).
- **Lock-and-replan.** ✅ Already excellent, kept. **"Swap this stop"** ⏳ not shipped (replace one verified stop from the catalog without regenerating).
- **Images on stops.** ✅ Shipped (real photos on plan cards).
- **Guest path.** 🟡 The Sample Trace dialog exists; **guest plan-stage preview** ("preview without saving") ⏳ not shipped.

### C. Discover (`discover-page.tsx`, `listing-detail.tsx`)

- **Trust signals everywhere** (`freeCancellation`/`instantConfirm` chips on cards). ⏳ Not shipped — chips only on the detail page.
- **Data freshness line** ("Updated Xh ago"). ⏳ Not shipped — the source badge exists but no freshness line.
- **Save to trip from a card** (one-click "Add to my trip"). ⏳ Not shipped — only the heart/save exists on cards.
- **Price alert / save for later.** ✅ Shipped (price-drop alerts in the Saved tab + listing notice).
- **Recommendation row from your profile** ("Based on your preferences"). ⏳ Not shipped — closes the loop with Profile.

### D. Trips & live tracking

- **The live trace is the hero feature and no longer a dead end.** ✅ Shipped — public trace page, share CTAs, SEO metadata.
- **Trip dashboard upgrades.** ✅ Trip brief (AI summary with seasonal tip) + stop check-off progress are both shipped on the trip page and track page.
- **Group comments/voting on stops.** ⏳ Not shipped (MonkeyTravel voting / Mindtrip collaboration). Convex shares already provide real-time collaboration; comments are the natural next layer.
- **Offline mode for the itinerary.** 🟡 Shipped as a **printable/PDF** itinerary (`Print / PDF` button); true offline caching (service worker / cached route map) not built.

### E. Moments

- **Make it a growth loop.** ✅ Shipped — every 3 media uploads = +1 free day of access, with visible progress.
- **Auto-caption + location** (existing `/api/caption`) + **auto stop-association** ✅ shipped + **auto "best of" recap** ✅ shipped (9-grid `/recap/[tripId]`).
- **Route trace embedded in the public moments page.** 🟡 Not done — the recap and trace are separate public pages; the moments page doesn't embed the trace map (would be a nice merge).

### F. Profile & personalization

- **Preferences pre-fill the planner.** ✅ Shipped (interests, pace, budget pre-fill a fresh journey).
- **Profile completeness → quality signal.** 🟡 The completeness bar exists; the "complete your profile to get sharper plans" nudge into the plan flow is **not wired**.

### G. Monetization UX

- **Value-first, not wall-first.** 🟡 Partially — the paywall now shows "What's waiting for you" (counts + next trip). A **plan preview behind the wall** is ⏳ not shipped.
- **"Continue where you left off."** ⏳ Not shipped — returning users land on the page's paywall; the draft/continue state isn't surfaced (the expired-trial skeleton bug from fix.md #1 is fixed, so the paywall reliably renders).

### H. Cross-cutting

- **AI-slop copy rules.** ✅ Shipped in the planner + brief prompts (specific checkable facts in every reason; no filler).
- **Performance & SEO.** ✅ Share pages now render server-side metadata (og tags, real trip data). Page-level client weight untouched.
- **Skeletons & empty states.** ✅ Consistent. Per-page "what you can do here" microcopy ⏳ not systematically added.
- **Analytics → product metrics.** ⏳ Not wired (see Part 5 for the metric set).

---

## Part 3 — Data model & schema changes (`convex/schema.ts`)

| Change | Why | Status |
|---|---|---|
| `tripStops.source` (`catalog`/`gap`) + `tripStops.listingId` | Provenance — the core honesty model | ✅ Shipped |
| `tripStops.travelKm` / `travelMins` | Real, precomputed travel rows | ✅ Shipped |
| `tripStops.image`, `vertical`, `unit` | Real plan cards + listing links | ✅ Shipped |
| `tripStops.completedAt` | Stop check-off progress | ✅ Shipped (Phase 3) |
| `trips.traceShareToken` | Shareable live trace | ✅ Shipped (Phase 3) |
| `trips.aiBrief` | Stored AI trip brief | ✅ Shipped (Phase 3) |
| `trips.travelDates` (month for seasonality) | Seasonal planning | 🟡 Not persisted — month is sent per request, derived from `startDate` in the brief |
| `users.momentsMediaTotal` / `momentsEarnedDays` | Uploads-earn-days credit | ✅ Shipped (Phase 4) |
| `savedListings.priceAtSave` | Price-drop alerts | ✅ Shipped (Phase 5; replaced the proposed `notifyOnPriceDrop` flag with automatic detection) |
| `positions` public/shareToken | Trace sharing | ✅ Reworked — token lives on `trips.traceShareToken`, positions stay private |
| `users.preferences` read in the planner | Personalization | ✅ Shipped |
| `listings` `openingHours`/`seasonal` metadata | Future grounding depth | ⏳ Not done |
| New `tripComments` table | Group collaboration | ⏳ Not done |

---

## Part 4 — Roadmap status (effort estimates from the original plan)

**Phase 1 — Kill the slop.** ✅ **Complete** — grounded planner (`candidates` → AI selects by id → server merges real data), provenance chips + reason-with-a-fact + listing links, OSRM travel times, slop rules in the prompt, cross-day dedup.

**Phase 2 — Make it feel intelligent.** 🟡 **Mostly complete** — preferences pre-fill, seasonal planning (dates + Kenya seasonality), images on plan cards, and the chosen travel month persisted on the trip so the trip brief reads it directly.
*Remaining: discover-list-then-arrange; swap-this-stop; group size/with kids/dietary fields; guest plan preview.*

**Phase 3 — Turn tracking into a hero.** ✅ **Complete** — public shareable live-trace page + arrival CTAs, stop check-off progress, AI trip brief.

**Phase 4 — Moments growth loop.** 🟡 **Mostly complete** — uploads earn free days, auto stop-association, shareable 9-grid recap.
*Remaining: group voting/comments on shared trips (optional).*

**Phase 5 — Monetization & polish.** 🟡 **Mostly complete** — value-first paywall context, price-drop alerts, printable/PDF itinerary, share-link SEO metadata, travel-source hints (routing vs estimate), and the Discover upgrades (recommendation row, trust chips, freshness line, add-to-trip from cards).
*Remaining: plan preview behind the wall; continue-where-you-left-off; per-page microcopy.*

### Phase 6 — Outstanding work (audit)

1. **Plan UX:** discovery-list-then-arrange; swap-this-stop; group-size/with-kids/dietary inputs.
2. **Guest plan-stage preview** (plan without saving) — MonkeyTravel's proven no-signup differentiator.
3. **Continue-where-you-left-off** on the paywall (returning users land back in their draft).
4. **Group comments/voting** on shared trips (optional).
5. **Offline itinerary**: true offline caching beyond the printable PDF (service worker or cached route map).
6. **Model upgrade** (A6): paid model with `chatJSON` for the plan endpoint to raise reason quality and kill the retry loop.
7. **Per-day feasibility cap** — total travel + activity time vs a sane day length, enforced server-side.
8. **Booked stop state** — render a "Booked" chip on stops that have a linked reservation (bookings rarely carry `stopId` today, so this is low value until reservation linking improves).
9. **Scraper pipeline verification** (fix.md #2): validation is fixed; the Firecrawl/http pipeline itself hasn't been run live end-to-end.
10. **Analytics → product metrics** (Part 5).

---

## Part 5 — Success metrics (from the research's cited numbers)

- **Itinerary save-rate** (TripAdvisor: discovery-list-then-arrange doubled saves; +10% satisfaction) — discovery-list-then-arrange is still unshipped, so this metric is the read on the #1 remaining UX bet.
- **Plan regeneration rate** (how often users re-plan a day — down = quality up).
- **Verified-stop share of plans** (target: most stops verified vs suggested).
- **Search-to-detail and detail-to-reserve conversion** on Discover.
- **Trips-per-user** and **moments-per-trip** (TourRadar: uploads correlate with retention) — the Phase 4 loop directly moves this.
- **Live-trace share rate** (uniqueness metric).
- **Trial→paid conversion** with the value-first paywall.

---

*Primary sources: Practical Globetrotters' hands-on test of Expedia/Mindtrip/Layla/ChatGPT; MonkeyTravel's 7-tool 2026 comparison; a UX researcher's teardown of TripAdvisor's AI Trip Builder; 1up's AI-slop style guide; confidence-signal/progressive-disclosure guides from the AI-product design community; Google's grounded AI travel features; plus the existing `restructure.md` research (VP0, perpet.io, To & Fro, TripIt, TourRadar, Mahalo).*
