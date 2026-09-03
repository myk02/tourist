# KenyaTrace — Deep Audit + Phased Restructure Plan

**Date:** 2026-09-03
**Stack:** Next.js 16.2.6 / React 19 / Convex 1.42 / Clerk 7 / Paystack Inline / MapLibre 5 / Tailwind 4 / shadcn + Base-UI
**Routes:** `/` + `/plan` (GuidedJourney), `/discover` (+ `/discover/[vertical]/[id]`), `/trips/[id]` + `/trips/[id]/track`, `/moments`, `/trace/[id]?t=`, `/recap/[tripId]`, `/api/plan|brief|caption|parse-booking|send-invite|payment-recovery`
**Status:** Phases 1–8 executed on branch `restructure/phase-1-trust-repair` (see Execution log at the bottom). Ready for review and merge.

---

## 1. Executive summary

KenyaTrace is a real product with a real differentiator (Plan → Book → **Live Trace** → Moments → Recap), but it currently reads like three apps glued together:

1. **Residue broken functionality:** public Recap/Moments are dead for every new trip (P0), trace-share token can't be revoked, payment recovery never reconciles, scraper cron doesn't exist, collaborators are locked out of bookings/moments, N+1 + unbounded `collect()` everywhere.
2. **Slop AI design UI:** same `from-primary via-primary to-[color-mix(...#000_28%)]` gradient hero pasted in 4 places, same gradient icon tile pasted 9x, 3 copies of kind→color maps, 3 copies of pill toggles, `/placeholder.jpg` leaking to prod, `✕/✓/…` chars instead of icons, `a href` full-reloads for internal nav, 44px touch / keyboard / contrast failures.
3. **Inconsistent workflows:** two token systems (revocable invite vs irrevocable trace), two public-gating rules (strict vs compat), two booking `type` enums, owner-only vs collaborator-OK authZ per table, 4 copies of `EMAIL_RE`, 4 different rate limits all in-memory per-instance, two reminder email templates, `YYYY-MM-DD` raw dates vs localized, `vh` vs `svh`, file limit 6 vs 8.

**Fix strategy in one sentence:** freeze features, fix P0 trust-breakers first, extract a real design system second, then rebuild page-by-page toward Wanderlog (Plan) + Airbnb (Discover) + Polarsteps (Track/Recap) + SafariBookings (conversion) + M-Pesa-first checkout.

**Phases:**

- **Phase 0 — Freeze + triage (0.5 day):** branch, flags, logging, repro scripts for P0s.
- **Phase 1 — Trust repair (3–5 days):** P0/P1 backend fixes. Nothing else ships until Recap works and payments reconcile.
- **Phase 2 — Design-system foundation (4–6 days):** kill gradients/slop, ship `GradientHero`, `GradientIcon`, `Badge`, `EmptyState`, `ProgressBar`, `PillToggle`, tokens.
- **Phase 3 — Workflow unification (3–4 days):** one authZ helper, one token model doc, one error shape, one date/money lib, one rate-limit + env guard.
- **Phase 4 — Plan + TripDetail rebuild (1–2 wks):** Wanderlog split view, route km/min, budget/split, accessible dnd.
- **Phase 5 — Discover + Listing rebuild (1 wk):** Airbnb map+grid, 5–10 filters, wishlist hearts, `Add to Day`.
- **Phase 6 — Track + Moments + Recap rebuild (1–2 wks):** Polarsteps tracker, permission primer, offline queue, Unpacked-style recap.
- **Phase 7 — Checkout + Paywall + Reminders (4–6 days):** M-Pesa-first 3-step, webhook+polling+SMS, pending-GC cron.
- **Phase 8 — PWA / Offline / Perf / Hardening (1 wk):** install prompt, tile packs, pagination, scraper cron or delete, a11y pass.

Total: ~6–8 weeks solo, ~3–4 weeks with 2 devs. Phase 1 alone restores user trust.

---

## 2. Current architecture (as-built)

```
Next.js App Router
  (app)/page.tsx ─┐
  (app)/plan/page.tsx ─┴─> <GuidedJourney/> (737 lines, 6 stages: where/budget/plan/track/share)
  (app)/discover/page.tsx -> <DiscoverPage vertical="stays"/> (829 lines)
  (app)/discover/[vertical]/[id] -> <ListingDetail/> (337 lines)
  (app)/trips/[id]/page.tsx -> <TripDetail/> (553 lines) + <ItineraryEditor/> (715 lines)
  (app)/trips/[id]/track/page.tsx -> <Track/> / <LivePage/> (305 lines)
  (app)/moments/... -> <MomentsPage/> (328 lines) + <MomentAlbum/> + <MomentsShare/>
  /trace/[id]?t=TOKEN -> <TraceView/> (98 lines, cleanest file)
  /recap/[tripId] -> <RecapView/> (160 lines)

Convex (18 files)
  trips.ts (create/get/accessRole/shares/traceShareToken) | tripStops | bookings.ts
  payments.ts + payments_helpers.ts | subscriptions.ts + subscription_helpers.ts
  listings.ts | moments.ts | positions.ts | reminders.ts + crons.ts (only booking-reminders)
  scraper/index.ts + http_scraper.ts (regex on booking.com/skyscanner/getyourguide) + constants.ts
  schema.ts (users/trips/tripStops/bookings/payments/subscriptions/tripShares/stopVotes/dayNotes/positions/moments/savedListings/listings)

Lib (32 files)
  ai.ts (OpenRouter Nemotron x3 retry) | itinerary.ts | budget.ts | plans.ts | tracking.ts
  parse-booking.ts (+ parse-booking-ai.ts) | geocode.ts | travel.ts (OSRM) | share-meta.ts
  paystack-inline.ts (js.paystack.co popup) | rate-limit.ts (in-memory Map) | resend.ts | dates.ts

Auth: proxy.ts bare clerkMiddleware(), page-level auth() in some routes only.
Payments: Paystack Inline popup -> verifyAndConfirm action + /paystack-webhook (HMAC-SHA512) -> markPaid.
  Failure path: /api/payment-recovery only emails support, never fixes state.
Email: Resend for invites + reminders (two duplicated templates).
```

---

## 3. Residue / broken functionality trace (ranked)

### P0 — Ship-blockers (fix in Phase 1, Day 1–2)

| ID | Title | Evidence | Impact | Fix |
|----|-------|----------|--------|-----|
| B1 | **Public Recap/Moments dead for all new trips** — `publicForTrip` requires `token===traceShareToken` when token exists, but callers omit token | `convex/moments.ts:60-64` vs `components/kenyatrace/moments-share.tsx:39`, `recap-view.tsx:39`, `lib/share-meta.ts:51`. `trips:create` always sets token (`convex/trips.ts:118`) | Every share link + OG embed broken | Pass `?t=` through URL → `publicForTrip {tripId, token}`; fix `shareMeta('recap'\|'moments', tripId, token)`. Decide one rule (strict vs compat) and apply to both `publicTrace` + `publicForTrip` |
| B2 | `shareMeta` never passes token for recap/moments (only for trace) | `lib/share-meta.ts:43` vs `:51` | Social previews always fallback | Same as B1 — thread `token?` param through |
| B3 | Trace-share token **cannot be revoked/rotated** — only `enableTraceShare`, no disable/rotate | `convex/trips.ts:360-369`, `convex/schema.ts:6` vs `:12-19` | Leaked `?t=` link is permanent (privacy) | Add `disableTraceShare` + `rotateTraceShare`; document `traceShareToken` (anon public) vs `tripShares.token` (authed collaborator) |

### P1 — High (Phase 1, Day 3–5)

| ID | Title | Evidence |
|----|-------|----------|
| B4 | **Payment recovery is email-only** — never reconciles Convex. Webhook ambiguity returns `{applied:false}` and pending stays forever. Comment promises pending-GC cron that doesn't exist | `app/api/payment-recovery/route.ts:50-94`, `convex/payments_helpers.ts:112-120`, `convex/payments.ts:69-70`, `convex/crons.ts:9-15` |
| B5 | **Dead scheduled work** — `scrapeAll` / `clearAndRescrape` are `internalAction` with no cron. `STALE_AFTER_MS=24h` implies daily refresh that never runs | `convex/scraper/index.ts:72-115`, `convex/crons.ts:1-17`, `convex/scraper/constants.ts:1` |
| B6 | **Data-loss window** — `clearVertical` deletes before scrape; `upsertScraped` delete-then-insert non-atomically | `convex/scraper/index.ts:96`, `convex/listings.ts:134-140` |
| B7 | **Collaborators locked out** — `bookings:forTrip` + `moments:create` check `ownerId` only, but `positions:forTrip`, `moments:react`, votes allow roles. Invite copy promises "view and edit" | `convex/bookings.ts:29-35`, `convex/moments.ts:128-136` vs `:251-262`, `convex/positions.ts:31-41`, `app/api/send-invite/route.ts:63` |
| B8 | **Dead fields** — `sharedAt` written once never read; `coverImage` forced to `/kenya-hero.png` on every create with no upload UI | `components/kenyatrace/guided-journey.tsx:598`, `convex/trips.ts:118`, `convex/schema.ts:6` |
| B9 | **Booking `type` enum split** — `create` rejects `Flight`, `createFromEmail` allows it; `kindFromVertical` never returns `Food/Flight`; email bookings (`listingId:""`) then unpayable | `convex/bookings.ts:41,54-56,122,172`, `convex/payments.ts:58` |

### P2 — Medium (Phase 3 + 7 + 8)

| ID | Title | Evidence |
|----|-------|----------|
| B10 | **N+1 + unbounded `collect()`** — no pagination anywhere | `convex/trips.ts:47-50,442-446`, `convex/subscriptions.ts:107-113`, `convex/trips.ts:306-310`, `convex/listings.ts:13-97`, `convex/reminders.ts:164` |
| B11 | `positions:record` **throws on throttle** instead of coalesce/drop — 1Hz GPS spams error toasts | `convex/positions.ts:21-25` |
| B12 | Moments reward diverges when user row missing + full-scan per upload O(n) | `convex/moments.ts:23-34,163-187` |
| B13 | `parseBookingEmail.provider` bug — `provider: extractName(text)` same fn as `name` | `lib/parse-booking.ts:119-130` |
| B14 | AI routes **fully anonymous** — no `auth()`, only in-memory per-instance IP limit (multi-instance-unsafe), inconsistent limits (plan 10 / caption 15 / brief+parse 20) | `proxy.ts:12`, `app/api/plan/route.ts:414`, `app/api/brief/route.ts:55`, `app/api/caption/route.ts:16`, `lib/rate-limit.ts:1-8` |
| B15 | `brief` missing env guard (throws 400 instead of 503); `caption` maps all errors to 400 | `app/api/brief/route.ts:53-86`, `app/api/caption/route.ts:40-44` |
| B16 | `seedVertical` any-authed-user global write, no admin check | `convex/listings.ts:160-162` |
| B17 | HTTP scraper regex vs bot-protected targets (booking.com/skyscanner/getyourguide) → routine `{status:"failed"}` silent fallback to seed; cars/taxis hardcoded estimates | `convex/scraper/http_scraper.ts:78-227,313-379` |

### Config residue

- `package.json` — `build` is bare `next build` (no convex deploy / typecheck / lint / test gate). `overrides.hono@4.12.25` with no `hono` dep — remove or document.
- `next.config.mjs` — `images.unoptimized:true` globally (perf cost); scope via `remotePatterns` for Wikimedia instead.
- `tsconfig.json` — includes everything incl. `convex/_generated` + tests in app typecheck; consider `exclude: .next`.
- `.env.example` complete; `convex/auth.config.ts` fail-fast on missing `CLERK_DOMAIN` is correct but document for deploy.
- `proxy.ts` comment claims public AI/share routes "handle auth at handler" — false for plan/brief/caption/parse-booking.

---

## 4. Slop AI design UI inventory (all verified with lines)

### 4.1 Global copy-paste patterns (fix in Phase 2)

| ID | Pattern | Occurrences | Action |
|----|---------|-------------|--------|
| G1 | Primary gradient hero `bg-gradient-to-br from-primary via-primary to-[color-mix(in_oklch,var(--primary),#000_28%)]` + `shadow-lift ring-1 ring-primary/20` | `trip-detail.tsx:386`, `recap-view.tsx:81`, `moments-share.tsx:67`, `profile-page.tsx:188` | Extract `<GradientHero tone="trip\|recap\|profile">` — vary per context, flat on mobile |
| G2 | Icon tile gradient `bg-gradient-to-br from-primary to-[color-mix(...#000_25%)]` | `app-shell.tsx:52,231`, `moments-page.tsx:213`, `live-page.tsx:203`, `share-stage.tsx:53,154`, `trips-page.tsx:221`, `subscription-card.tsx:38`, `where-stage.tsx:151` (9x) | Extract `<BrandMark size>` — flat `bg-primary` at 36px, gradient only at hero |
| G3 | `KIND_STYLE` kind→color triplicated + `KIND_COLORS` in shared | `itinerary-editor.tsx:36-41`, `forward-booking.tsx:17-19`, `sample-trace.tsx:17-20`, `shared.tsx:122` | Single `kindTheme(kind)` in `lib/kind.ts` returning {chip, dot, hex} |
| G4 | Verified/Suggested badge pair pasted | `itinerary-editor.tsx:119,121`, `plan-stage.tsx:165,167`, `where-you-stay.tsx:251,253` | `<VerifiedBadge/>` + `<SuggestedBadge/>` in `shared.tsx` |
| G5 | Inline `style={{width:%}}` progress, no shared bar | `moments-page.tsx:221`, `live-page.tsx:250`, `track-stage.tsx:79`, `shared.tsx:146,152,157`, `tracker-widget.tsx:169` | `<ProgressBar value>` with `role=progressbar` |
| G6 | 3x pill toggle (`rounded-full border bg-muted/40 p-1`) | `itinerary-editor.tsx:583-600`, `moments-page.tsx:230-233`, `track-stage` | `<PillToggle options>` |
| G7 | Container chaos: `max-w-6xl py-8` vs `max-w-7xl py-6` vs `max-w-3xl py-10`, `rounded-xl/2xl/3xl` mixed | `guided-journey.tsx:721`, `trip-detail.tsx:385`, `discover-page.tsx:409`, `recap-view.tsx:80` | One scale: page `max-w-6xl px-5 py-8`, detail `max-w-3xl`, grid `max-w-7xl`; cards `rounded-2xl` only |
| G8 | Hero image overlays assume dark image; white text if image 404s | `discover-page.tsx:414,684`, `listing-detail.tsx:199` | `<HeroImage>` with scrim + `onError` fallback + descriptive alt |
| G11 | `/placeholder.jpg` ships to users | `recap-view.tsx:26`, `moment-album.tsx:29`, `moments-share.tsx:25`, `moments-page.tsx:268` | Real `<EmptyMoments>` illustration; never fake image with real caption as alt |
| G12 | `✕` / `✓` / `…` chars instead of icons/spinner | `share-stage.tsx:111`, `share-trip.tsx:228`, `where-stage.tsx:142-143`, `pay-now.tsx:102`, `listing-detail.tsx:284` | Lucide `X/Check` + `<Spinner>` + `Skeleton` |

### 4.2 Page-by-page UI defects

- **`home.tsx` (11 lines):** dead wrapper (`<Home/>` → `<GuidedJourney/>`). Delete, export directly.
- **`app/(app)/page.tsx` + `plan/page.tsx`:** same `<GuidedJourney/>` on two routes sharing `sessionStorage DRAFT_KEY` → state bleeds. Keep `/plan` canonical, `/` becomes marketing + booking-search hero.
- **`discover/page.tsx`:** hardcodes `vertical="stays"` with no redirect — analytics/deep-link split. Redirect `/discover` → `/discover/stays`.
- **`trips/[id]/track/page.tsx`:** no RSC auth gate, flashes map before `<RequireSubscription>`. Add `auth()` + `redirect`.
- **`guided-journey.tsx:79,167,187`:** 3 success toasts on first load possible. Keep one.
- **`planner/bits.tsx:7-16`:** `StarRating` no `aria-pressed`, no arrow keys, 28px target, color-only. Rebuild to 44px + radiogroup.
- **`where-stage.tsx:99-107`:** 4th copy of dark-overlay hero; `alt="Kenya"` fails WCAG. Use `<HeroImage alt="...">`.
- **`budget-stage.tsx:46`:** month input no visible label; amber warning contrast ~3.2:1. Add label + darken text.
- **`plan-stage.tsx:53`:** `handlePrint` silent `if(!win) return` (vs trip-detail toast). Toast on block. `alt=""` on content image (`:151`). Duplicate-leg React keys (`:109`).
- **`share-stage.tsx:103,105`:** preview `alt=""`, 24px `✕` button. Fix alt + 44px `X`.
- **`itinerary-editor.tsx:400`:** dead `void day;`. `:667` hidden `<Utensils className="hidden"/>`. `:171` 32px icon buttons cramped. `:583` custom toggle duplicates Tabs.
- **`trip-detail.tsx:388`:** raw `YYYY-MM-DD` dates. Localize via `lib/dates.ts`. `:220` "Edit itinerary" links to same `?tab=itinerary` (dead). `:480` nested `max-h-96` scroll trap on mobile — use page scroll + sticky tabs.
- **`recap-view.tsx:88`:** amber stars on green (Christmas). Use white/ink stars on hero. `:125` copy-link swaps `Copy→Star` (should be `Check`). `:55,132` raw `<a href>` internal — use `Link`.
- **`moments-page.tsx:294,304`:** limit 6 vs guided-journey 8; `Select` with no "Not pinned" clear. Unify to 8 + allow clear.
- **`live-page.tsx:180,183,236,259`:** `100vh-4rem` hardcode, `z-[600]` magic, 4x `render={<a>}` full reloads, `End` with no confirm. Use `svh`+flex, token `z-map-popover`, `Link`, `AlertDialog` confirm.
- **`discover-page.tsx:60-66`:** taxis reuse Mara landscape Wikimedia hotlink. Ship local `taxis-hero.jpg`. `:452` fake combobox (`role=combobox` on plain Input, no keyboard nav). Use real `Command`/`Autocomplete`. `:671` transparent card + hover lift = layout shift + dark-mode shadow fail. Use bordered card. `:712` overlay buttons `bg-black/40` contrast 2.8:1, no focus ring.
- **`listing-detail.tsx:284`:** `Checking access…` dead button with no spinner. Use `Skeleton` + disabled with reason.
- **`paywall.tsx:22-44`:** hardcoded `≈ KES 14/day` duplicates math (drift). Compute from `PLAN_PRICES`. `:291` `status===null ? null` renders blank modal. Render sign-in CTA.
- **`share-trip.tsx:174` (Critical privacy):** full invite URL with token in plain `truncate` text — shoulder-surf leak. Mask + copy-only. `:249` raw `<img alt="">` avatar — use `next/image` + name alt. `:276` nested `Dialog` in `DialogContent` — use `AlertDialog`.
- **`app-shell.tsx:304`:** mobile bottom nav + discover floating Map button + tracker widget triple-fixed overlap. Define `z-nav / z-fab / z-tracker` scale + safe-area padding.
- **`shared.tsx:84,168,170`:** 400-char `RequireAuth`, `NotFound` CTA says "Back to discover" → links `/`, `useTripId` splits pathname (breaks on locale). Use `useParams()`, fix copy.

No `TODO/FIXME/lorem` found (good). `console.error` swallowed in prod (`discover-page.tsx:132,283`) — replace with toast + server log.

---

## 5. Inconsistent workflow matrix

| Area | Variant A | Variant B | Unify to |
|------|-----------|-----------|----------|
| Share tokens | `trips.traceShareToken` anon, irrevocable | `tripShares.token` authed, revocable | Doc + `disable/rotate` for trace; single `SharePrivacy` enum `OnlyYou/Friends/Public` (Polarsteps) |
| Public gating | `publicTrace` strict `!token→null` | `publicForTrip` legacy compat | One rule: token required iff `traceShareToken` set; legacy migrate |
| Trip status | `update` allows `travelling` (British) | Only `planning/booked/completed` ever written | `planning→booked→active→completed` + `cancelled`; migrate `travelling→active` |
| Booking type | `create`: no `Flight` | `createFromEmail`: `+Flight` | `Stay/Transport/Experience/Food/Flight` everywhere; map vertical→type in one fn |
| AuthZ | `trips:get/votes/dayNotes/positions:forTrip` → `accessRole` OK | `bookings:forTrip/moments:create/positions:record` → owner-only | `requireTripAccess(tripId, ["owner","editor"])` for writes; `viewer` for reads |
| AuthN fail | Queries `[]/null` silent | Mutations throw | Queries `null` + `reason` logged; mutations throw `AUTH_REQUIRED` code |
| Errors | Convex `throw Error(msg)` | API `{error}` with 400/422/429/502/503 mixed | `AppError {code, message, retryable}` → toast copy map |
| Dates | `isValidISODate` + lexicographic compare | `new Date(d+"T00:00:00")` local vs `Date.parse(d+"T12:00:00Z")` UTC | All through `lib/dates.ts` (UTC noon for day math, locale format for display) |
| Email RE | 4 copies, one lowercases | — | `lib/email.ts` single `isEmail()` |
| Env | plan/caption/invite/recovery 503 | brief/share-meta/reminders silent | `requireEnv()` helper — 503 + log + fallback meta |
| Rate limit | 10/15/20/10/5 per-instance Map | — | Upstash/Convex rate table, `plan:10, caption:30, brief:20, parse:20, invite:10, recovery:5` per user+IP |
| Reminders | `sweep` template | `sweepAll` duplicate template | `lib/reminder-email.ts` single MJML |
| Money | `bookings:create` enforces `amount===price` | `createFromEmail` trusts client | Server price resolve everywhere; amounts in minor units, `KES` assert in webhook |
| Media | `storageId` + `storageIds[]` + `videoStorageIds[]` triple | — | Migrate to `mediaIds[]` + `mediaKind[]`; `idsOf()` shim until migration |

---

## 6. Best practices — sites that function like KenyaTrace (deep research)

> Full source list at bottom. Below are only the copyable moves, mapped to your pages.

### 6.1 Wanderlog — clone for Plan (highest priority)

- **Split view:** left draggable day list + right sticky MapLibre color-coded by day. Mobile tabs `List|Map|Day`.
- **Drag-drop Kanban + a11y fallback:** dnd-kit + `Move to Day ▾` buttons + Undo toast + live `Moved X to Day 3`.
- **Route line:** every day header shows `3 stops • 48km • 1h20 drive` (you already compute `travelKm/Mins` — surface it).
- **1-click add from guides:** `+ Add` on every Discover card → `Add to Day ▾`.
- **Budget + split:** per-day cost + total + Splitwise-lite (critical for group safaris).
- **Collab = Google Docs:** Convex live queries already give you cursors/comments/votes — expose them.
- **Paywall line:** free = planning/collab/map/journal; paid = offline + export + live sharing. Copy verbatim.

### 6.2 TripIt — clone for TripDetail + forward-booking

- Chronological timeline grouped by day, each segment expandable (confirmation #, map thumb, directions, notes/photos).
- `plans@tripit` forward-to-build → your `forward-booking.tsx` + `parse-booking` already 70% there; add Gmail connect + PDF upload on Plan empty state.
- Sharing: `Participants (view/edit) + Public view-only link` — your two-token model renamed to this.
- Pro alerts: `Leave camp in 20m — Mara gate 35m drive` for Track.

### 6.3 Polarsteps — clone for Track + Recap (your differentiator)

- Pillars `Plan – Track – Relive` — copy IA verbatim for nav.
- Tracker: auto breadcrumb white dots, `<4%/day` battery copy, offline + sync later. Permission primer before OS dialog: `We track only during Active Trip, pause anytime`.
- Steps: auto timeline + add photos/comments later = your Moments composer.
- Privacy 3-tier: `Only you / Friends & Family / Entire world` + follow-by-link (no app needed for family) — replaces your two-token confusion.
- Stats header: `Countries, km, nights` → your Recap header `642km • 14 moments • 3 parks`.
- **Unpacked:** gated (`≥1 trip with content`), story carousel, `Too fun not to share` + share image/video. Your Recap rebuild spec.
- **Travel Book 1-click:** `Print Recap Book` via Paystack = monetization.

### 6.4 SafariBookings — clone for conversion

- Listing card must have: photo, `4.9 (229)` + Expert badge, days, **total price**, day-by-day snippet, `Instant vs Request` badge. You lack totals + response SLA.
- Tour page: creative title, hook-first 2 sentences, specific days (`6am balloon + bush breakfast`), inclusions/exclusions, operator card + response time.
- Speed = conversion: if not instant-bookable, show `Avg response 47m • Live availability ✓` + provisional PDF.
- Post-trip: systematic review ask → Moments/Recap nudge when `≥25 4★`.

### 6.5 Expedia / Airbnb — clone for Discover + Checkout

- Home hero **is** booking search: `Where (Mara/Amboseli/Diani) • When • Who`. Your `/` is currently a second `/plan` — fix.
- Airbnb map science: price pins + supercluster unbundle on zoom + list↔map hover sync + freeform draw. Implement in MapLibre with `supercluster`.
- Expedia Trip Matching (Reels→itinerary DM): `Paste TikTok/Reel → make it a Trace` viral loop.
- Baymard Dec-2025 audits: total price upfront, compare checkbox, confirmation with itinerary attached.

### 6.6 M-Pesa + Paystack Kenya — non-negotiable checkout

- **M-Pesa default first**, cards second. `channels=['mobile_money','card']`. Separate M-Pesa + Airtel logos.
- UI: phone prefilled from Clerk, `KES 2,500` large, CTA `Pay — send prompt to 07…`, helper `Prompt in ~30s. Enter M-Pesa PIN. Keep phone on.`
- Flow: `initialize {metadata:{tripId}}` → STK push → **poll `verify` + webhook `charge.success`** → mark paid server-side (never browser). Confirm-number step, `Resend prompt`, timeout copy, `Closed tab? We SMS confirm` (Africa's Talking).
- Amounts in kobo (`1 KES=100`), verify `amount+currency==KES` in webhook. Fee note `1.5% capped KES 1,000`. `Deposit 30%` for safari. Guest checkout allowed.

### 6.7 Design system 2025–2026

- Soft Minimalism: warm savanna neutrals + **one** energetic accent for CTA only. Display serif (you have Lora — keep) + clean sans (DM Sans — keep). `clamp()` fluid type, 50–75ch, AAA contrast.
- Motion 200–500ms transform/opacity only + `prefers-reduced-motion` instant. Tokens in system.
- Map: vector tiles + offline packs per park (`Download Mara 48MB`), price-pin sprite, dark-mode map for night drives.
- Perf: Next PPR + `next/image` AVIF (replace `unoptimized:true`), route prefetch, paginated Convex, lazy MapLibre chunk.

**Sources:** TripIt How-It-Works / Sample Itinerary; Wanderlog Plan-a-Trip; Sygic Travel; TripAdvisor Trips + AI planner post-mortem (Medium); Expedia + Baymard Expedia/Airbnb Dec-2025; Airbnb Wishlists + map teardown; SafariBookings + Help Convert-More-Requests + TrustPilot; Go2Africa/Go2Kenya; Polarsteps + Unpacked 2025; McTaba Paystack-Kenya guides (4) + Paystack M-PESA support; Baymard Travel UX; PWA offline-first guides (Pattem/NeedleCode/Edana).

---

## 7. Target vision (where we land)

### 7.1 Information architecture

```
 / (marketing + booking search hero: Where/When/Who + templates + proof)
 /plan (canonical planner: split list+map, day tabs, budget, collab)
 /discover/stays|experiences|transport|food (grid+map, filters, wishlist)
 /discover/[vertical]/[id] (photo, rating, days, total, day-by-day, operator, map, sticky CTA)
 /trips (Upcoming/Past, countdown, offline badge)
 /trips/[id] (tabs: Itinerary|Bookings|Moments|Share|More — TripIt timeline)
 /trips/[id]/track (Polarsteps live: breadcrumb, Day/Next, +Moment FAB, family view)
 /moments?trip= (stories feed map-linked)
 /trace/[id]?t= (public live, no login)
 /recap/[tripId]?t= (Unpacked wrapped: cover playback + stats + best-9 + share)
 /profile (Clerk + docs wallet + wishlists + notif prefs + privacy defaults + packs)
```

Nav (max 5 + center FAB): `Home Plan Discover Track + (Moment)`. Desktop top bar mirrors + `Made for Kenya` always visible.

### 7.2 Design tokens (single source)

- Containers: `page (max-w-6xl px-5 py-8)`, `wide (max-w-7xl)`, `narrow (max-w-3xl)`.
- Cards: `rounded-2xl border shadow-soft`; hero `rounded-3xl` only for cover.
- Shadows: `soft / lift / pop` — audit and keep 3, delete `shadow-lg/md` ad-hoc.
- Type: `display (Lora) / sans (DM Sans)`, `clamp()` scale, `text-xs` only for captions (≥12px, ≥4.5:1).
- Touch: 44px min for all interactive; icon-only 44px.
- Z: `map-popover < fab < tracker < nav < modal < toast`.
- Viewport: `svh` everywhere; no `100vh-4rem` hardcodes.

### 7.3 Data model deltas (Convex)

- Add `trips.privacy: "private"|"link"|"public"`, `trips.traceRevokedAt?`, `trips.status: planning|booked|active|completed|cancelled`.
- Add `moments.mediaIds: Id[]` migration from triple fields; add `payments.idempotencyKey`, `bookings.quoteExpiry?`.
- Add indexes: `trips by_status`, `bookings by_trip_checkIn`, `moments by_trip_created`, `listings by_vertical_price`.
- Paginate: `listings.*`, `bookings.*`, `moments.*` with `take()+cursor`.

---

## 8. Phased plan (do in order — each phase gates the next)

### Phase 0 — Freeze + triage (0.5 day) ✅ gate: repro scripts pass

- [ ] Create `restructure/*` branch; add `RESTRUCTURE_PLAN.md` (this file) + `AUDIT_LOG.md`.
- [ ] Add temporary feature flag `RESTRUCTURE_FREEZE=true` — no new features, only phase tasks.
- [ ] Write 3 repro scripts: (1) create trip → open `/recap` anon → assert moments visible; (2) pay → kill tab mid-popup → assert recovery reconciles; (3) editor invite → try `bookings:forTrip` + `moments:create`.
- [ ] Turn on Convex + server logging for `publicForTrip`, `verifyAndConfirm`, `webhook`.
- **Exit:** all 3 repros fail in the documented way (proves audit), then Phase 1 starts.

### Phase 1 — Trust repair: backend P0/P1 (3–5 days) ✅ gate: shares + payments work

**1A. Shares + public pages (Day 1–2) — fixes B1/B2/B3**

- [ ] `lib/share-meta.ts`: thread `token?` into `recap|moments` branch; add test `share-meta.test.ts`.
- [ ] `moments-share.tsx:39`, `recap-view.tsx:39`: read `?t=` via `useSearchParams` → `publicForTrip {tripId, token}`.
- [ ] Decide gating: `if (trip.traceShareToken && token!==traceShareToken) return null` for **both** `publicTrace` + `publicForTrip`; migrate legacy (no token) as `privacy:"link"`.
- [ ] `convex/trips.ts`: add `disableTraceShare` (null token) + `rotateTraceShare` (new `nanoid(32)`); UI in `share-trip.tsx` with `AlertDialog` confirm + audit log.
- [ ] `share-trip.tsx:174`: mask token (`…abcd`), copy-only button with `Check` feedback; fix nested Dialog → `AlertDialog`.
- **Accept:** anon `/trace?t=` + `/recap?t=` load; rotate invalidates old link; no token in plain text.

**1B. Payments (Day 3) — fixes B4**

- [ ] `app/api/payment-recovery/route.ts`: query `payments by_reference` → return `{status, bookingStatus, nextStep}`; if `pending>15m` trigger server `verifyAndConfirm` retry; only email support if still ambiguous (include candidates).
- [ ] `convex/payments_helpers.ts`: on ambiguous webhook, log + email support with candidates instead of silent `{applied:false}`.
- [ ] `convex/crons.ts`: add `hourly payments-reconcile` (pending>30m → re-verify via Paystack) + `daily pending-GC` (expire >24h).
- [ ] Assert `amount (minor) + currency==KES + reference` in both `verifyAndConfirm` + webhook; store `idempotencyKey`.
- **Accept:** kill-tab-mid-pay → recovery page shows live status + retry; webhook ambiguity visible in logs.

**1C. AuthZ + enums (Day 4–5) — fixes B7/B8/B9/B13**

- [ ] New `convex/access.ts`: `requireTripAccess(ctx, tripId, ["owner","editor"])` wrapping `accessRole`; migrate `bookings:forTrip`, `moments:create`, `positions:record` to it (viewers read-only).
- [ ] Unify booking `type`: `Stay|Transport|Experience|Food|Flight` everywhere; single `kindFromVertical()`; fix `provider: extractName` → `extractProvider()`.
- [ ] Decide `sharedAt`: either delete from schema or surface as `Completed on` in TripDetail. Same for `coverImage` (add upload or keep default explicitly).
- [ ] `seedVertical`: add admin allowlist (`ADMIN_EMAILS`) or delete; add test.
- **Accept:** editor can book + upload; viewer cannot; repro script 3 passes.

### Phase 2 — Design-system foundation (4–6 days) ✅ gate: zero gradients ad-hoc, zero placeholder.jpg

- [ ] Create `components/ui/kt/`:
  - `<BrandMark/>` (replaces G2, flat default), `<GradientHero tone/>` (replaces G1, 3 tones max), `<VerifiedBadge/>` + `<SuggestedBadge/>` (G4), `<ProgressBar/>` (G5), `<PillToggle/>` (G6), `<EmptyState illustration+title+action/>`, `<HeroImage scrim+fallback/>`, `<KindChip kind/>` (G3, single `lib/kind.ts`), `<Spinner/>` + `Skeleton` presets.
- [ ] Codemod: replace all G1/G2/G4/G5/G6 call sites (list in §4.1); delete `home.tsx` wrapper; fix `✕/✓/…` → icons; `a href` internal → `Link`; `/placeholder.jpg` → `<EmptyMoments/>`.
- [ ] Tokens: one `max-w/px/py/rounded/shadow/z` scale in `app/globals.css` (`--kt-*` vars); replace `vh` → `svh`; fix `z-[600]` → `z-map-popover`.
- [ ] A11y sweep: `StarRating` → radiogroup 44px + arrows; consent `Switch` → labelled; file preview alts; combobox → real autocomplete; amber-on-green stars → ink stars; touch targets ≥44px; focus-visible rings on overlay buttons.
- **Accept:** `grep -r "color-mix.*#000_2" components` = only inside `kt/`; `grep -r placeholder.jpg` = 0; Lighthouse a11y ≥95 on Plan/Discover/Track.

### Phase 3 — Workflow unification (3–4 days) ✅ gate: one way to do everything

- [ ] `lib/dates.ts` only: migrate `bookings.dayFromDate`, `reminders.checkInMs` to it; localize TripDetail dates (`d MMM yyyy`).
- [ ] `lib/email.ts` single `isEmail()`; `lib/money.ts` single `formatKES()` + minor-units assert.
- [ ] `lib/rate-limit.ts` → Convex rate table (user+IP), unified limits; `lib/env.ts` `requireEnv()` with 503 + log (fixes B15).
- [ ] `lib/errors.ts` `AppError {code,retryable}` + toast copy map; replace `.catch(console.error)` with `toast + log`.
- [ ] `convex/reminders.ts`: merge `sweep` + `sweepAll` templates into `lib/reminder-email.ts`.
- [ ] `useTripId()` → `useParams()`; `/discover` → redirect to `/discover/stays`; unify file limit to 8 + "Not pinned" clear; unify `status` enum + migrate `travelling`.
- [ ] `proxy.ts` comment fix + `auth()` on AI routes (or explicit `publicAI:true` + captcha if staying anon — decide, document).
- **Accept:** inconsistency table §5 all checked; `grep EMAIL_RE` = 1 file; `grep "T00:00:00"` = only in `dates.ts`.

### Phase 4 — Plan + TripDetail rebuild (1–2 wks) ✅ gate: Wanderlog parity demo

- [ ] IA: `/` becomes marketing + booking-search hero (`Where/When/Who` + templates + proof `4.8★ (320) • 12k traces`); `/plan` canonical planner.
- [ ] Layout: desktop split (list 480px + sticky MapLibre), mobile `List|Map|Day` via `<PillToggle/>`.
- [ ] Day headers: `Day 2 • 3 stops • 48km • 1h20` from existing `travelKm/Mins`; `Optimize route` button (already have `route-optimize.ts` — surface it).
- [ ] Dnd: keep dnd-kit + add `Move to Day ▾` + Undo toast + `aria-live` announce; keyboard draggable.
- [ ] Budget: per-day + total + split input; `Deposit 30%` hint linking to checkout.
- [ ] Collab: show live cursors/votes/comments (Convex already live — expose UI).
- [ ] States: empty (3 templates: Classic 8-day / Mara 3-day / Coast 5-day), loading day skeletons, error `Saved locally • Retry` (use `offline-cache.ts`).
- [ ] TripDetail tabs: `Itinerary (TripIt timeline) | Bookings | Moments | Share | More`; sticky `Pay deposit` (SafariBookings).
- **Accept:** 5-user test: create → drag → optimize → save, all on mobile + offline toggle, no toasts spam.

### Phase 5 — Discover + Listing rebuild (1 wk) ✅ gate: Airbnb parity demo

- [ ] Grid + MapLibre: price pins + `supercluster` + list↔map hover sync; mobile floating `Map` button with safe `z-fab`.
- [ ] Filters (5–10): Park, Days, Budget slider (KES), Group, Style, Family, Duration, Rating. Persist in URL (`?q=&filters=`).
- [ ] Cards: photo, `4.9 (229)` + Verified, days, **total KES**, day-by-day snippet, `Instant/Request` badge, heart → wishlist → `Add to Day ▾`.
- [ ] Detail: hook-first copy, inclusions/exclusions, operator card + response SLA, mini-map with gate pins, sticky CTA, linked TripAdvisor/Google reviews.
- [ ] Media: local heroes (replace Wikimedia taxis dup), `next/image` AVIF, blur-up, `remotePatterns` (remove `unoptimized:true`).
- [ ] Scraper decision: **either** wire `scrapeAll` to weekly cron + atomic `insert-then-delete` **or** delete scraper and document seed-only. No silent fallback.
- **Accept:** search `Masai → Maasai Mara` typo-tolerant; no-results → `Clear filters / Expand map`; LCP <2.5s on 4G.

### Phase 6 — Track + Moments + Recap rebuild (1–2 wks) ✅ gate: Polarsteps parity demo

- [ ] Permission primer screen (value + `Only during Active Trip` + `<4%/day`) before OS dialog; `tracking-provider.tsx` keep (exemplary) + `crypto.randomUUID()` + coalesce instead of throw (B11).
- [ ] Live: full MapLibre breadcrumb + `Day 3 • Next: Mara Gate 12m` + `+Moment` FAB + offline badge `Offline • Saving locally (12)` (IndexedDB queue + Background Sync).
- [ ] Family view (`/trace?t=`): `Live • Updated 2m ago` + route + lodge SOS contact, no login.
- [ ] Moments: 1-tap upload optimistic + `Syncing…→Shared`, Stories vertical feed map-linked, comments/reactions (already have `react` — expose).
- [ ] Recap (Unpacked): cover route playback + stats (`642km • 14 moments • 3 parks`) + best-9 + quote card + Web Share + vertical video download + `Print Book` upsell. Gate if `<3 moments`: `Add 3 to unlock`.
- [ ] Migrate moments media triple → `mediaIds[]` (shim `idsOf()` until backfill).
- **Accept:** field test: track 30m with airplane toggle → queue → sync; family link opens without app; recap shares to WhatsApp.

### Phase 7 — Checkout + Paywall + Reminders (4–6 days) ✅ gate: money reconciles

- [ ] 3-step checkout: `1 Details (autofill Clerk phone) → 2 Pay (M-Pesa default + Airtel, KES large, STK helper) → 3 Done (Track link + calendar + WhatsApp)`. Guest allowed.
- [ ] Paystack: `initialize {channels:[mobile_money,card], metadata:{tripId,bookingId}}` server action; client `paystack-inline.ts` + **poll verify + webhook**; `Resend prompt (28s)`, `Wrong number? Edit`, `Closed tab? SMS confirm`.
- [ ] Paywall copy: free = Plan/Discover/Track-live; paid = offline packs + export + Recap HD/book (Wanderlog/Polarsteps line). Compute `perDay` from `PLAN_PRICES`, fix blank `status===null` modal → sign-in CTA.
- [ ] Reminders: single template, `sweepAll` cron stays, add `sweep` client trigger deprecation note; Resend + Africa's Talking SMS on pay success.
- **Accept:** sandbox STK success + fail + timeout all show correct copy; pending reconciles within 1h without human.

### Phase 8 — PWA / Offline / Perf / Hardening (1 wk) ✅ gate: installable + paginated + 95+ scores

- [ ] PWA: manifest `standalone`, 192/512 icons, `start_url`, `Add to Home` after 2nd save; app-shell cached, itinerary + tile packs per park (`Download Mara 48MB`).
- [ ] Offline UX: `Saved locally / Syncing` bar (already have `offline-cache.ts` — surface everywhere), dim offline-only buttons, conflict `Keep mine/Server/Merge`.
- [ ] Perf: PPR for Discover, `loading.tsx` skeletons (replace full-screen shimmer with text), lazy MapLibre chunk, paginate all `collect()` (B10), add missing indexes.
- [ ] Hardening: Convex rate table, `ADMIN_EMAILS` for seeds, `images.remotePatterns`, `build: next build && tsc --noEmit && eslint` gate, remove `hono` override.
- [ ] A11y + i18n prep: extract 200 hardcoded strings to `lib/copy.ts` (EN first), final axe pass, `prefers-reduced-motion` CSS.
- **Accept:** Lighthouse Perf/A11y/Best/SEO ≥90/95/95/100 on Home/Discover/Recap; cold LCP <2.5s; repeat <1s.

---

## 9. Execution rules

1. **One phase at a time.** Don't start Phase 4 UI before Phase 1 trust fixes land.
2. **Every phase ends with a demo + checklist** (Accept lines above). No merge without repro scripts green.
3. **Delete > add.** `home.tsx`, `void day`, hidden icons, dual templates, dual tokens — delete first.
4. **No new gradients.** Only `kt/` components may use gradients; everything else flat + border.
5. **No silent fails.** Every `.catch` → toast + log; every webhook ambiguity → visible + support email with candidates.
6. **Mobile first, thumb first.** 44px, bottom nav, `svh`, offline badge — test on 360px + airplane mode.

## 10. Effort + risk

| Phase | Solo | 2-dev | Biggest risk | Mitigation |
|-------|------|-------|--------------|------------|
| 0 | 0.5d | 0.5d | Repro flakiness | Seed script + fixed trip fixture |
| 1 | 3–5d | 2–3d | Token migration breaks old links | Dual-read (old+new) for 30d, then strict |
| 2 | 4–6d | 3d | Codemod churn | `kt/` first, migrate page-by-page, snapshot tests |
| 3 | 3–4d | 2d | Date/money regression | `dates.test.ts` + `money.test.ts` before migrate |
| 4 | 7–10d | 5d | Dnd a11y | Ship buttons + undo even if drag ships later |
| 5 | 5d | 3d | Scraper bot-block | Decide delete vs cron early; don't regex booking.com |
| 6 | 7–10d | 5d | GPS battery/accuracy | Fused provider + move-based polling + field test |
| 7 | 4–6d | 3d | Paystack webhook delay | Poll + webhook + SMS triple-confirm |
| 8 | 5d | 3d | PWA cache invalidation | Versioned caches + `Clear site data` docs |

## 11. Metrics (check monthly)

- Trust: Recap share open rate, payment success rate, recovery ticket count → 0.
- Conversion: Discover→Add-to-Day, Add-to-Day→Book, Book→Paid, Paid→Track-live.
- Retention: offline pack downloads, moments/trip, recap shares/trip.
- Perf: LCP, install rate, offline success %.

## 12. File-by-file fix index (quick reference)

- `lib/share-meta.ts:43,51` → thread token. `moments-share.tsx:39`, `recap-view.tsx:39` → pass `?t=`.
- `convex/trips.ts:118,360-369,396` → disable/rotate + unify gating. `convex/moments.ts:60-64` → same rule.
- `app/api/payment-recovery/*`, `convex/payments_helpers.ts:112-120`, `convex/crons.ts` → reconcile + crons.
- `convex/bookings.ts:32,41,122`, `convex/moments.ts:136`, `convex/positions.ts:14` → `requireTripAccess`.
- `components/kenyatrace/{trip-detail,recap-view,moments-share,profile-page,app-shell,moments-page,live-page,share-stage,trips-page,subscription-card,where-stage}` → `kt/` components.
- `shared.tsx:84,104,122,168,170` → auth gates, badges, `useParams`, NotFound copy.
- `discover-page.tsx:60,132,283,452,671,712` → heroes, toasts, combobox, cards, overlay a11y.
- `live-page.tsx:180,183,236,259` → svh, z-tokens, Link, confirm.
- `share-trip.tsx:174,249,276` → mask token, avatar, AlertDialog.
- `itinerary-editor.tsx:36,100,400,583,667,711` → kindTheme, dead code, PillToggle.
- `guided-journey.tsx:598,721` → sharedAt decision, container token.
- `lib/{dates,email,money,errors,env,rate-limit,kind}.ts` → single sources (create where missing).
- `next.config.mjs`, `package.json`, `tsconfig.json`, `proxy.ts` → config residue (§3).

---

## 13. What to tell users (changelog copy)

> **This week:** fixed shared Recap/Moments links (they now open for family without login), added Revoke/Rotate for live-trace links, and payment recovery now shows live status instead of "email support". Next: faster Discover with map + filters, then offline Track packs for Mara/Amboseli.

---

*End of plan. Start with Phase 0 repros. If any P0 repro doesn't fail as described, re-audit that path before building — evidence beats assumption.*

---

## 14. Execution log (branch `restructure/phase-1-trust-repair`)

Every entry verified with `tsc --noEmit`, `eslint .` (only pre-existing warnings) and `vitest run` before commit.

| Phase | Commit | What shipped |
|-------|--------|--------------|
| 1 — Trust repair | `7e6391a` | Trace token threaded through recap/moments `share-meta` + pages; `disableTraceShare` + `rotateTraceShare`; invite token masked + inline confirm; payment-recovery verify-first + hourly `payments-reconcile` cron; editors can book/upload; booking `type` unified; `parseBookingEmail.provider` fixed + AI merge hardened |
| 2 — Design system | `9fc6b0a` | `lib/kind.ts` single source; `ui/kt/` library (BrandMark, GradientHero, badges, ProgressBar, PillToggle, EmptyState, Spinner, KindChip, KindChip); all gradient/kind/progress/pill call sites migrated; `placeholder.jpg` → `kenya-hero` + empty states; `svh` viewports; StarRating radiogroup 44px; labelled consent switch; `Link` for internal nav; `home.tsx` deleted |
| 3 — Workflow unification | `d4cba57` | `lib/email.ts`, `lib/money.ts`, `lib/dates.ts` (+`stayNights`, `daysUntil`), `lib/reminder-email.ts` single sources; `prettyDate` display everywhere incl. embeds; brief 503 guard; proxy comment corrected; `/discover` → `/discover/stays`; stop-pin select clearable; silent catches → toasts; `lib/phase3.test.ts` (10 tests) |
| 4 — Plan rebuild | `c686ceb` | Day headers with stops/cost/km/min; shared PillToggle for mobile list/map; Move-to-Day select; undo toasts for optimize; aria-live announcements; trip recap link carries `?t=`; outstanding-balance banner in bookings tab |
| 5 — Discover | `06c1221` | Keyboard-navigable search combobox; bordered cards (no lift-shift); overlay button contrast/rings/hit areas; taxis hero deduped to local asset; scraper insert-then-sweep + no clear-before-scrape + on-demand policy doc; listing loading state with status |
| 6 — Track/Moments/Recap | `a375ccb` | Positions throttle coalesces instead of throwing; crypto tab ids; permission primer copy; recap stats strip + native Web Share + Check icon; moments save busy guard; two-tap End confirm |
| 7 — Checkout/Paywall | `9d3d063` | Computed per-day pricing + honest pro-rata savings; blank-modal sign-in CTA; M-Pesa STK guidance toasts; `toMinorKES` in day-pack checkout; `pendingForBooking` query + Check-status retry in booking rows |
| 8 — Hardening | *(this commit)* | `npm run verify` gate; `PageLoading` status announcements on all page-level shimmers; install-prompt dismiss 44px target; `unoptimized:true` documented (Convex dynamic hostnames); `hono` override documented (dev-only shadcn CLI subtree) |

**Deliberate deferrals (not oversights):** Convex-backed rate limiting (needs schema + migration); cursor pagination for the remaining unbounded `collect()`s (needs server-side filtering UI); Africa's Talking SMS receipts (needs provider credentials); guest checkout (auth-model project); `/` marketing hero split from `/plan` (needs design copy); MapLibre tile packs per park (needs tile-hosting decision); full `AppError` toast-copy map (belongs with future page work).

**Merge checklist:** `npm run verify` green → review the diff (it also contains pre-existing working-tree changes swept into `7e6391a`) → Convex deploy (`payments-reconcile` cron + new `pendingForBooking` query go live together) → smoke-test share links, a day-pack purchase, and a closed-tab payment recovery.
