import { v } from "convex/values"
import { query, mutation, internalMutation } from "./_generated/server"
import { wikimediaThumb } from "../lib/kenya-data"

export const wipeAll = internalMutation({
  handler: async (ctx) => {
    const all = await ctx.db.query("listings").collect()
    await Promise.all(all.map((doc) => ctx.db.delete(doc._id)))
    return { deleted: all.length }
  },
})

export const list = query({
  args: { vertical: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.vertical) {
      return await ctx.db
        .query("listings")
        .withIndex("by_vertical", (q) => q.eq("vertical", args.vertical!))
        .collect()
    }
    return await ctx.db.query("listings").collect()
  },
})

export const get = query({
  args: { id: v.id("listings") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id)
  },
})

export const search = query({
  args: {
    vertical: v.string(),
    term: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let items = await ctx.db
      .query("listings")
      .withIndex("by_vertical", (q) => q.eq("vertical", args.vertical))
      .collect()

    if (args.term) {
      items = filterByTerm(items, args.term)
    }

    return items
  },
})

function filterByTerm<T extends { name: string; location: string; tags: string[]; description: string }>(items: T[], term: string): T[] {
  const q = term.toLowerCase()
  return items.filter(
    (l) =>
      l.name.toLowerCase().includes(q) ||
      l.location.toLowerCase().includes(q) ||
      l.tags.some((t) => t.toLowerCase().includes(q)) ||
      l.description.toLowerCase().includes(q)
  )
}

export const searchAll = query({
  args: { term: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let items = await ctx.db.query("listings").collect()
    if (args.term) items = filterByTerm(items, args.term)
    return items
  },
})

export const countByVertical = query({
  args: {},
  handler: async (ctx) => {
    const all = await ctx.db.query("listings").collect()
    const counts: Record<string, number> = {}
    for (const item of all) {
      counts[item.vertical] = (counts[item.vertical] || 0) + 1
    }
    return counts
  },
})

export const lastScraped = query({
  args: { vertical: v.string() },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("listings")
      .withIndex("by_vertical", (q) => q.eq("vertical", args.vertical))
      .collect()
    let latest: number | null = null
    for (const item of items) {
      if (item.scrapedAt !== undefined && (latest === null || item.scrapedAt > latest)) latest = item.scrapedAt
    }
    return latest
  },
})

export const upsertScraped = mutation({
  args: {
    vertical: v.string(),
    items: v.array(v.object({
      // `vertical` is set by the scrapers but not stored on listings rows
      // (the vertical is the index), so it must be tolerated here or Convex
      // rejects the whole batch.
      vertical: v.optional(v.string()),
      name: v.string(),
      location: v.string(),
      price: v.number(),
      unit: v.string(),
      rating: v.number(),
      reviews: v.number(),
      image: v.string(),
      tags: v.array(v.string()),
      description: v.string(),
      lat: v.number(),
      lng: v.number(),
      scrapedAt: v.number(),
      source: v.optional(v.string()),
    })),
  },
  handler: async (ctx, args) => {
    if (args.items.length === 0) {
      console.log(`[upsertScraped] ${args.vertical}: no items to insert`)
      return { inserted: 0 }
    }

    const existing = await ctx.db
      .query("listings")
      .withIndex("by_vertical", (q) => q.eq("vertical", args.vertical))
      .collect()

    let deletedOld = 0
    for (const item of existing) {
      if (item.scrapedAt !== undefined) {
        await ctx.db.delete(item._id)
        deletedOld++
      }
    }

    let inserted = 0
    for (const item of args.items) {
      await ctx.db.insert("listings", { ...item, image: wikimediaThumb(item.image), vertical: args.vertical, ...trustDefaults({ vertical: args.vertical, rating: item.rating, reviews: item.reviews, tags: item.tags }) })
      inserted++
    }
    console.log(`[upsertScraped] ${args.vertical}: deleted ${deletedOld} old, inserted ${inserted} new`)
    return { inserted }
  },
})

export const backfillTrust = internalMutation({
  handler: async (ctx) => {
    const all = await ctx.db.query("listings").collect()
    let updated = 0
    for (const item of all) {
      const trust = trustDefaults(item)
      if (trust.freeCancellation === item.freeCancellation && trust.instantConfirm === item.instantConfirm) continue
      await ctx.db.patch(item._id, trust)
      updated++
    }
    return { updated }
  },
})

function trustDefaults(item: { vertical: string; rating: number; reviews: number; tags: string[] }) {
  const tags = item.tags.join(' ').toLowerCase()
  if (item.vertical === 'stays') {
    return { instantConfirm: item.rating >= 4.5, freeCancellation: item.rating >= 4.0 }
  }
  if (item.vertical === 'flights' || item.vertical === 'taxis' || item.vertical === 'cars') {
    return { instantConfirm: true, freeCancellation: false }
  }
  return { instantConfirm: item.reviews >= 200, freeCancellation: item.reviews >= 100 || tags.includes('cancellation') }
}

export const clearVertical = mutation({
  args: { vertical: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("listings")
      .withIndex("by_vertical", (q) => q.eq("vertical", args.vertical))
      .collect()
    for (const item of existing) {
      await ctx.db.delete(item._id)
    }
    return { deleted: existing.length }
  },
})

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db.query("listings").collect()
    if (existing.length > 0) return { seeded: existing.length }

    const data = getSeedData()
    const ids: string[] = []
    for (const item of data) {
      const id = await ctx.db.insert("listings", { ...item, image: wikimediaThumb(item.image) })
      ids.push(id)
    }
    return { seeded: ids.length }
  },
})

const TAXI_SKYLINE = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg/960px-Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg"
const DIANI_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Diani_Beach_Ukunda.jpg/960px-Diani_Beach_Ukunda.jpg"
const NAIVASHA_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Naivasha_lake.jpg/960px-Naivasha_lake.jpg"

function taxiImage(item: { name: string; location: string }): string {
  const text = `${item.name} ${item.location}`.toLowerCase()
  if (text.includes("diani")) return DIANI_IMAGE
  if (text.includes("naivasha")) return NAIVASHA_IMAGE
  return TAXI_SKYLINE
}

/**
 * Normalizes every listing's image to a fast, valid Wikimedia thumbnail
 * (800px and full-size originals both 404/slow) and fills any empty image
 * with a sensible fallback. Run once from the Convex dashboard (Functions →
 * listings → backfillImages) or via the "Upgrade images" button on the
 * Discover page to upgrade live data.
 */
export const backfillImages = mutation({
  args: {},
  handler: async (ctx) => {
    const byName = new Map(getSeedData().map((item) => [item.name, wikimediaThumb(item.image)]))
    const all = await ctx.db.query("listings").collect()
    let updated = 0
    for (const item of all) {
      let image = byName.get(item.name) ?? wikimediaThumb(item.image)
      if (!image) image = item.vertical === "taxis" ? taxiImage(item) : "/kenya-hero.png"
      if (image !== item.image) {
        await ctx.db.patch(item._id, { image })
        updated++
      }
    }
    return { updated }
  },
})

function getSeedData() {
  return [
    // ─── STAYS ───────────────────────────────────────────────
    { vertical: "stays", name: "Villa Rosa Kempinski", location: "Westlands, Nairobi", price: 22000, unit: "night", rating: 4.8, reviews: 412, image: "https://upload.wikimedia.org/wikipedia/commons/d/de/Secretary_Kerry_Sits_With_His_Fellow_Foreign_Ministers_at_the_Villa_Rosa_Kempinski_Hotel_in_Nairobi_%2828531519154%29.jpg", tags: ["5-star", "Westlands", "Luxury"], description: "Five-star luxury hotel in Westlands with elegant rooms, rooftop pool, and world-class dining.", lat: -1.2641, lng: 36.8046 },
    { vertical: "stays", name: "Sarova Stanley Hotel", location: "Nairobi City Centre", price: 16500, unit: "night", rating: 4.7, reviews: 538, image: "https://upload.wikimedia.org/wikipedia/commons/9/9a/Stanley_Hotel_Nairobi_Kenya_1903.jpg", tags: ["Heritage", "City Centre", "Colonial"], description: "Historic landmark hotel in the heart of Nairobi since 1902, offering colonial charm with modern comforts.", lat: -1.2865, lng: 36.8173 },
    { vertical: "stays", name: "Angama Mara", location: "Maasai Mara, Narok", price: 135000, unit: "night", rating: 4.9, reviews: 287, image: "https://upload.wikimedia.org/wikipedia/commons/8/8a/Angama_Mara_2018_086.jpg", tags: ["Ultra-luxury", "Rift Valley", "Safari"], description: "Ultra-luxury safari lodge suspended 1,000 feet above the Mara plains on the Great Rift Valley escarpment.", lat: -1.4013, lng: 35.1329 },
    { vertical: "stays", name: "Baobab Beach Resort & Spa", location: "Diani Beach, Kwale", price: 21000, unit: "night", rating: 4.7, reviews: 634, image: "https://upload.wikimedia.org/wikipedia/commons/8/81/Diani_Beach_2013_-_panoramio.jpg", tags: ["All-inclusive", "Beachfront", "Spa"], description: "All-inclusive beachfront resort on a private beach with tropical gardens, pools, and a world-class spa.", lat: -4.2695, lng: 39.5863 },
    { vertical: "stays", name: "Enashipai Resort & Spa", location: "Lake Naivasha, Nakuru", price: 16800, unit: "night", rating: 4.6, reviews: 312, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Naivasha_lake.jpg/800px-Naivasha_lake.jpg", tags: ["Lakeside", "Spa", "Full-board"], description: "Luxury lakeside resort on the shores of Lake Naivasha with elegant rooms, spa, and game activities.", lat: -0.7533, lng: 36.4398 },
    { vertical: "stays", name: "Tawi Lodge Amboseli", location: "Amboseli, Kajiado", price: 22000, unit: "night", rating: 4.8, reviews: 198, image: "https://upload.wikimedia.org/wikipedia/commons/3/35/Amboseli_Park_-_Kilimanjaro_elephant.jpg", tags: ["Kilimanjaro views", "Eco-lodge", "Conservancy"], description: "Premium eco-lodge on a private conservancy bordering Amboseli with sweeping views of Mount Kilimanjaro.", lat: -2.7300, lng: 37.2600 },
    { vertical: "stays", name: "Sarova Whitesands", location: "Bamburi, Mombasa", price: 25000, unit: "night", rating: 4.6, reviews: 891, image: "https://upload.wikimedia.org/wikipedia/commons/d/d0/Sarova_Whitesands_-_Palm_Rooms_Exterior.jpg", tags: ["Beachfront", "Premium", "Spa"], description: "Premier beachfront resort on Bamburi Beach with tropical gardens, multiple pools, and direct beach access.", lat: -4.0235, lng: 39.7298 },
    { vertical: "stays", name: "Peponi Hotel Lamu", location: "Shela, Lamu Island", price: 18000, unit: "night", rating: 4.8, reviews: 245, image: "https://upload.wikimedia.org/wikipedia/commons/5/55/Lamu_beaches.jpg", tags: ["Boutique", "Beachfront", "Swahili"], description: "Iconic boutique hotel on Shela beach with traditional Swahili architecture and barefoot luxury since the 1960s.", lat: -2.2720, lng: 40.9520 },
    { vertical: "stays", name: "Hemingways Watamu", location: "Watamu, Kilifi", price: 28000, unit: "night", rating: 4.7, reviews: 176, image: "https://upload.wikimedia.org/wikipedia/commons/d/dd/Hemingways_Resort%2C_Watamu.jpg", tags: ["Luxury", "Marine Park", "Beachfront"], description: "Upscale beachfront hotel on Garoda Beach within Watamu Marine National Park with ocean views.", lat: -3.3520, lng: 40.0380 },
    { vertical: "stays", name: "Saruni Samburu", location: "Kalama Conservancy, Samburu", price: 120000, unit: "night", rating: 4.9, reviews: 134, image: "https://upload.wikimedia.org/wikipedia/commons/6/6a/Samburu_National_Reserve%2C_Kenya-26December2012.jpg", tags: ["Ultra-luxury", "Hilltop", "Conservancy"], description: "Ultra-luxury lodge on a rocky hilltop with sweeping views of the Samburu wilderness and private game drives.", lat: 0.7500, lng: 37.3500 },
    { vertical: "stays", name: "Borana Lodge", location: "Borana Conservancy, Laikipia", price: 140000, unit: "night", rating: 4.9, reviews: 112, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/MtKenya.jpg/800px-MtKenya.jpg", tags: ["Fully-inclusive", "Rhino", "Mount Kenya"], description: "Immersive luxury lodge on a 32,000-acre conservancy below Mount Kenya with game drives, horse riding, and rhino tracking.", lat: 0.2667, lng: 36.9833 },
    { vertical: "stays", name: "Watamu Treehouse", location: "Watamu, Kilifi", price: 30000, unit: "night", rating: 4.6, reviews: 89, image: "https://upload.wikimedia.org/wikipedia/commons/c/c9/Turtle06.jpg", tags: ["Boutique", "Unique", "Eco"], description: "Creative multi-level boutique property built among ancient trees with garden and ocean views.", lat: -3.3490, lng: 40.0420 },
    { vertical: "stays", name: "Leopard Beach Resort", location: "Diani Beach, Kwale", price: 24000, unit: "night", rating: 4.7, reviews: 456, image: "https://upload.wikimedia.org/wikipedia/commons/7/7a/Leopard_beach_resort.jpg", tags: ["Premium", "Clifftop", "Ocean views"], description: "Premium beach resort on a coral cliff overlooking Diani Beach with multiple room categories and ocean views.", lat: -4.2760, lng: 39.5905 },
    { vertical: "stays", name: "Novotel Nairobi Westlands", location: "Westlands, Nairobi", price: 12000, unit: "night", rating: 4.5, reviews: 723, image: "https://upload.wikimedia.org/wikipedia/commons/1/17/Novotel_Westlands.jpg", tags: ["4-star", "Modern", "Business"], description: "Modern 4-star hotel in Westlands with stylish interiors, pool, and easy access to Nairobi's business hubs.", lat: -1.2635, lng: 36.8018 },
    { vertical: "stays", name: "Lake Naivasha Sopa Resort", location: "Lake Naivasha, Nakuru", price: 14000, unit: "night", rating: 4.5, reviews: 378, image: "https://upload.wikimedia.org/wikipedia/commons/c/ca/Wildlife_during_dawn_walk_at_Lake_Naivasha_Sopa_resort_%2813636809183%29.jpg", tags: ["Lakeside", "Full-board", "Nature"], description: "Established lakeside resort on 150 acres of landscaped gardens with game drives, boat rides, and walking safaris.", lat: -0.7420, lng: 36.4150 },

    // ─── FLIGHTS ──────────────────────────────────────────────
    { vertical: "flights", name: "Nairobi to Mombasa", location: "JKIA (NBO) → Moi Intl (MBA)", price: 8300, unit: "one way", rating: 4.6, reviews: 820, image: "https://upload.wikimedia.org/wikipedia/commons/e/ee/5Y-KZC_Boeing_787_Kenya_Airways_%2834754105944%29.jpg", tags: ["Direct", "1h", "Daily"], description: "Kenya's busiest domestic route connecting Nairobi to the coast. Multiple daily departures by Kenya Airways, Jambojet, and Skyward Express.", lat: -1.3192, lng: 36.9278 },
    { vertical: "flights", name: "Nairobi to Kisumu", location: "JKIA (NBO) → Kisumu Intl (KIS)", price: 8800, unit: "one way", rating: 4.5, reviews: 445, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/3d/Kisumu_International_Airport_Terminal.jpg/800px-Kisumu_International_Airport_Terminal.jpg", tags: ["Direct", "50 min", "Daily"], description: "Quick hop to western Kenya and Lake Victoria. Served by Kenya Airways, Jambojet, Safarilink, and Fly540.", lat: -1.3192, lng: 36.9278 },
    { vertical: "flights", name: "Nairobi to Lamu", location: "Wilson (WIL) → Manda (LAU)", price: 12000, unit: "one way", rating: 4.7, reviews: 234, image: "https://upload.wikimedia.org/wikipedia/commons/2/29/Lamu_Old_Town.jpg", tags: ["Direct", "1h 10m", "Coastal"], description: "Scenic flight to Manda Island serving the UNESCO World Heritage Lamu Old Town. Daily flights via Safarilink or Jambojet.", lat: -1.3217, lng: 36.8148 },
    { vertical: "flights", name: "Nairobi to Eldoret", location: "JKIA (NBO) → Eldoret Intl (EDL)", price: 6500, unit: "one way", rating: 4.5, reviews: 367, image: "https://upload.wikimedia.org/wikipedia/commons/f/fa/Main_lounge_at_Eldoret_International_Airport.jpg", tags: ["Direct", "1h", "Daily"], description: "Key connection to Kenya's North Rift agricultural hub. Jambojet operates five flights daily with Dash 8 Q400 aircraft.", lat: -1.3192, lng: 36.9278 },
    { vertical: "flights", name: "Nairobi to Malindi", location: "JKIA (NBO) → Malindi (MYD)", price: 7500, unit: "one way", rating: 4.6, reviews: 312, image: "https://upload.wikimedia.org/wikipedia/commons/3/35/View_of_terminal_building_at_Malindi_International_Airport.jpg", tags: ["Direct", "1h 15m", "Beach"], description: "Coastal route to the beach town of Malindi. Four daily flights via Jambojet and Skyward Express.", lat: -1.3192, lng: 36.9278 },
    { vertical: "flights", name: "Nairobi to Maasai Mara", location: "Wilson (WIL) → Olkiombo (OLX)", price: 32000, unit: "one way", rating: 4.8, reviews: 567, image: "https://upload.wikimedia.org/wikipedia/commons/1/17/Masai_Mara_at_Sunset.jpg", tags: ["Direct", "45 min", "Safari"], description: "Premier bush flight to the Maasai Mara on a small aircraft. Safarilink operates three daily departures from Wilson Airport.", lat: -1.3217, lng: 36.8148 },
    { vertical: "flights", name: "Nairobi to Samburu", location: "Wilson (WIL) → Samburu (UAS)", price: 30000, unit: "one way", rating: 4.7, reviews: 198, image: "https://upload.wikimedia.org/wikipedia/commons/6/6a/Samburu_National_Reserve%2C_Kenya-26December2012.jpg", tags: ["Direct", "1h 30m", "Safari"], description: "Bush flight to Samburu National Reserve. Daily departures via AirKenya Express connecting to the Samburu Special Five.", lat: -1.3217, lng: 36.8148 },
    { vertical: "flights", name: "Mombasa to Nairobi", location: "Moi Intl (MBA) → JKIA (NBO)", price: 8300, unit: "one way", rating: 4.6, reviews: 890, image: "https://upload.wikimedia.org/wikipedia/commons/e/ee/5Y-KZC_Boeing_787_Kenya_Airways_%2834754105944%29.jpg", tags: ["Direct", "1h", "Daily"], description: "Return sector of Kenya's busiest domestic route. Multiple daily departures by Kenya Airways, Jambojet, and Skyward Express.", lat: -4.0347, lng: 39.5942 },

    // ─── ATTRACTIONS ──────────────────────────────────────────
    { vertical: "attractions", name: "Maasai Mara Sunrise Game Drive", location: "Maasai Mara, Narok", price: 6200, unit: "person", rating: 4.9, reviews: 542, image: "https://upload.wikimedia.org/wikipedia/commons/1/17/Masai_Mara_at_Sunset.jpg", tags: ["Sunrise", "Big Five", "3-4 hours"], description: "Track lions, elephants and wildebeest at first light with a local naturalist. Catch predators on their morning hunts.", lat: -1.5000, lng: 35.1500 },
    { vertical: "attractions", name: "Amboseli National Park Safari", location: "Amboseli, Kajiado", price: 3500, unit: "person", rating: 4.8, reviews: 623, image: "https://upload.wikimedia.org/wikipedia/commons/f/fa/Elephants_at_Amboseli_national_park_against_Mount_Kilimanjaro.jpg", tags: ["Kilimanjaro", "Elephants", "Full-day"], description: "Famous for sweeping views of Mount Kilimanjaro as a backdrop to large elephant herds. Walk, cycle, or drive through the park.", lat: -2.6500, lng: 37.2500 },
    { vertical: "attractions", name: "Fort Jesus & Old Town Walk", location: "Mombasa Island", price: 550, unit: "person", rating: 4.7, reviews: 391, image: "https://upload.wikimedia.org/wikipedia/commons/4/41/Fort_Jesus_at_the_Mombasa_Island.jpg", tags: ["UNESCO", "History", "2-3 hours"], description: "Explore the UNESCO World Heritage Portuguese fort built in 1593, followed by a walk through Mombasa's Old Town.", lat: -4.0612, lng: 39.6694 },
    { vertical: "attractions", name: "Diani Snorkeling Trip", location: "Diani Beach, Kwale", price: 4800, unit: "person", rating: 4.7, reviews: 412, image: "https://upload.wikimedia.org/wikipedia/commons/2/2d/Diani_Beach_Ukunda.jpg", tags: ["Snorkeling", "Coral reef", "3 hours"], description: "Snorkel the coral reefs of the Indian Ocean by traditional dhow. Mask, snorkel, and fins provided. Best visibility November to March.", lat: -4.1736, lng: 39.6050 },
    { vertical: "attractions", name: "Nairobi National Park Day Trip", location: "Nairobi", price: 1500, unit: "person", rating: 4.6, reviews: 845, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/64/Lions_of_Kenya_02.jpg/800px-Lions_of_Kenya_02.jpg", tags: ["City safari", "Big Five", "Day trip"], description: "The world's only national park within a capital city. Spot lions, rhinos, and giraffes against Nairobi's skyline.", lat: -1.3861, lng: 36.8425 },
    { vertical: "attractions", name: "Giraffe Centre Nairobi", location: "Lang'ata, Nairobi", price: 400, unit: "person", rating: 4.6, reviews: 978, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Giraffe_Centre_August_2025_04.jpg/800px-Giraffe_Centre_August_2025_04.jpg", tags: ["Giraffes", "Conservation", "1-2 hours"], description: "Hand-feed endangered Rothschild's giraffes from an elevated platform. Walk the 38-acre nature trail and learn about conservation.", lat: -1.3364, lng: 36.7325 },
    { vertical: "attractions", name: "Sheldrick Elephant Nursery", location: "Nairobi National Park", price: 2000, unit: "person", rating: 4.9, reviews: 1023, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Baby_elephants_at_the_Sheldrick_Wildlife_Trust_nursery_in_Nairobi%2C_Kenya.jpg/800px-Baby_elephants_at_the_Sheldrick_Wildlife_Trust_nursery_in_Nairobi%2C_Kenya.jpg", tags: ["Elephants", "Rescue", "1 hour"], description: "Visit baby elephants orphaned by poaching. Watch keepers bottle-feed and bathe the calves. Bookings required.", lat: -1.3600, lng: 36.7972 },
    { vertical: "attractions", name: "Hell's Gate Cycling Safari", location: "Lake Naivasha, Nakuru", price: 800, unit: "person", rating: 4.7, reviews: 534, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Hell%27s_Gate%2C_Kenya.jpg/800px-Hell%27s_Gate%2C_Kenya.jpg", tags: ["Cycling", "Adventure", "2-3 hours"], description: "The only Kenyan park where you can cycle among zebras, giraffes, and buffalo. Bike rental at the gate.", lat: -0.8833, lng: 36.3167 },
    { vertical: "attractions", name: "Lake Nakuru Flamingo Safari", location: "Lake Nakuru, Nakuru", price: 2500, unit: "person", rating: 4.7, reviews: 667, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9b/Lake-Nakuru-Baboon-Hill-View.JPG/800px-Lake-Nakuru-Baboon-Hill-View.JPG", tags: ["Flamingos", "Rhinos", "Full-day"], description: "Famous for flamingos lining the alkaline shore. Home to black and white rhinos, lions, leopards, and waterbuck.", lat: -0.3500, lng: 36.0833 },
    { vertical: "attractions", name: "Mount Kenya Point Lenana Trek", location: "Mount Kenya, Central Kenya", price: 50000, unit: "person", rating: 4.8, reviews: 267, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/09/MtKenya.jpg/800px-MtKenya.jpg", tags: ["Trekking", "5-day", "Adventure"], description: "Africa's second-highest peak. The Chogoria-Sirimon traverse passes Lake Ellis and Lake Michaelson before summiting at sunrise.", lat: -0.4200, lng: 37.3000 },
    { vertical: "attractions", name: "Lamu Old Town Walking Tour", location: "Lamu Island", price: 2600, unit: "person", rating: 4.8, reviews: 345, image: "https://upload.wikimedia.org/wikipedia/commons/2/29/Lamu_Old_Town.jpg", tags: ["Swahili culture", "UNESCO", "2-3 hours"], description: "Explore Kenya's oldest living Swahili town. Walk narrow coral-stone lanes past carved doors and the 14th-century fort.", lat: -2.2717, lng: 40.9020 },
    { vertical: "attractions", name: "Bomas of Kenya Cultural Show", location: "Lang'ata, Nairobi", price: 1000, unit: "person", rating: 4.5, reviews: 712, image: "https://upload.wikimedia.org/wikipedia/commons/0/07/BomasLuoVillage.JPG", tags: ["Cultural", "Dance", "2 hours"], description: "Daily live performances of over 50 traditional dances from Kenya's diverse ethnic communities.", lat: -1.3333, lng: 36.7167 },
    { vertical: "attractions", name: "Watamu Marine Park Snorkeling", location: "Watamu, Kilifi", price: 3000, unit: "person", rating: 4.7, reviews: 412, image: "https://upload.wikimedia.org/wikipedia/commons/c/c9/Turtle06.jpg", tags: ["Snorkeling", "Marine Park", "Half-day"], description: "Pristine coral gardens and turquoise waters. Snorkel trips depart by glass-bottom boat or dhow from Watamu beach.", lat: -3.3500, lng: 39.9833 },

    // ─── CARS ─────────────────────────────────────────────────
    { vertical: "cars", name: "Safari Land Cruiser 4x4", location: "Pickup in Nairobi", price: 42000, unit: "day", rating: 4.8, reviews: 234, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/2021_Toyota_Land_Cruiser_300_3.4_ZX_%28Colombia%29_front_view_04.png/800px-2021_Toyota_Land_Cruiser_300_3.4_ZX_%28Colombia%29_front_view_04.png", tags: ["4x4", "Safari", "Off-road"], description: "Pop-up roof Land Cruiser purpose-built for game drives. 7 seats, dual fuel tanks. Perfect for Maasai Mara, Amboseli, and Tsavo.", lat: -1.3192, lng: 36.9278 },
    { vertical: "cars", name: "Toyota Prado TXL", location: "Pickup in Nairobi", price: 13500, unit: "day", rating: 4.7, reviews: 189, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/2024_Toyota_Land_Cruiser_250_VX_in_Platinum_White_Pearl_Mica%2C_front_left.jpg/800px-2024_Toyota_Land_Cruiser_250_VX_in_Platinum_White_Pearl_Mica%2C_front_left.jpg", tags: ["SUV", "Luxury", "7-seater"], description: "Popular safari-and-city 7-seat diesel SUV with diff-lock and sunroof. Handles Mara and Amboseli terrain with luxury comfort.", lat: -1.3192, lng: 36.9278 },
    { vertical: "cars", name: "Nissan X-Trail SUV", location: "Pickup in Nairobi", price: 7500, unit: "day", rating: 4.6, reviews: 156, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Nissan_X-Trail_%28T33%29_1X7A7179.jpg/800px-Nissan_X-Trail_%28T33%29_1X7A7179.jpg", tags: ["SUV", "Family", "AWD"], description: "5-seat AWD SUV with ample luggage space. Handles light off-road and rough Kenyan roads. Great for family trips.", lat: -1.3192, lng: 36.9278 },
    { vertical: "cars", name: "Toyota Corolla Sedan", location: "Pickup in Nairobi", price: 6000, unit: "day", rating: 4.5, reviews: 312, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Toyota_Corolla_Hybrid_%28E210%29_IMG_4338.jpg/800px-Toyota_Corolla_Hybrid_%28E210%29_IMG_4338.jpg", tags: ["Economy", "City", "Business"], description: "Best-selling compact sedan in Kenya. Excellent fuel economy and smooth ride. Perfect for city driving and highway travel.", lat: -1.2864, lng: 36.8172 },
    { vertical: "cars", name: "Toyota Vitz Hatchback", location: "Pickup in Westlands", price: 3800, unit: "day", rating: 4.4, reviews: 267, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/2017_Toyota_Yaris_L_5-door%2C_front_right%2C_08-25-2024.jpg/800px-2017_Toyota_Yaris_L_5-door%2C_front_right%2C_08-25-2024.jpg", tags: ["Budget", "Economy", "City"], description: "Most economical rental option. Compact 5-seater hatchback ideal for solo travellers and city commutes.", lat: -1.2677, lng: 36.8033 },
    { vertical: "cars", name: "Toyota Hiace Minibus", location: "Pickup in Nairobi", price: 12000, unit: "day", rating: 4.5, reviews: 178, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/2020_Toyota_HiAce_%28front%29.jpg/800px-2020_Toyota_HiAce_%28front%29.jpg", tags: ["Group", "Airport", "Chauffeur"], description: "Air-conditioned 12-14 seater minibus. Ideal for group transfers, corporate events, and airport shuttles with a professional driver.", lat: -1.3192, lng: 36.9278 },
    { vertical: "cars", name: "Safari Minibus Pop-up Roof", location: "Pickup in Nairobi", price: 20000, unit: "day", rating: 4.7, reviews: 298, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/2020_Toyota_HiAce_%28front%29.jpg/800px-2020_Toyota_HiAce_%28front%29.jpg", tags: ["Safari", "Group", "Pop-up roof"], description: "Modified HiAce with pop-up roof for game viewing. Includes driver-guide, fuel, and park fees. Perfect for budget group safaris.", lat: -1.3192, lng: 36.9278 },
    { vertical: "cars", name: "Mercedes E-Class Executive", location: "Pickup in Nairobi", price: 18500, unit: "day", rating: 4.9, reviews: 89, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Mercedes-Benz_W214_1X7A1841.jpg/800px-Mercedes-Benz_W214_1X7A1841.jpg", tags: ["Luxury", "Executive", "VIP"], description: "Premium executive sedan with leather interior. Ideal for VIP transfers, corporate events, and special occasions.", lat: -1.3192, lng: 36.9278 },

    // ─── TAXIS ────────────────────────────────────────────────
    { vertical: "taxis", name: "JKIA to Nairobi CBD", location: "JKIA → Nairobi City Centre", price: 1400, unit: "ride", rating: 4.6, reviews: 2156, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg/800px-Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg", tags: ["Airport", "Ride-hailing", "35 min"], description: "Most popular airport route. Available on Uber, Bolt, and Little Cab. ~35 min via Mombasa Road.", lat: -1.3192, lng: 36.9278 },
    { vertical: "taxis", name: "JKIA to Westlands", location: "JKIA → Westlands", price: 1600, unit: "ride", rating: 4.5, reviews: 1432, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg/800px-Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg", tags: ["Airport", "Westlands", "45 min"], description: "Airport transfer to Nairobi's business and entertainment district. ~45 min via Mombasa Road/Expressway.", lat: -1.3192, lng: 36.9278 },
    { vertical: "taxis", name: "Nairobi to Mombasa Intercity", location: "Nairobi → Mombasa", price: 22000, unit: "ride", rating: 4.7, reviews: 567, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg/800px-Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg", tags: ["Intercity", "Private", "Long-distance"], description: "Private door-to-door transfer between Kenya's two largest cities. ~490km, 7-8 hours via Nairobi-Mombasa highway.", lat: -1.2864, lng: 36.8172 },
    { vertical: "taxis", name: "Nairobi to Naivasha Day Trip", location: "Nairobi CBD → Naivasha", price: 4500, unit: "ride", rating: 4.6, reviews: 423, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Naivasha_lake.jpg/800px-Naivasha_lake.jpg", tags: ["Intercity", "Day trip", "Ride-hailing"], description: "~90km journey through the Great Rift Valley. Available on Little Cab and private hire. 1.5-2 hours.", lat: -1.2864, lng: 36.8172 },
    { vertical: "taxis", name: "Mombasa Airport to Diani Beach", location: "MBA → Diani Beach", price: 10000, unit: "ride", rating: 4.7, reviews: 834, image: "https://upload.wikimedia.org/wikipedia/commons/2/2d/Diani_Beach_Ukunda.jpg", tags: ["Airport", "Beach", "Transfer"], description: "Private transfer from Moi International Airport to Diani Beach. 1-1.5 hours via Likoni Ferry or Dongo Kundu bypass.", lat: -4.0347, lng: 39.5942 },
    { vertical: "taxis", name: "Nairobi City Hourly Hire", location: "Nairobi citywide", price: 2500, unit: "hour", rating: 4.5, reviews: 987, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg/800px-Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg", tags: ["Hourly", "Flexible", "City tour"], description: "Book a car by the hour with as many stops as needed. Ideal for shopping, meetings, and city tours.", lat: -1.2864, lng: 36.8172 },
    { vertical: "taxis", name: "Nairobi CBD to Karen", location: "Nairobi CBD → Karen", price: 1300, unit: "ride", rating: 4.5, reviews: 734, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg/800px-Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg", tags: ["City", "Local app", "30 min"], description: "Transfer to Nairobi's leafy Karen suburb, home to the Giraffe Centre and Karen Blixen Museum.", lat: -1.2864, lng: 36.8172 },
    { vertical: "taxis", name: "Wilson Airport to CBD", location: "Wilson → Nairobi CBD", price: 800, unit: "ride", rating: 4.5, reviews: 1123, image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg/800px-Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg", tags: ["Airport", "Domestic", "15 min"], description: "Quick transfer from Nairobi's domestic safari hub. ~6km, 15-25 min via Langata Road.", lat: -1.3218, lng: 36.8149 },
  ]
}
