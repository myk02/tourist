# KenyaTrace — Page Restructuring Plan

A detailed plan for restructuring the Discover, Plan, Trips, Moments, and Profile pages so the site is professional and working, based on best practices from leaders in travel UX (Airbnb, Booking.com, Tripadvisor, Viator, TripIt, To & Fro, TourRadar, Mahalo, Tripop, MemoryLane, GetYourGuide, Klook).

---

## Part 1 — What was found in the current code

### Architecture problem (the root cause of "doesn't feel professional")

- Every page lives inside one giant client component, `components/kenyatrace/app-experience.tsx`. Routing is done manually via `usePathname()` in `RouteView` (line 42), and both `app/page.tsx` and `app/[...slug]/page.tsx` render the exact same component. This means:
  - No per-page server rendering, no per-page SEO/metadata, everything blocks on client-side Convex fetches.
  - All five screens + home share one file; the longest lines are ~6,000 chars of JSX.
- Scraping status is exposed to end users ("Refreshing data", a manual **Refresh** button) — that's an admin concept, not a consumer one.

### Concrete bugs found

1. `Detail` (line 56): "Start live tracking" → `/trips/${item._id}/track` and "Moments" → `/moments?trip=${item._id}` — both use the **listing** id as a **trip** id. These links are broken for every listing.
2. Moments upload dialog (line 81): the trip `<Select>` has `onValueChange={()=>{}}` — you literally cannot switch trips in the dialog.
3. Backend functions exist with **no UI**: `trips.remove`, `moments.remove`, `bookings.cancel` — and `bookings.create` has *no caller at all* (there is no "Reserve/Book" action on the Detail page).
4. `TripDetail` itinerary (line 77) is read-only — users can't edit or reorder a saved trip, and the delete button is never rendered.
5. Trip `status` is always `"planning"` and never transitions.

### Feature gaps vs. best practice

| Page | Current | Missing (best practice) |
|---|---|---|
| Discover | text search + 1 filter select, grid only | map+list split view, faceted filters, price slider, wishlist/save hearts, sort, pagination, URL-shareable state (partially done) |
| Plan | one AI form + flat button list for manual | constraint composer (chips/sliders), travel-time between stops, day tabs, drag-to-reorder, synced map, per-stop AI rationale, verify state, re-plan around "locked" stops |
| Trips | flat card list; detail is read-only | upcoming vs past, countdowns, status lifecycle, editable itinerary, day timeline, budget by day/category, delete/duplicate/share |
| Moments | small list of thumbnails | geolocated photo map, timeline/album, lightbox, multi-photo, location/AI captions, "best moment" tagging, delete |
| Profile | avatar + 3 stats + booking list | tabs (overview/bookings/wishlist/settings), travel preferences, booking actions (cancel), saved/favorites, profile completeness |

---

## Part 2 — Best practices (from research) and how to restructure each page

### 1. Discover page

**Research:** Airbnb's search teardown says discovery should be low-friction, date-optional, with a **split view: scrollable card list + live clustered map that stays in sync**. Filters use **progressive disclosure** (5–6 visible, rest behind "More filters"), active filters shown as removable **pills**, result count updated live, and the filtered state must be **URL-shareable and back-button-safe** (Timothy Graf's search framework). **Wishlist hearts** are a low-commitment save that fuels personalization. **Skeleton screens** during load (already partially done). Viator adds: rating, thumbnails, price, "free cancellation"-style trust signals on every card, category/tag filters, and destination breadcrumbs. GetYourGuide/Viator/TourRadar all surface traveller UGC and review counts as trust signals.

**Restructure plan for Discover:**

- **Split layout (desktop):** left = card grid, right = `KenyaMap` with clustered markers, hover/click syncs between card and pin (add `hoveredListingId` state shared by both panels — the map component already exists).
- **Replace the filter `<Select>` with a filter bar:** price-range slider (with snap points), rating slider (4.5+/4.7+), budget toggle, "Top rated", "Near me" (geolocation), per-category tags. Show ~4 on mobile behind a "Filters" bottom sheet with sticky Apply.
- **Active filters as removable pills** + "Clear all" + live result count ("23 of 40 verified stays").
- **Keep URL state** (already syncs `?q=`/`?filter=` — extend to all filters).
- **Add a ♥ save (wishlist)** button on cards → stored per-user in Convex (new `savedListings` table); shows on Profile as "Saved".
- **Add sort** (Recommended / Price low-high / Rating / Recently added).
- **Pagination or "Load more"** instead of dumping everything; keep skeleton cards.
- **Move scrape logic behind the scenes.** Auto-scrape in the background (already done via `searchWithScrape`), but remove the "Refreshing data / Refresh" UI; show only a subtle "Updated 2h ago" and move manual refresh to an admin-only flag.
- **Add trust chips on cards:** e.g. "Free cancellation", "Instant confirmation" columns in the data model + badges (Viator pattern).
- **Search improvements:** debounce input, add rich suggestions, and note the search scope ("Searching Stays…").

### 2. Plan page

**Research (the strongest consensus):**

- **VP0's 4 surfaces + honesty rule:** (1) constraints composer, (2) day-by-day timeline with **travel time as first-class rows**, (3) **one map synced to the list**, (4) edit/re-plan where **user "anchors" (locked stops) survive regeneration**. The honesty rule: every AI stop renders as **suggested / verified / booked** — the model drafts, it doesn't know.
- **perpet.io's AI-trust research:** attach a **visible reason** to each suggestion ("popular with travellers headed to Maasai Mara in April"), keep edits **scoped to one card** (never regenerate the whole day to fix one stop), be honest about confidence, and cap days at ~**3 realistic stops** (acceptance collapses past 5–6).
- **Tripadvisor's AI Trip Builder:** travellers *enjoy planning* — don't force a full day-by-day on them. Show **categorised recommendations to pick from** (restaurants, stays, activities), let them **save the ones they like**, then "arrange into a daily plan". This doubled save-rate and +10% satisfaction.
- **To & Fro / TripIt:** the **day is the core organizing unit**; each stop needs duration + travel distance/time between stops so the plan is physically realistic.

**Restructure plan for Plan:**

- **Constraints composer** (replaces the raw form): date inputs, budget via slider with snap brackets (KES 20k/50k/100k/200k), **pace dial** (relaxed/balanced/full days), **interest chips** (Wildlife, Food, Culture, Beach, Adventure, Luxury) instead of free text; destinations as chips too. Keep a free-text "anything else".
- **AI output → "discovery list first":** after generation, show the returned stops grouped into **categories** (Stays, Experiences, Transport, Food) with a ♥ per card, per-stop **reason line**, and a verification chip (**"Suggested · from your brief"** vs **"Verified · our database"** vs **"Booked"**). Then a button **"Arrange into days"**.
- **Itinerary editor upgrade** (`ItineraryEditor`):
  - **Day tabs** with a vertical timeline per day; stops shown with **travel time rows between them** (compute from `lat/lng` distance using the existing map data — no API needed).
  - **Drag-and-drop reorder** (already have `@dnd-kit` installed but never use it).
  - **Add stop by search** within the editor, **edit time/cost per stop**, **lock an anchor** (🔒) so a future re-plan never moves it.
  - **Re-plan one day**, not the whole trip: `/api/plan` gets a mode to regenerate only the unpinned stops of a given day, keeping anchors.
  - **Budget by day and by category** progress bars, not just a total (the "day arithmetic stays visible" rule).
  - **Autosave draft** to sessionStorage (done for Manual only — do it for AI too).
- **Manual planner:** replace the raw button-list with a searchable, filterable picker using the same card grid + category tabs from Discover, plus the same upgraded editor on the right.

### 3. Trips page

**Research:** TripIt's redesign and Tripop's dashboard both group trips as **Upcoming / In-progress / Past** with **"Starts in X days" countdowns** on cards. TripIt: day-tabs + timeline on the detail page; **typed itinerary items** (flight, stay, activity, reservation, transport). To & Fro: a trip is editable before *and* during the trip. Status should progress **planning → booked → travelling → completed**.

**Restructure plan for Trips:**

- **Dashboard:** three sections (Upcoming / In progress / Completed) or a toggle; each card shows cover image, name, destination, dates, **"in X days" countdown**, budget spend progress, status badge, and a **progress bar** (stops completed / total). Add **duplicate** and **share (copy link)** actions.
- **Trip detail:** keep hero, then **Tabs: Timeline · Map · Budget · Moments**:
  - **Timeline:** the upgraded day-tab editor, **fully editable** (drag, add, edit, delete) with live save to `trips.replaceStops`, and **travel-time rows**.
  - **Map:** `KenyaMap` with stops **as points** (currently `points={[]}` — wire in the stop points) + route polyline.
  - **Budget:** per-day and per-category breakdown with remaining amount (reuse the editor's budget math).
  - **Moments:** embed the trip's moments inline (grid + map) rather than a separate screen.
  - Add a **Delete trip** button wired to the existing `trips.remove`.
- **Fix the status lifecycle:** add `trips.update` mutation; buttons like "Mark as booked" / "Mark travelling" / "Mark completed" drive status + progress.
- **Live tracking:** keep the `/trips/:id/track` page, but it must **read the trip id from the trip, not the listing**. Add a consent toggle (already have `users.trackingConsent` unused) and show the recorded path + "End tracking" to stop recording.

### 4. Moments

**Research:** the UGC playbook: moments work when they're **geolocated, time/season-tagged, and tied to a bookable thing**; TourRadar links each moment to the bookable tour; MemoryLane/Our Getaway/Wimemo all show **photos on a map + timeline**; MyTripDiary adds **AI captions/location tags** and group sharing. TourRadar's model (credit for uploading) is the growth mechanic.

**Restructure plan for Moments:**

- **Fix the trip selector bug** in the dialog first (`onValueChange` no-op) — one-line fix.
- **Grid/album view** with larger thumbnails + a **lightbox** (click to zoom).
- **Map view:** toggle that pins moments on `KenyaMap` by their `stopName`/geo; **timeline view** grouped by date.
- **Capture the location** when uploading (link moment to the trip stop the user is at, or geotag via `navigator.geolocation`) so moments appear on the map.
- **Multi-photo upload** (up to 6, TourRadar pattern) and **AI caption/location suggestion** from the image via the existing `/api/plan`-style route.
- **"Best moment" star + auto-tag by date** so a trip recap is easy to build.
- **Add Delete** (wire `moments.remove`) and **toggle public/private** per moment; optionally a per-trip **share link** with a teaser view (MemoryLane pattern).
- If a growth loop is wanted later: **upload credits** toward a discount on the next booking (TourRadar's $25/video).

### 5. Profile page

**Research:** Booking.com's account redesign compared "dashboard" vs "navigation-focused" patterns; the winner was **tabs: Overview (stats + upcoming trip), Bookings, Wishlist/Saved, Travel Preferences, Settings**. KAYAK's profile organizes by **pre-trip (watchlist), in-trip (trips), post-trip (past trips + settings)**. Mahalo proves travel preferences (styles, budget range, "vibes" sliders like Adventure↔Relax, interest toggles) drive recommendation quality. Hevcode lists the account essentials: profile, booking history, saved/favorites, payment methods, preferences.

**Restructure plan for Profile:**

- **Convert to tabbed layout:**
  - **Overview:** greeting, stats (trips, saved, moments), **next trip card with countdown**, quick actions (Plan a trip, Upload a moment).
  - **Bookings:** list with **actions per status** — Cancel (wire `bookings.cancel`), "View trip", payment method; show reference + amount + status pill; empty state with CTA to Explore.
  - **Saved:** the wishlist from Discover (grid of saved listings, remove/♥).
  - **Preferences:** travel styles, budget range, interest chips, pace — stored in a new `userPreferences` field on `users`, **pre-filled into the AI planner** (this makes the whole site feel personal).
  - **Settings:** profile photo/name (Clerk `UserButton`), email, **tracking consent toggle** (wire `users.setTrackingConsent`), data export.
- **Profile completeness bar** (Mahalo tip: "complete profile → better recommendations").

### 6. Cross-cutting (make it "professional and working")

- **Real routing + SSR:** split `app-experience.tsx` into route folders under `app/` (`app/discover/[[...vertical]]/page.tsx`, `app/plan/...`, `app/trips/[...id]/page.tsx`, `app/moments/`, `app/profile/`), one file per page + shared components. This unlocks per-page `metadata`, server components for listings (fast LCP, SEO), and lets the home/discover render statically from the seed data.
- **Break up the monolith:** move `Detail`, `ItineraryEditor`, `Trips`, `TripDetail`, `Moments`, `Profile`, `SearchPanel` into `components/kenyatrace/*.tsx` files (Discover is already split).
- **Backend cleanups:** wire `trips.remove`/`moments.remove`/`bookings.cancel` to UI; add a **"Reserve" button on the listing Detail** calling `bookings.create`; add `trips.update` for status/cover; fix the two listing-as-trip-id links; add `savedListings` table; remove the `scrapeJobs`-style admin UI from consumer screens.
- **Data model additions:** `savedListings`, `userPreferences`, `booking` gains `checkIn/checkOut/guests`, `tripStops` gains `duration`/`verified` state, listings gain `freeCancellation`/`instantConfirm` booleans.

---

## Part 3 — Phased roadmap

**Phase 0 — Stabilize (half a day):** fix the two listing/trip id links, fix the Moments trip-selector bug, wire delete/cancel mutations, add a working "Reserve" button on Detail, hide scrape UI.

**Phase 1 — Split architecture (1–2 days):** real route folders + page components, per-page metadata/SSR, move screens out of the monolith. Do this before feature work — everything else gets easier.

**Phase 2 — Discover (2–3 days):** filter bar + price/rating sliders + pills + URL state, map/list split with sync, wishlist hearts + `savedListings`, sort + load-more, trust chips.

**Phase 3 — Plan (2–3 days):** constraint composer (chips/sliders/pace), AI discovery-list-then-arrange flow, travel-time rows, day tabs, dnd-kit drag reorder, anchors + re-plan-one-day, per-stop reason + verification chip, per-day/category budget.

**Phase 4 — Trips + Tracking (2 days):** upcoming/past dashboard with countdowns, status lifecycle + `trips.update`, editable detail (add/edit/delete stops, points on map), delete/share, tracking consent + end-tracking.

**Phase 5 — Moments (1–2 days):** album grid + lightbox, map/timeline views, multi-photo upload, AI caption/location, best-moment star, delete + public toggle, trip-share link.

**Phase 6 — Profile (1–2 days):** tabbed dashboard, preferences pre-fill into planner, booking actions, saved grid, completeness bar, settings/consent.

**Success metrics to track:** search-to-detail conversion, itinerary save-rate, trips-per-user, moments-per-trip, wishlist→booking rate — the ones the leaders above cite.
