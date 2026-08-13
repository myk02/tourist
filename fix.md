# KenyaTrace — Fix Plan

Deep audit of all pages, workflows, and the Convex backend (4 parallel audits + verification of every critical finding against source).

Status: tests 54/57 pass, typecheck fails (scraper), lint cannot run (eslint not installed).

---

## 🔴 Critical — broken user flows / lost data

### 1. Expired-trial users stuck on an infinite loading skeleton, never see the paywall
- **Where:** `components/kenyatrace/paywall.tsx:246-271`
- **Problem:** `RequireSubscription` sets `trialStarted=true` and calls `ensureTrial()`. For an existing (expired) row `ensureTrial` resolves `{ started: false }` without error, so `.catch(() => setTrialStarted(false))` never fires. The branch `status.mode === 'none' && trialStarted` (line 282) matches forever and `PaywallScreen` (line 285) is unreachable. Every `RequireSubscription` page (`/trips`, `/moments`, `/plan`, `/trips/[id]`, `/trips/[id]/track`) shows a permanent skeleton for exactly the users who should be buying a day pack.
- **Fix:** Only keep the skeleton while the trial start is actually in flight. When `ensureTrial` resolves `started:false` (row already exists), clear the flag so the paywall renders. Use the mutation's returned `started` instead of a one-way `trialStarted` boolean.

### 2. Scraper pipeline is completely dead — nothing scraped ever persists
- **Where:** `convex/listings.ts:102-116`, `convex/scraper/http_scraper.ts`, `convex/scraper/firecrawl.ts`
- **Problem:** `upsertScraped` validates `items` with `v.object({ name, location, price, unit, rating, reviews, image, tags, description, lat, lng, scrapedAt, source })` but every scraper item also includes `vertical`. Convex `v.object` rejects extra properties, so the whole `items` array fails validation, `scrapeVertical` catches and logs, and Discover only ever shows seed data.
- **Also:** `fetchHTML` passes `timeout: 30000` which isn't in `RequestInit` (TS2769 → typecheck fails). Malformed URL `https://www.getyourguide.com&s` (line 156). `scraper/index.ts` has TS7022/TS7023 from referencing public actions via `internal`.
- **Fix:** Add `vertical: v.optional(v.string())` to the items validator (keep data flowing; `vertical` is already used for the index). Remove the `timeout` option from the fetch init (or set it via `AbortSignal.timeout`). Fix the malformed URL. Resolve the `internal` type-cycle in `scraper/index.ts`.

### 3. Newly generated plans get clobbered by the previous trip's stored itinerary
- **Where:** `components/kenyatrace/itinerary-editor.tsx:209-221`, `components/kenyatrace/guided-journey.tsx:927-932`
- **Problem:** The editor's hydration effect restores `stops` from `storageKey` on mount, and the write-back effect persists every change. The journey passes a constant `storageKey="ktJourneyItinerary"`, so the previous plan's (or previous trip's) edited stops replay into a brand-new plan — the new AI itinerary is immediately replaced.
- **Fix:** Key the storage to the plan/trip identity so a new plan never restores an old one. On the journey, scope the key per `draft.tripId`/generation id (e.g. only persist while editing the same plan), and clear the key when a new plan is generated.

### 4. Trip `destination` is the first stop, not the destination
- **Where:** `app/api/plan/route.ts:220`
- **Problem:** `const destination = uniqueStops[0]?.title || parsed.destination`. `uniqueStops` is sorted by `(day, sequence)` ascending, so this is day-1's first stop ("Settle into a Westlands hotel"), not the main destination. Corrupts `plan.name` fallback, track-stage headers, share text, and the moment's `location`.
- **Fix:** Use `parsed.destination` (the field the model is told to fill) as primary, fall back to `uniqueStops[0]?.title` only when absent.

### 5. Duplicate trips created by re-saving after "Back to plan"
- **Where:** `components/kenyatrace/guided-journey.tsx:919-921, 421-449`
- **Problem:** After "Save trip & start tracking" succeeds (`tripId` set, stage `track`), the user can click "Back to plan" and press the enabled Save button again — `createTrip` has no `tripId` guard, so it creates a second trip and repoints `draft.tripId`, orphaning the first.
- **Fix:** Guard the plan-stage Save: when `draft.tripId` already exists, either disable the button or make it navigate to the existing trip instead of creating a new one.

---

## 🟠 High

### 6. Day replan injects every day's stops into one day; extra AI stops are dropped
- **Where:** `app/api/plan/route.ts:283-295`, `components/kenyatrace/itinerary-editor.tsx:386-404`
- **Problem:** The replan `build` walks the whole model JSON — nothing filters to `input.day`. The client then assigns every returned stop to the requested day. And the merge only fills pre-existing day-stop slots, so a fuller regenerated day is truncated.
- **Fix:** Filter replan output to the target day; merge by day, replacing only that day's stops.

### 7. `/trips` gates invited collaborators behind their own subscription
- **Where:** `components/kenyatrace/trips-page.tsx:205` vs `components/kenyatrace/trip-detail.tsx:123-125`
- **Problem:** The list page wraps everything in `<RequireSubscription>` (default `enabled=true`), but trip detail only gates owners (`requireSubscription = isOwner`) — collaborators ride the owner's subscription. A collaborator without their own trial/pack hits the paywall (or the #1 skeleton) on the list page.
- **Fix:** Only require subscription for trips the user owns; always show shared trips.

### 8. Moments page breaks for shared trips / users with no owned trips
- **Where:** `components/kenyatrace/moments-page.tsx:53-57`, `convex/moments.ts:14,63`
- **Problem:** The trip dropdown comes from `api.trips.list` (includes shared trips), but `moments.list` returns `[]` unless the user owns the trip and `moments.create` throws for non-owners. Selecting a shared trip shows an empty album and every save fails.
- **Fix:** Filter the moments dropdown to owned trips (or guard non-owner trips with a read-only message).

### 9. Live-tracking progress resets to 0 on every reload
- **Where:** `components/kenyatrace/tracking-provider.tsx:61,138,150`
- **Problem:** `startDistanceRef` is a plain ref, never persisted. After a reload mid-trip the first GPS fix resets it, so progress drops from e.g. 60% to ~0 and stays there.
- **Fix:** Persist the start distance with the session (or re-derive from `lastPoint`/path) so progress survives reloads.

### 10. Live trace double-draws the current session
- **Where:** `components/kenyatrace/live-page.tsx:58-60`
- **Problem:** `trace = [...recordedPath, ...active.path]` — the DB path already contains the session's recorded subset, then the full session path is appended, redrawing the whole route and "jumping back".
- **Fix:** Only draw DB-recorded points; overlay the live segment as a separate short tail.

### 11. Tracker widget permanently disappears after one "arrived" dismissal
- **Where:** `components/kenyatrace/tracker-widget.tsx:26,72,151`
- **Problem:** `dismissed` is component state on a widget mounted once in the app layout. Clicking X on the arrived card sets it forever; never reset by start/stop or session changes.
- **Fix:** Reset `dismissed` when a new session starts / when the session changes.

### 12. `formatKES` emits `Ksh` but tests expect `KSh` — 3 failing tests
- **Where:** `lib/kenya-data.ts:36`, `lib/kenya-data.test.ts:48,54`
- **Problem:** `Intl.NumberFormat('en-KE')` returns `Ksh 0` / `Ksh 12,345`; the tests assert `/KSh/`.
- **Fix:** Make them agree — normalize the formatter to a canonical `KES` output (used everywhere in the UI) and update the tests to match.

### 13. No way to share or view a live trace
- **Where:** `convex/positions.ts:14-20`, `live-page.tsx:122`, `tracker-widget.tsx:166`
- **Problem:** `positions.forTrip` is owner-only; the "Share (optional)" CTAs link to `/moments?trip=...` which shares photos, not the route. The headline "share your trace" flow is a dead-end.
- **Fix:** Add a public/readable position query for shared-trip collaborators (or a shareable live-trace link).

---

## 🟡 Medium

- **Payment retry patches the same pending row with a fresh reference** — a same-amount retry can map two successful charges to one payment, no refund path. (`convex/payments.ts:59-68`)
- **Per-traveller figure divides twice** — `perPerson = total/travelers`, then the caption divides again. (`components/kenyatrace/budget-dashboard.tsx:133`)
- **Per-day average divides by the max day number**, not the count of days with stops. (`budget-dashboard.tsx:50`, `itinerary-editor.tsx:570`)
- **Tracking consent not enforced** on the guided-journey start path; **geolocation denial is silent** (session stuck at 0% forever). (`tracking-provider.tsx:166,169`)
- **Expired owners can still update a trip** — `trips.update` lacks `requireActiveAccess`, unlike create/replaceStops/duplicate. (`convex/trips.ts:92-111`)
- **Unvalidated route params** (`/trips/<garbage>`, `/moments/garbage`) crash queries instead of showing NotFound. (`moments-share.tsx:34`, `shared.tsx:163`)
- **Email invite can promise a role the link doesn't grant** — reuses the existing link's token regardless of the dialog's chosen role. (`share-trip.tsx:61-85`)
- **Invite link base uses the client `Origin` header** — token-capture/phishing vector. (`app/api/send-invite/route.ts:53`)
- **No timeout on the AI fetch** — plan generation can hang forever with no cancel. (`lib/ai.ts:30-51`)
- **Raw multi-line ZodError** returned as the 400 body (e.g. a traveller geolocated outside Kenya). (`app/api/plan/route.ts:331-334`)

## 🟢 Low / polish

- Equator `lat:0` dropped by truthiness filters in ~5 places (Kenya straddles the equator). `guided-journey.tsx:476,578`, `itinerary-editor.tsx:269,337`, `sample-trace.tsx:56`, `moments-page.tsx:116`, `listing-detail.tsx:119`
- Sample-trace: day-5 bush flight carries Nairobi (Wilson) coordinates; legend dots use a text color as background → invisible. (`lib/sample-trace.ts:37`, `sample-trace.tsx:153`)
- Trip dates use UTC `toISOString` — off-by-one for evening planners in EAT. (`guided-journey.tsx:425-433`)
- Blank page for a nonexistent trip in live-page (returns `null` instead of NotFound). (`live-page.tsx:81`)
- Deleting a trip orphans its positions and moments. (`convex/trips.ts:137-147`)
- Profile `?tab=` never written back to the URL — refresh/back lose the selected tab. (`profile-page.tsx:64-71`)
- `moments.allForOwner` resolves only the first image (`storageId`), ignoring `storageIds`. (`convex/moments.ts:48`)
- Duplicate docstring block in `convex/subscriptions.ts:47-58`.
- eslint referenced in package.json but never installed — `npm run lint` fails.
