import { v } from "convex/values"
import { query, mutation, internalMutation } from "./_generated/server"

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
      const q = args.term.toLowerCase()
      items = items.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.location.toLowerCase().includes(q) ||
          l.tags.some((t) => t.toLowerCase().includes(q)) ||
          l.description.toLowerCase().includes(q)
      )
    }

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

export const upsertScraped = mutation({
  args: {
    vertical: v.string(),
    items: v.array(v.object({
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
      await ctx.db.insert("listings", { ...item, vertical: args.vertical })
      inserted++
    }
    console.log(`[upsertScraped] ${args.vertical}: deleted ${deletedOld} old, inserted ${inserted} new`)
    return { inserted }
  },
})

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
      const id = await ctx.db.insert("listings", item)
      ids.push(id)
    }
    return { seeded: ids.length }
  },
})

function getSeedData() {
  return [
    // ─── STAYS ───────────────────────────────────────────────
    { vertical: "stays", name: "Villa Rosa Kempinski", location: "Westlands, Nairobi", price: 22000, unit: "night", rating: 4.8, reviews: 412, image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800", tags: ["5-star", "Westlands", "Luxury"], description: "Five-star luxury hotel in Westlands with elegant rooms, rooftop pool, and world-class dining.", lat: -1.2641, lng: 36.8046 },
    { vertical: "stays", name: "Sarova Stanley Hotel", location: "Nairobi City Centre", price: 16500, unit: "night", rating: 4.7, reviews: 538, image: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800", tags: ["Heritage", "City Centre", "Colonial"], description: "Historic landmark hotel in the heart of Nairobi since 1902, offering colonial charm with modern comforts.", lat: -1.2865, lng: 36.8173 },
    { vertical: "stays", name: "Angama Mara", location: "Maasai Mara, Narok", price: 135000, unit: "night", rating: 4.9, reviews: 287, image: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=800", tags: ["Ultra-luxury", "Rift Valley", "Safari"], description: "Ultra-luxury safari lodge suspended 1,000 feet above the Mara plains on the Great Rift Valley escarpment.", lat: -1.4013, lng: 35.1329 },
    { vertical: "stays", name: "Baobab Beach Resort & Spa", location: "Diani Beach, Kwale", price: 21000, unit: "night", rating: 4.7, reviews: 634, image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800", tags: ["All-inclusive", "Beachfront", "Spa"], description: "All-inclusive beachfront resort on a private beach with tropical gardens, pools, and a world-class spa.", lat: -4.2695, lng: 39.5863 },
    { vertical: "stays", name: "Enashipai Resort & Spa", location: "Lake Naivasha, Nakuru", price: 16800, unit: "night", rating: 4.6, reviews: 312, image: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800", tags: ["Lakeside", "Spa", "Full-board"], description: "Luxury lakeside resort on the shores of Lake Naivasha with elegant rooms, spa, and game activities.", lat: -0.7533, lng: 36.4398 },
    { vertical: "stays", name: "Tawi Lodge Amboseli", location: "Amboseli, Kajiado", price: 22000, unit: "night", rating: 4.8, reviews: 198, image: "https://images.unsplash.com/photo-1590419690008-8a99b5b4f8b3?w=800", tags: ["Kilimanjaro views", "Eco-lodge", "Conservancy"], description: "Premium eco-lodge on a private conservancy bordering Amboseli with sweeping views of Mount Kilimanjaro.", lat: -2.7300, lng: 37.2600 },
    { vertical: "stays", name: "Sarova Whitesands", location: "Bamburi, Mombasa", price: 25000, unit: "night", rating: 4.6, reviews: 891, image: "https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800", tags: ["Beachfront", "Premium", "Spa"], description: "Premier beachfront resort on Bamburi Beach with tropical gardens, multiple pools, and direct beach access.", lat: -4.0235, lng: 39.7298 },
    { vertical: "stays", name: "Peponi Hotel Lamu", location: "Shela, Lamu Island", price: 18000, unit: "night", rating: 4.8, reviews: 245, image: "https://images.unsplash.com/photo-1682687982501-1e58ab814714?w=800", tags: ["Boutique", "Beachfront", "Swahili"], description: "Iconic boutique hotel on Shela beach with traditional Swahili architecture and barefoot luxury since the 1960s.", lat: -2.2720, lng: 40.9520 },
    { vertical: "stays", name: "Hemingways Watamu", location: "Watamu, Kilifi", price: 28000, unit: "night", rating: 4.7, reviews: 176, image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800", tags: ["Luxury", "Marine Park", "Beachfront"], description: "Upscale beachfront hotel on Garoda Beach within Watamu Marine National Park with ocean views.", lat: -3.3520, lng: 40.0380 },
    { vertical: "stays", name: "Saruni Samburu", location: "Kalama Conservancy, Samburu", price: 120000, unit: "night", rating: 4.9, reviews: 134, image: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=800", tags: ["Ultra-luxury", "Hilltop", "Conservancy"], description: "Ultra-luxury lodge on a rocky hilltop with sweeping views of the Samburu wilderness and private game drives.", lat: 0.7500, lng: 37.3500 },
    { vertical: "stays", name: "Borana Lodge", location: "Borana Conservancy, Laikipia", price: 140000, unit: "night", rating: 4.9, reviews: 112, image: "https://images.unsplash.com/photo-1602002418082-a4443e081dd1?w=800", tags: ["Fully-inclusive", "Rhino", "Mount Kenya"], description: "Immersive luxury lodge on a 32,000-acre conservancy below Mount Kenya with game drives, horse riding, and rhino tracking.", lat: 0.2667, lng: 36.9833 },
    { vertical: "stays", name: "Watamu Treehouse", location: "Watamu, Kilifi", price: 30000, unit: "night", rating: 4.6, reviews: 89, image: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=800", tags: ["Boutique", "Unique", "Eco"], description: "Creative multi-level boutique property built among ancient trees with garden and ocean views.", lat: -3.3490, lng: 40.0420 },
    { vertical: "stays", name: "Leopard Beach Resort", location: "Diani Beach, Kwale", price: 24000, unit: "night", rating: 4.7, reviews: 456, image: "https://images.unsplash.com/photo-1540550820234-e337b23fe59f?w=800", tags: ["Premium", "Clifftop", "Ocean views"], description: "Premium beach resort on a coral cliff overlooking Diani Beach with multiple room categories and ocean views.", lat: -4.2760, lng: 39.5905 },
    { vertical: "stays", name: "Novotel Nairobi Westlands", location: "Westlands, Nairobi", price: 12000, unit: "night", rating: 4.5, reviews: 723, image: "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=800", tags: ["4-star", "Modern", "Business"], description: "Modern 4-star hotel in Westlands with stylish interiors, pool, and easy access to Nairobi's business hubs.", lat: -1.2635, lng: 36.8018 },
    { vertical: "stays", name: "Lake Naivasha Sopa Resort", location: "Lake Naivasha, Nakuru", price: 14000, unit: "night", rating: 4.5, reviews: 378, image: "https://images.unsplash.com/photo-1568084680786-a84f91d1153c?w=800", tags: ["Lakeside", "Full-board", "Nature"], description: "Established lakeside resort on 150 acres of landscaped gardens with game drives, boat rides, and walking safaris.", lat: -0.7420, lng: 36.4150 },

    // ─── FLIGHTS ──────────────────────────────────────────────
    { vertical: "flights", name: "Nairobi to Mombasa", location: "JKIA (NBO) → Moi Intl (MBA)", price: 8300, unit: "one way", rating: 4.6, reviews: 820, image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800", tags: ["Direct", "1h", "Daily"], description: "Kenya's busiest domestic route connecting Nairobi to the coast. Multiple daily departures by Kenya Airways, Jambojet, and Skyward Express.", lat: -1.3192, lng: 36.9278 },
    { vertical: "flights", name: "Nairobi to Kisumu", location: "JKIA (NBO) → Kisumu Intl (KIS)", price: 8800, unit: "one way", rating: 4.5, reviews: 445, image: "https://images.unsplash.com/photo-1505721673515-3d6500fb1f7c?w=800", tags: ["Direct", "50 min", "Daily"], description: "Quick hop to western Kenya and Lake Victoria. Served by Kenya Airways, Jambojet, Safarilink, and Fly540.", lat: -1.3192, lng: 36.9278 },
    { vertical: "flights", name: "Nairobi to Lamu", location: "Wilson (WIL) → Manda (LAU)", price: 12000, unit: "one way", rating: 4.7, reviews: 234, image: "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=800", tags: ["Direct", "1h 10m", "Coastal"], description: "Scenic flight to Manda Island serving the UNESCO World Heritage Lamu Old Town. Daily flights via Safarilink or Jambojet.", lat: -1.3217, lng: 36.8148 },
    { vertical: "flights", name: "Nairobi to Eldoret", location: "JKIA (NBO) → Eldoret Intl (EDL)", price: 6500, unit: "one way", rating: 4.5, reviews: 367, image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800", tags: ["Direct", "1h", "Daily"], description: "Key connection to Kenya's North Rift agricultural hub. Jambojet operates five flights daily with Dash 8 Q400 aircraft.", lat: -1.3192, lng: 36.9278 },
    { vertical: "flights", name: "Nairobi to Malindi", location: "JKIA (NBO) → Malindi (MYD)", price: 7500, unit: "one way", rating: 4.6, reviews: 312, image: "https://images.unsplash.com/photo-1505685296765-3a2736de412f?w=800", tags: ["Direct", "1h 15m", "Beach"], description: "Coastal route to the beach town of Malindi. Four daily flights via Jambojet and Skyward Express.", lat: -1.3192, lng: 36.9278 },
    { vertical: "flights", name: "Nairobi to Maasai Mara", location: "Wilson (WIL) → Olkiombo (OLX)", price: 32000, unit: "one way", rating: 4.8, reviews: 567, image: "https://images.unsplash.com/photo-1565974740981-ebe164e0c7a3?w=800", tags: ["Direct", "45 min", "Safari"], description: "Premier bush flight to the Maasai Mara on a small aircraft. Safarilink operates three daily departures from Wilson Airport.", lat: -1.3217, lng: 36.8148 },
    { vertical: "flights", name: "Nairobi to Samburu", location: "Wilson (WIL) → Samburu (UAS)", price: 30000, unit: "one way", rating: 4.7, reviews: 198, image: "https://images.unsplash.com/photo-1546013615-195c75408fa8?w=800", tags: ["Direct", "1h 30m", "Safari"], description: "Bush flight to Samburu National Reserve. Daily departures via AirKenya Express connecting to the Samburu Special Five.", lat: -1.3217, lng: 36.8148 },
    { vertical: "flights", name: "Mombasa to Nairobi", location: "Moi Intl (MBA) → JKIA (NBO)", price: 8300, unit: "one way", rating: 4.6, reviews: 890, image: "https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?w=800", tags: ["Direct", "1h", "Daily"], description: "Return sector of Kenya's busiest domestic route. Multiple daily departures by Kenya Airways, Jambojet, and Skyward Express.", lat: -4.0347, lng: 39.5942 },

    // ─── ATTRACTIONS ──────────────────────────────────────────
    { vertical: "attractions", name: "Maasai Mara Sunrise Game Drive", location: "Maasai Mara, Narok", price: 6200, unit: "person", rating: 4.9, reviews: 542, image: "https://images.unsplash.com/photo-1535083252878-5e1c5a069084?w=800", tags: ["Sunrise", "Big Five", "3-4 hours"], description: "Track lions, elephants and wildebeest at first light with a local naturalist. Catch predators on their morning hunts.", lat: -1.5000, lng: 35.1500 },
    { vertical: "attractions", name: "Amboseli National Park Safari", location: "Amboseli, Kajiado", price: 3500, unit: "person", rating: 4.8, reviews: 623, image: "https://images.unsplash.com/photo-1590419690008-8a99b5b4f8b3?w=800", tags: ["Kilimanjaro", "Elephants", "Full-day"], description: "Famous for sweeping views of Mount Kilimanjaro as a backdrop to large elephant herds. Walk, cycle, or drive through the park.", lat: -2.6500, lng: 37.2500 },
    { vertical: "attractions", name: "Fort Jesus & Old Town Walk", location: "Mombasa Island", price: 550, unit: "person", rating: 4.7, reviews: 391, image: "https://images.unsplash.com/photo-1590846083693-f23fdede3a7e?w=800", tags: ["UNESCO", "History", "2-3 hours"], description: "Explore the UNESCO World Heritage Portuguese fort built in 1593, followed by a walk through Mombasa's Old Town.", lat: -4.0612, lng: 39.6694 },
    { vertical: "attractions", name: "Diani Snorkeling Trip", location: "Diani Beach, Kwale", price: 4800, unit: "person", rating: 4.7, reviews: 412, image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800", tags: ["Snorkeling", "Coral reef", "3 hours"], description: "Snorkel the coral reefs of the Indian Ocean by traditional dhow. Mask, snorkel, and fins provided. Best visibility November to March.", lat: -4.1736, lng: 39.6050 },
    { vertical: "attractions", name: "Nairobi National Park Day Trip", location: "Nairobi", price: 1500, unit: "person", rating: 4.6, reviews: 845, image: "https://images.unsplash.com/photo-1607675509087-1f6e3b1e3a43?w=800", tags: ["City safari", "Big Five", "Day trip"], description: "The world's only national park within a capital city. Spot lions, rhinos, and giraffes against Nairobi's skyline.", lat: -1.3861, lng: 36.8425 },
    { vertical: "attractions", name: "Giraffe Centre Nairobi", location: "Lang'ata, Nairobi", price: 400, unit: "person", rating: 4.6, reviews: 978, image: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=800", tags: ["Giraffes", "Conservation", "1-2 hours"], description: "Hand-feed endangered Rothschild's giraffes from an elevated platform. Walk the 38-acre nature trail and learn about conservation.", lat: -1.3364, lng: 36.7325 },
    { vertical: "attractions", name: "Sheldrick Elephant Nursery", location: "Nairobi National Park", price: 2000, unit: "person", rating: 4.9, reviews: 1023, image: "https://images.unsplash.com/photo-1564760055775-d63b17a55c44?w=800", tags: ["Elephants", "Rescue", "1 hour"], description: "Visit baby elephants orphaned by poaching. Watch keepers bottle-feed and bathe the calves. Bookings required.", lat: -1.3600, lng: 36.7972 },
    { vertical: "attractions", name: "Hell's Gate Cycling Safari", location: "Lake Naivasha, Nakuru", price: 800, unit: "person", rating: 4.7, reviews: 534, image: "https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800", tags: ["Cycling", "Adventure", "2-3 hours"], description: "The only Kenyan park where you can cycle among zebras, giraffes, and buffalo. Bike rental at the gate.", lat: -0.8833, lng: 36.3167 },
    { vertical: "attractions", name: "Lake Nakuru Flamingo Safari", location: "Lake Nakuru, Nakuru", price: 2500, unit: "person", rating: 4.7, reviews: 667, image: "https://images.unsplash.com/photo-1589802829985-817e51171b92?w=800", tags: ["Flamingos", "Rhinos", "Full-day"], description: "Famous for flamingos lining the alkaline shore. Home to black and white rhinos, lions, leopards, and waterbuck.", lat: -0.3500, lng: 36.0833 },
    { vertical: "attractions", name: "Mount Kenya Point Lenana Trek", location: "Mount Kenya, Central Kenya", price: 50000, unit: "person", rating: 4.8, reviews: 267, image: "https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=800", tags: ["Trekking", "5-day", "Adventure"], description: "Africa's second-highest peak. The Chogoria-Sirimon traverse passes Lake Ellis and Lake Michaelson before summiting at sunrise.", lat: -0.4200, lng: 37.3000 },
    { vertical: "attractions", name: "Lamu Old Town Walking Tour", location: "Lamu Island", price: 2600, unit: "person", rating: 4.8, reviews: 345, image: "https://images.unsplash.com/photo-1590846406792-0adc7f938f1d?w=800", tags: ["Swahili culture", "UNESCO", "2-3 hours"], description: "Explore Kenya's oldest living Swahili town. Walk narrow coral-stone lanes past carved doors and the 14th-century fort.", lat: -2.2717, lng: 40.9020 },
    { vertical: "attractions", name: "Bomas of Kenya Cultural Show", location: "Lang'ata, Nairobi", price: 1000, unit: "person", rating: 4.5, reviews: 712, image: "https://images.unsplash.com/photo-1504681869696-d977211a5f4c?w=800", tags: ["Cultural", "Dance", "2 hours"], description: "Daily live performances of over 50 traditional dances from Kenya's diverse ethnic communities.", lat: -1.3333, lng: 36.7167 },
    { vertical: "attractions", name: "Watamu Marine Park Snorkeling", location: "Watamu, Kilifi", price: 3000, unit: "person", rating: 4.7, reviews: 412, image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800", tags: ["Snorkeling", "Marine Park", "Half-day"], description: "Pristine coral gardens and turquoise waters. Snorkel trips depart by glass-bottom boat or dhow from Watamu beach.", lat: -3.3500, lng: 39.9833 },

    // ─── CARS ─────────────────────────────────────────────────
    { vertical: "cars", name: "Safari Land Cruiser 4x4", location: "Pickup in Nairobi", price: 42000, unit: "day", rating: 4.8, reviews: 234, image: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800", tags: ["4x4", "Safari", "Off-road"], description: "Pop-up roof Land Cruiser purpose-built for game drives. 7 seats, dual fuel tanks. Perfect for Maasai Mara, Amboseli, and Tsavo.", lat: -1.3192, lng: 36.9278 },
    { vertical: "cars", name: "Toyota Prado TXL", location: "Pickup in Nairobi", price: 13500, unit: "day", rating: 4.7, reviews: 189, image: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800", tags: ["SUV", "Luxury", "7-seater"], description: "Popular safari-and-city 7-seat diesel SUV with diff-lock and sunroof. Handles Mara and Amboseli terrain with luxury comfort.", lat: -1.3192, lng: 36.9278 },
    { vertical: "cars", name: "Nissan X-Trail SUV", location: "Pickup in Nairobi", price: 7500, unit: "day", rating: 4.6, reviews: 156, image: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800", tags: ["SUV", "Family", "AWD"], description: "5-seat AWD SUV with ample luggage space. Handles light off-road and rough Kenyan roads. Great for family trips.", lat: -1.3192, lng: 36.9278 },
    { vertical: "cars", name: "Toyota Corolla Sedan", location: "Pickup in Nairobi", price: 6000, unit: "day", rating: 4.5, reviews: 312, image: "https://images.unsplash.com/photo-1621453082135-f13a5a3ceee3?w=800", tags: ["Economy", "City", "Business"], description: "Best-selling compact sedan in Kenya. Excellent fuel economy and smooth ride. Perfect for city driving and highway travel.", lat: -1.2864, lng: 36.8172 },
    { vertical: "cars", name: "Toyota Vitz Hatchback", location: "Pickup in Westlands", price: 3800, unit: "day", rating: 4.4, reviews: 267, image: "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800", tags: ["Budget", "Economy", "City"], description: "Most economical rental option. Compact 5-seater hatchback ideal for solo travellers and city commutes.", lat: -1.2677, lng: 36.8033 },
    { vertical: "cars", name: "Toyota Hiace Minibus", location: "Pickup in Nairobi", price: 12000, unit: "day", rating: 4.5, reviews: 178, image: "https://images.unsplash.com/photo-1583071299210-c6c0a2b45411?w=800", tags: ["Group", "Airport", "Chauffeur"], description: "Air-conditioned 12-14 seater minibus. Ideal for group transfers, corporate events, and airport shuttles with a professional driver.", lat: -1.3192, lng: 36.9278 },
    { vertical: "cars", name: "Safari Minibus Pop-up Roof", location: "Pickup in Nairobi", price: 20000, unit: "day", rating: 4.7, reviews: 298, image: "https://images.unsplash.com/photo-1594252233360-6e9ea2b398b7?w=800", tags: ["Safari", "Group", "Pop-up roof"], description: "Modified HiAce with pop-up roof for game viewing. Includes driver-guide, fuel, and park fees. Perfect for budget group safaris.", lat: -1.3192, lng: 36.9278 },
    { vertical: "cars", name: "Mercedes E-Class Executive", location: "Pickup in Nairobi", price: 18500, unit: "day", rating: 4.9, reviews: 89, image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800", tags: ["Luxury", "Executive", "VIP"], description: "Premium executive sedan with leather interior. Ideal for VIP transfers, corporate events, and special occasions.", lat: -1.3192, lng: 36.9278 },

    // ─── TAXIS ────────────────────────────────────────────────
    { vertical: "taxis", name: "JKIA to Nairobi CBD", location: "JKIA → Nairobi City Centre", price: 1400, unit: "ride", rating: 4.6, reviews: 2156, image: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800", tags: ["Airport", "Ride-hailing", "35 min"], description: "Most popular airport route. Available on Uber, Bolt, and Little Cab. ~35 min via Mombasa Road.", lat: -1.3192, lng: 36.9278 },
    { vertical: "taxis", name: "JKIA to Westlands", location: "JKIA → Westlands", price: 1600, unit: "ride", rating: 4.5, reviews: 1432, image: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800", tags: ["Airport", "Westlands", "45 min"], description: "Airport transfer to Nairobi's business and entertainment district. ~45 min via Mombasa Road/Expressway.", lat: -1.3192, lng: 36.9278 },
    { vertical: "taxis", name: "Nairobi to Mombasa Intercity", location: "Nairobi → Mombasa", price: 22000, unit: "ride", rating: 4.7, reviews: 567, image: "https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?w=800", tags: ["Intercity", "Private", "Long-distance"], description: "Private door-to-door transfer between Kenya's two largest cities. ~490km, 7-8 hours via Nairobi-Mombasa highway.", lat: -1.2864, lng: 36.8172 },
    { vertical: "taxis", name: "Nairobi to Naivasha Day Trip", location: "Nairobi CBD → Naivasha", price: 4500, unit: "ride", rating: 4.6, reviews: 423, image: "https://images.unsplash.com/photo-1564419320468-687222a48f0b?w=800", tags: ["Intercity", "Day trip", "Ride-hailing"], description: "~90km journey through the Great Rift Valley. Available on Little Cab and private hire. 1.5-2 hours.", lat: -1.2864, lng: 36.8172 },
    { vertical: "taxis", name: "Mombasa Airport to Diani Beach", location: "MBA → Diani Beach", price: 10000, unit: "ride", rating: 4.7, reviews: 834, image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800", tags: ["Airport", "Beach", "Transfer"], description: "Private transfer from Moi International Airport to Diani Beach. 1-1.5 hours via Likoni Ferry or Dongo Kundu bypass.", lat: -4.0347, lng: 39.5942 },
    { vertical: "taxis", name: "Nairobi City Hourly Hire", location: "Nairobi citywide", price: 2500, unit: "hour", rating: 4.5, reviews: 987, image: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800", tags: ["Hourly", "Flexible", "City tour"], description: "Book a car by the hour with as many stops as needed. Ideal for shopping, meetings, and city tours.", lat: -1.2864, lng: 36.8172 },
    { vertical: "taxis", name: "Nairobi CBD to Karen", location: "Nairobi CBD → Karen", price: 1300, unit: "ride", rating: 4.5, reviews: 734, image: "https://images.unsplash.com/photo-1580674285054-bed31e145f59?w=800", tags: ["City", "Local app", "30 min"], description: "Transfer to Nairobi's leafy Karen suburb, home to the Giraffe Centre and Karen Blixen Museum.", lat: -1.2864, lng: 36.8172 },
    { vertical: "taxis", name: "Wilson Airport to CBD", location: "Wilson → Nairobi CBD", price: 800, unit: "ride", rating: 4.5, reviews: 1123, image: "https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=800", tags: ["Airport", "Domestic", "15 min"], description: "Quick transfer from Nairobi's domestic safari hub. ~6km, 15-25 min via Langata Road.", lat: -1.3218, lng: 36.8149 },
  ]
}
