# KenyaTrace — Restructure Plan V3

**Supersedes:** `AI-RESTRUCTURE-PLAN.md` (phases 1–5, shipped) and `RESTRUCTURE-V2-PLAN.md` (partially shipped in the working tree).
**Basis:** full codebase audit (Aug 2026) + competitive research (Airbnb 2025 relaunch, Mindtrip, Layla, Wanderlog, Tripnotes, Wonderplan) + Kenyan market research (M-Pesa/Cabana/TouristTap/BuuPass).
**Status of the working tree:** large amounts of V2 work are implemented but **uncommitted**. Commit before starting anything below.

---

## 1. Positioning — what the research says KenyaTrace is

KenyaTrace is not a booking site and should not pretend to be one. The research points at three defensible positions competitors are failing at simultaneously:

1. **Anti-hallucination planning.** Every 2026 comparison article flags that Mindtrip invents hotels and Layla misquotes prices. KenyaTrace's catalog-grounded planner (`/api/plan`: candidates-only selection, `resolveStops`, budget validators, origin-start guard, OSRM travel times with honest `travelRouted` flag) is *the* differentiator. Make it visible in the UI: every stop already carries verified/unverified state — surface it as a trust badge everywhere, not just in itinerary rows.
2. **The in-trip app.** Reviewers consistently say AI planners are "great for planning, awful during the trip." KenyaTrace's live tracking page (`/trips/[id]/track`), checklist (`trip-checklist.tsx`), tracker widget and consent-bound positions are already built for the road. Restructure so the app *changes mode* when the trip starts.
3. **M-Pesa-native KES monetization.** Paystack already gives M-Pesa rails; Cabana's research shows escrow + STK-push framing is what builds local trust, and TouristTap shows government appetite for cashless tourism. Keep prices in KES packs (`lib/plans.ts`), market them as "less than a matatu fare per day."

Growth loop already in the data model: plan → trip → moments → earned credit days (`moments.credit`) → more access. Restructuring should tighten this loop, not add new ones.

---

## 2. Current-state audit (what exists today)

| Surface | Files | State |
|---|---|---|
| Shell/nav | `app-shell.tsx` | 5 tabs: Plan `/`, Explore `/discover`, Trips `/trips`, Moments `/moments`, Profile `/profile`. Solid. Needs an "active trip" awareness (§4.1). |
| Planner wizard | `guided-journey.tsx` (~2,600 lines), `/api/plan` | Stages where→budget→plan→track→share. Catalog-grounded generation, replan-day, season guidance, geolocation, draft persistence, WhereYouStay alternatives. Strong; heavy single file. |
| Sample trace | `sample-trace.tsx` | Guest-facing read-only preview dialog. Good acquisition tool. |
| Discover | `discover-page.tsx`, `listing-detail.tsx` | Search/filters/verticals, freshness labels, add-to-trip from cards, saved places. Source filter removed per V2. |
| Trips list | `trips-page.tsx` | Filters + cards. Fine. |
| Trip detail | `trip-detail.tsx`, `itinerary-editor.tsx`, `trip-brief.tsx`, `trip-checklist.tsx`, `budget-dashboard.tsx`, `forward-booking.tsx`, `share-trip.tsx` | **Still the V2 "trip hub" problem:** hero has ~8–9 competing buttons plus tabs; everything lives on one page. This is the biggest remaining restructure. |
| Live tracking | `live-page.tsx`, `tracker-widget.tsx`, `tracking-provider.tsx`, `trace-view.tsx` | Share-to-track ingest, staleness chip, optimistic consent, draggable pinned card, public trace pages. Shipped. |
| Moments | `moments-page.tsx`, `moment-album.tsx`, `moments-share.tsx`, `recap-view.tsx` | Feed, albums w/ delete confirm, captions via `/api/caption`, recap pages, credit earning. Group voting/comments absent. |
| Monetization | `paywall.tsx`, `subscription-card.tsx`, `pay-now.tsx`, `/api/payments` | Trial 30d, packs 7d/KES 100 & 30d/KES 400, Paystack inline, purchase history, booking-level pay-now. |
| Email ingestion | `forward-booking.tsx`, `/api/parse-booking` | Regex-based parser + editable preview before save (TripIt pattern). Works; could graduate to AI parse behind the same preview step. |
| Invites | `share-trip.tsx`, `/api/send-invite` | Token links, editor/viewer roles, Resend email with hardened HTML/link base. |

**Design system in use (keep and codify):** DM Sans/Lora pairing, `font-serif` headings, `shadow-soft`, `kt-shimmer` skeletons, rounded-xl/2xl cards, kind color-coding (Stay blue · Transport amber · Experience emerald · Food rose), Progress bars for budgets, Dialog-first actions, sonner toasts, dashed empty states.

---

## 3. Principles for V3 (decide once, apply everywhere)

1. **One primary action per screen.** Derived from stage: planning → generate/refine; booked → checklist; on-trip → track; after → capture/share. Everything else collapses into an overflow menu.
2. **Day-by-day is the atomic unit.** Airbnb's 2025 Trips tab won by making *the day* the container for bookings, plans and messages. KenyaTrace already has day-grouped stops everywhere — promote days to navigation inside the trip hub.
3. **Honesty as UI.** Verified vs gap stops, OSRM vs estimate times, stale positions, freshness labels — never hide provenance. It's the brand.
4. **Plan mode ≠ trip mode.** The same trip page reorders itself around dates: upcoming → planning tools; active → checklist/track; past → recap/moments.
5. **Group-first where groups exist.** Tripnotes' lesson: polls and day-comments beat chat chaos. Collaborators already have roles — give them lightweight opinions (votes/comments), not another inbox.
6. **Mobile-in-sunlight first.** In-trip surfaces (checklist, track, album) get bigger touch targets, high contrast, offline tolerance.
7. **No new monetization models.** Packs + trial + credits only. Any new feature must map to one of: drive pack purchase, extend trials, or earn credits.

---

## 4. Per-page restructuring

### 4.1 Global shell (`app-shell.tsx`)
- **Active-trip chip.** When a trip's window includes today, show its name/date under the Trips tab label and deep-link the tab to that trip's hub instead of the list. (Airbnb "app that travels with you".)
- Add a global command entry point: the search affordance in the header routes to `/discover?q=…`.
- Keep 5 tabs. Do not add a sixth; Messages-style group coordination belongs inside the trip hub (§4.4).

### 4.2 Home / planner (`/`, `guided-journey.tsx`, `/api/plan`)
Functionality:
- **"Start from anything" (Mindtrip Start-Anywhere-lite):** optional paste-box in the `where` stage that accepts pasted text (a WhatsApp forward, a blog paragraph, a listing link). Client extracts candidate place names by matching the catalog (same scoring used elsewhere) and pre-seeds interests/destination hints. No new AI call required for v1 — pure catalog matching keeps the honesty guarantee.
- Persist `travelers` count from BudgetDashboard back onto the trip record (currently client-only state) so split-cost survives reloads.
- After a plan is saved, show the two next-step CTAs inline (Add a booking / Set up tracking) — currently these live only in the trip hub.

UI:
- Break `guided-journey.tsx` into per-stage files (`stages/where.tsx`, `budget.tsx`, …) sharing a context. No behavior change; the file is at the limit of maintainability (~2,600 lines).
- Stage progress indicator gets the trip name once a draft exists ("Planning: Mara weekend") instead of generic labels.

### 4.3 Discover (`discover-page.tsx`, verticals, `listing-detail.tsx`)
- **Trust chips on every card** (not just detail): verified price, freshness, distance-from-you when geolocation is on.
- Detail page gains a mini day-context picker: if the user has trips overlapping the listing's region, offer "Add to Day 3 of *Mara weekend*" directly (data already exists client-side via trips query).
- Add "near this stop" row on listing-detail when coordinates exist (reuse NEARBY_KM=40 logic from `where-you-stay.tsx`).
- Empty-search state suggests sample traces and popular towns instead of a bare "no results".

### 4.4 Trip hub (`trips/[id]`) — the big one
Replace the current hero-button-and-tabs layout with a **stage-aware hub**:

```
Header: name · dates · countdown/status chip (planning / starts in N d / day X of Y / completed)
Primary action (stage-based):
  planning → "Open itinerary editor"
  active   → "Go live" (/trips/[id]/track)
  past     → "View recap"
Row of secondary actions collapsed into overflow: share, invite, forward booking, export/print, settings
Body = segmented by stage:
  planning: Overview strip (budget bar, checklist progress, collaborator avatars) → Itinerary (day-by-day) → Bookings → Brief
  active:   Today card (today's stops + checklist) pinned first → rest identical but collapsed
  past:     Recap/moments strip first
```

Details:
- **Today card (new):** derived component — today's stops sorted by time, each with check-off, travel leg to next, and a "running late?" share-link button. This is the single highest-value addition for in-trip use (fixes the documented competitor weakness).
- Hero actions reduced from ~9 buttons to 1 primary + overflow menu (`MoreActionsMenu`). Nothing is deleted, only demoted.
- Tabs persist per-stage defaults via URL (`?tab=`) so back-navigation lands where the user was.
- Group alignment (Tripnotes pattern, cheap version): thumbs on any stop by collaborators + one comment thread per day. Store as `{stopVotes: {userId: 'up'|'down'}, dayNotes: {day: string}}` on trips or a small `tripComments` table. No realtime chat.
- Brief card stays; regenerate moves into the overflow menu (it's a maintenance action).

### 4.5 Live tracking (`trips/[id]/track`, `live-page.tsx`, `tracker-widget.tsx`)
- Already strong post-V2. Remaining:
  - **Offline tolerance:** cache last-known positions + today's stops in `localStorage`; render stale data with the existing staleness chip when Convex is unreachable.
  - Battery-honesty copy: state the actual update cadence next to the toggle ("updates every N min while open").
  - End-of-trip flow: when the last checklist item is checked or the end date passes, prompt "Turn this trip into a recap" (links moments/recap).

### 4.6 Moments (`moments-page.tsx`, `moment-album.tsx`)
- Album grid gets **reaction quick-taps** (❤️ from collaborators only — no public counters, keeps moderation simple) stored on moment docs.
- Caption regeneration stays owner-only; keep the existing visible-controls + delete-confirm hardening.
- Feed empty state offers "Import from your gallery" explainer (browser file input already supports multi-select — surface it in copy).

### 4.7 Recap & public pages (`recap-view.tsx`, `trace-view.tsx`, `/trace/[id]`)
- Add OG-image meta tags generated from the trip cover/moment (currently missing → links share blank on WhatsApp, which is *the* Kenyan sharing channel).
- Public trace page gains a "Plan mine like this" CTA that prefills the wizard with destination/days/budget-band (no account needed; lands on `/` with query params).

### 4.8 Profile (`profile-page.tsx`, `subscription-card.tsx`)
- Airbnb-style **travel snapshot** header: trips taken, places checked off, moments captured — all queries that already exist, composed into a stat strip.
- Subscription section unchanged (it's clean); move "earned days from moments" explanation into a tooltip to reduce clutter.

### 4.9 Payments (`paywall.tsx`, `pay-now.tsx`, `/api/*`)
- Copy pass: lead every price with the M-Pesa reality ("Pay with M-Pesa · KES 100"), since Paystack inline already renders mobile-money options for KES.
- Failed-payment recovery: when `verifyAndConfirm` returns unverified, queue a Resend email with the reference (support loop) — currently only a toast.

---

## 5. Workflow restructuring (cross-page)

The product has five loops. V3 wires them end-to-end:

1. **Inspire → Plan:** sample trace → wizard → save. *(exists)* + Start-anywhere paste (§4.2).
2. **Plan → Book:** discover/add-to-trip → forward-booking → pay-now. *(exists)* + day-context adding (§4.3).
3. **Book → Go:** booking check-ins feed the Today card; tracking setup offered right after first booking. *(new wiring, §4.4)*
4. **Go → Capture:** end-of-trip prompt pushes to moments; checklist completion rate shown in recap. *(§4.5, §4.6)*
5. **Capture → Grow:** credits shown at earn-time; recap/trace pages carry wizard-prefill CTAs; OG images make WhatsApp shares convert. *(§4.7)*

## 6. Functionality backlog (post-V3, in priority order)

1. AI-assisted `parse-booking` (keep regex fallback + mandatory preview-edit step — the guardrail is the feature).
2. Booking reminders via Resend (48h/24h before check-in) using existing bookings + cron-less scheduled send on page load (Convex `ctx.scheduler`).
3. Route optimization hint in the itinerary editor: flag days whose stop order is non-optimal per OSRM (compare sum-of-legs vs nearest-neighbor; suggest "Optimize day").
4. PWA manifest + install prompt aimed at the in-trip audience.
5. Export itinerary as PDF/image (print stylesheet is 80% of the work).

## 7. Phasing

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Housekeeping** | Commit working tree; tag current build; snapshot Lighthouse scores on /, /discover, /trips/[id] | clean `git status` |
| **1 — Trip hub** (§4.4 core) | Stage detection, primary-action hierarchy, overflow menu, URL-persisted tabs | hero ≤1 primary + 1 overflow; no dead buttons |
| **2 — Today card + offline-lite** (§4.4, §4.5) | Today card; localStorage cache for track/checklist | checklist usable in airplane mode |
| **3 — Planner split + start-anywhere v1** (§4.2) | File decomposition; paste-to-candidates | no regression in plan e2e flow; guided-journey <800 lines/file |
| **4 — Growth loop polish** (§4.7, §4.8, §4.9) | OG images, trace→wizard prefill, snapshot header, payment recovery email | WhatsApp-shared link renders card |
| **5 — Group layer** (§4.4 votes/day-notes, §4.6 reactions) | Schema addition + UI | collaborator can vote/comment; viewer cannot |
| **6+** | Backlog §6 | — |

Each phase ships behind nothing (single-tenant deploy), but must leave `npm run lint` + typecheck green and the affected flow manually walked (dev server: port 17000).

## 8. Guardrails — do NOT

- Do not introduce a chat/inbox product (group value comes from votes/notes; chat is a support tar pit).
- Do not add subscription tiers beyond the two packs; the one-time KES pricing is the wedge.
- Do not let AI write prices/names/coords anywhere new — every AI surface must stay catalog- or data-grounded with human preview before persistence.
- Do not rebuild discover as feeds/recommendations without keeping search+filters primary; discovery here is utilitarian (prices, availability), not inspiration-scrolling.
- Do not remove role checks when adding group features: viewer = read/vote only, editor = mutate, owner = destructive ops.
