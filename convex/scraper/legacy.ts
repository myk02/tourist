import { v } from "convex/values"
import { internalAction } from "../_generated/server"
import { api } from "../_generated/api"
import { scrapeAttractions } from "./wikipedia"
import { estimateTaxiFromQuery } from "./taxis"

function getFallbackData(vertical: string) {
  const now = Date.now()
  const all: Record<string, any[]> = {
    stays: [
      { vertical: "stays", name: "Villa Rosa Kempinski", location: "Westlands, Nairobi", price: 22000, unit: "night", rating: 4.8, reviews: 412, image: "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=800", tags: ["5-star", "Westlands", "Luxury"], description: "Five-star luxury hotel in Westlands with elegant rooms, rooftop pool, and world-class dining.", lat: -1.2641, lng: 36.8046, scrapedAt: now, source: "legacy" },
      { vertical: "stays", name: "Sarova Stanley Hotel", location: "Nairobi City Centre", price: 16500, unit: "night", rating: 4.7, reviews: 538, image: "https://images.unsplash.com/photo-1618773928121-c32242e63f39?w=800", tags: ["Heritage", "City Centre", "Colonial"], description: "Historic landmark hotel in the heart of Nairobi since 1902, offering colonial charm with modern comforts.", lat: -1.2865, lng: 36.8173, scrapedAt: now, source: "legacy" },
      { vertical: "stays", name: "Angama Mara", location: "Maasai Mara, Narok", price: 135000, unit: "night", rating: 4.9, reviews: 287, image: "https://images.unsplash.com/photo-1493246507139-91e8fad9978e?w=800", tags: ["Ultra-luxury", "Safari", "Rift Valley"], description: "Ultra-luxury safari lodge suspended 1,000 feet above the Mara plains on the Great Rift Valley escarpment.", lat: -1.4013, lng: 35.1329, scrapedAt: now, source: "legacy" },
      { vertical: "stays", name: "Baobab Beach Resort & Spa", location: "Diani Beach, Kwale", price: 21000, unit: "night", rating: 4.7, reviews: 634, image: "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?w=800", tags: ["All-inclusive", "Beachfront", "Spa"], description: "All-inclusive beachfront resort on a private beach with tropical gardens, pools, and a world-class spa.", lat: -4.2695, lng: 39.5863, scrapedAt: now, source: "legacy" },
      { vertical: "stays", name: "Enashipai Resort & Spa", location: "Lake Naivasha, Nakuru", price: 16800, unit: "night", rating: 4.6, reviews: 312, image: "https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?w=800", tags: ["Lakeside", "Spa", "Full-board"], description: "Luxury lakeside resort on the shores of Lake Naivasha with elegant rooms, spa, and game activities.", lat: -0.7533, lng: 36.4398, scrapedAt: now, source: "legacy" },
      { vertical: "stays", name: "Saruni Samburu", location: "Kalama Conservancy, Samburu", price: 120000, unit: "night", rating: 4.9, reviews: 134, image: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=800", tags: ["Ultra-luxury", "Hilltop", "Conservancy"], description: "Ultra-luxury lodge on a rocky hilltop with sweeping views of the Samburu wilderness and private game drives.", lat: 0.75, lng: 37.35, scrapedAt: now, source: "legacy" },
      { vertical: "stays", name: "Sarova Whitesands", location: "Bamburi, Mombasa", price: 25000, unit: "night", rating: 4.6, reviews: 891, image: "https://images.unsplash.com/photo-1540541338287-41700207dee6?w=800", tags: ["Beachfront", "Premium", "Spa"], description: "Premier beachfront resort on Bamburi Beach with tropical gardens, multiple pools, and direct beach access.", lat: -4.0235, lng: 39.7298, scrapedAt: now, source: "legacy" },
      { vertical: "stays", name: "Leopard Beach Resort", location: "Diani Beach, Kwale", price: 24000, unit: "night", rating: 4.7, reviews: 456, image: "https://images.unsplash.com/photo-1540550820234-e337b23fe59f?w=800", tags: ["Premium", "Clifftop", "Ocean views"], description: "Premium beach resort on a coral cliff overlooking Diani Beach with multiple room categories and ocean views.", lat: -4.276, lng: 39.5905, scrapedAt: now, source: "legacy" },
      { vertical: "stays", name: "Hemingways Watamu", location: "Watamu, Kilifi", price: 28000, unit: "night", rating: 4.7, reviews: 176, image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800", tags: ["Luxury", "Marine Park", "Beachfront"], description: "Upscale beachfront hotel on Garoda Beach within Watamu Marine National Park with ocean views.", lat: -3.352, lng: 40.038, scrapedAt: now, source: "legacy" },
    ],
    flights: [
      { vertical: "flights", name: "Nairobi to Mombasa", location: "JKIA (NBO) → Moi Intl (MBA)", price: 8300, unit: "one way", rating: 4.6, reviews: 820, image: "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?w=800", tags: ["Direct", "1h", "Daily"], description: "Kenya's busiest domestic route connecting Nairobi to the coast. Multiple daily departures by Kenya Airways, Jambojet, and Skyward Express.", lat: -1.3192, lng: 36.9278, scrapedAt: now, source: "legacy" },
      { vertical: "flights", name: "Nairobi to Kisumu", location: "JKIA (NBO) → Kisumu Intl (KIS)", price: 8800, unit: "one way", rating: 4.5, reviews: 445, image: "https://images.unsplash.com/photo-1505721673515-3d6500fb1f7c?w=800", tags: ["Direct", "50 min", "Daily"], description: "Quick hop to western Kenya and Lake Victoria. Served by Kenya Airways and Jambojet.", lat: -1.3192, lng: 36.9278, scrapedAt: now, source: "legacy" },
      { vertical: "flights", name: "Nairobi to Lamu", location: "Wilson (WIL) → Manda (LAU)", price: 12000, unit: "one way", rating: 4.7, reviews: 234, image: "https://images.unsplash.com/photo-1454496522488-7a8e488e8606?w=800", tags: ["Direct", "1h 10m", "Coastal"], description: "Scenic flight to Manda Island serving the UNESCO World Heritage Lamu Old Town.", lat: -1.3217, lng: 36.8148, scrapedAt: now, source: "legacy" },
      { vertical: "flights", name: "Nairobi to Eldoret", location: "JKIA (NBO) → Eldoret Intl (EDL)", price: 6500, unit: "one way", rating: 4.5, reviews: 367, image: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800", tags: ["Direct", "1h", "Daily"], description: "Key connection to Kenya's North Rift agricultural hub. Jambojet operates five flights daily.", lat: -1.3192, lng: 36.9278, scrapedAt: now, source: "legacy" },
      { vertical: "flights", name: "Nairobi to Malindi", location: "JKIA (NBO) → Malindi (MYD)", price: 7500, unit: "one way", rating: 4.6, reviews: 312, image: "https://images.unsplash.com/photo-1505685296765-3a2736de412f?w=800", tags: ["Direct", "1h 15m", "Beach"], description: "Coastal route to the beach town of Malindi.", lat: -1.3192, lng: 36.9278, scrapedAt: now, source: "legacy" },
      { vertical: "flights", name: "Nairobi to Maasai Mara", location: "Wilson (WIL) → Olkiombo (OLX)", price: 32000, unit: "one way", rating: 4.8, reviews: 567, image: "https://images.unsplash.com/photo-1565974740981-ebe164e0c7a3?w=800", tags: ["Direct", "45 min", "Safari"], description: "Premier bush flight to the Maasai Mara on a small aircraft.", lat: -1.3217, lng: 36.8148, scrapedAt: now, source: "legacy" },
      { vertical: "flights", name: "Nairobi to Samburu", location: "Wilson (WIL) → Samburu (UAS)", price: 30000, unit: "one way", rating: 4.7, reviews: 198, image: "https://images.unsplash.com/photo-1546013615-195c75408fa8?w=800", tags: ["Direct", "1h 30m", "Safari"], description: "Bush flight to Samburu National Reserve. Daily departures via AirKenya Express.", lat: -1.3217, lng: 36.8148, scrapedAt: now, source: "legacy" },
      { vertical: "flights", name: "Mombasa to Nairobi", location: "Moi Intl (MBA) → JKIA (NBO)", price: 8300, unit: "one way", rating: 4.6, reviews: 890, image: "https://images.unsplash.com/photo-1464037866556-6812c9d1c72e?w=800", tags: ["Direct", "1h", "Daily"], description: "Return sector of Kenya's busiest domestic route.", lat: -4.0347, lng: 39.5942, scrapedAt: now, source: "legacy" },
    ],
    "things-to-do": [
      { vertical: "things-to-do", name: "Maasai Mara Safari Experience", location: "Maasai Mara, Narok", price: 8500, unit: "person", rating: 4.9, reviews: 723, image: "https://images.unsplash.com/photo-1535083252878-5e1c5a069084?w=800", tags: ["Safari", "Big Five", "Full-day"], description: "Full-day game drive in the world-famous Maasai Mara. Track the Big Five with an expert guide.", lat: -1.5, lng: 35.15, scrapedAt: now, source: "legacy" },
      { vertical: "things-to-do", name: "Diani Snorkeling & Dhow Trip", location: "Diani Beach, Kwale", price: 4800, unit: "person", rating: 4.7, reviews: 412, image: "https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800", tags: ["Snorkeling", "Coral reef", "3 hours"], description: "Snorkel the coral reefs of the Indian Ocean by traditional dhow. Mask and snorkel provided.", lat: -4.1736, lng: 39.605, scrapedAt: now, source: "legacy" },
      { vertical: "things-to-do", name: "Hell's Gate Cycling Safari", location: "Lake Naivasha, Nakuru", price: 800, unit: "person", rating: 4.7, reviews: 534, image: "https://images.unsplash.com/photo-1541625602330-2277a4c46182?w=800", tags: ["Cycling", "Adventure", "2-3 hours"], description: "The only Kenyan park where you can cycle among zebras, giraffes, and buffalo.", lat: -0.8833, lng: 36.3167, scrapedAt: now, source: "legacy" },
      { vertical: "things-to-do", name: "Mount Kenya Trekking", location: "Mount Kenya, Central Kenya", price: 50000, unit: "person", rating: 4.8, reviews: 267, image: "https://images.unsplash.com/photo-1585409677983-0f6c41ca9c3b?w=800", tags: ["Trekking", "Adventure", "5-day"], description: "Africa's second-highest peak. The Chogoria-Sirimon traverse with summit sunrise.", lat: -0.42, lng: 37.3, scrapedAt: now, source: "legacy" },
      { vertical: "things-to-do", name: "Giraffe Centre Visit", location: "Lang'ata, Nairobi", price: 400, unit: "person", rating: 4.6, reviews: 978, image: "https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=800", tags: ["Giraffes", "Conservation", "Family"], description: "Hand-feed endangered Rothschild's giraffes from an elevated platform. Walk the 38-acre nature trail.", lat: -1.3364, lng: 36.7325, scrapedAt: now, source: "legacy" },
      { vertical: "things-to-do", name: "Sheldrick Elephant Nursery", location: "Nairobi National Park", price: 2000, unit: "person", rating: 4.9, reviews: 1023, image: "https://images.unsplash.com/photo-1564760055775-d63b17a55c44?w=800", tags: ["Elephants", "Rescue", "Conservation"], description: "Visit baby elephants orphaned by poaching. Watch keepers bottle-feed and bathe the calves.", lat: -1.36, lng: 36.7972, scrapedAt: now, source: "legacy" },
      { vertical: "things-to-do", name: "Lamu Old Town Walking Tour", location: "Lamu Island", price: 2600, unit: "person", rating: 4.8, reviews: 345, image: "https://images.unsplash.com/photo-1590846406792-0adc7f938f1d?w=800", tags: ["Swahili culture", "UNESCO", "Walking tour"], description: "Explore Kenya's oldest living Swahili town. Walk narrow coral-stone lanes past carved doors.", lat: -2.2717, lng: 40.902, scrapedAt: now, source: "legacy" },
      { vertical: "things-to-do", name: "Bomas of Kenya Cultural Show", location: "Lang'ata, Nairobi", price: 1000, unit: "person", rating: 4.5, reviews: 712, image: "https://images.unsplash.com/photo-1504681869696-d977211a5f4c?w=800", tags: ["Cultural", "Dance", "Music"], description: "Daily live performances of over 50 traditional dances from Kenya's diverse communities.", lat: -1.3333, lng: 36.7167, scrapedAt: now, source: "legacy" },
    ],
    cars: [
      { vertical: "cars", name: "Safari Land Cruiser 4x4", location: "Pickup in Nairobi", price: 42000, unit: "day", rating: 4.8, reviews: 234, image: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800", tags: ["4x4", "Safari", "Off-road"], description: "Pop-up roof Land Cruiser purpose-built for game drives. 7 seats, dual fuel tanks.", lat: -1.3192, lng: 36.9278, scrapedAt: now, source: "legacy" },
      { vertical: "cars", name: "Toyota Prado TXL", location: "Pickup in Nairobi", price: 13500, unit: "day", rating: 4.7, reviews: 189, image: "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?w=800", tags: ["SUV", "Luxury", "7-seater"], description: "Popular 7-seat diesel SUV with diff-lock and sunroof. Handles Mara and Amboseli terrain.", lat: -1.3192, lng: 36.9278, scrapedAt: now, source: "legacy" },
      { vertical: "cars", name: "Nissan X-Trail SUV", location: "Pickup in Nairobi", price: 7500, unit: "day", rating: 4.6, reviews: 156, image: "https://images.unsplash.com/photo-1519641471654-76ce0107ad1b?w=800", tags: ["SUV", "Family", "AWD"], description: "5-seat AWD SUV with ample luggage space. Handles light off-road and rough Kenyan roads.", lat: -1.3192, lng: 36.9278, scrapedAt: now, source: "legacy" },
      { vertical: "cars", name: "Toyota Corolla Sedan", location: "Pickup in Nairobi", price: 6000, unit: "day", rating: 4.5, reviews: 312, image: "https://images.unsplash.com/photo-1621453082135-f13a5a3ceee3?w=800", tags: ["Economy", "City", "Business"], description: "Best-selling compact sedan in Kenya. Excellent fuel economy for city driving.", lat: -1.2864, lng: 36.8172, scrapedAt: now, source: "legacy" },
      { vertical: "cars", name: "Toyota Vitz Hatchback", location: "Pickup in Westlands", price: 3800, unit: "day", rating: 4.4, reviews: 267, image: "https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800", tags: ["Budget", "Economy", "City"], description: "Most economical rental option. Compact 5-seater for solo travellers and city commutes.", lat: -1.2677, lng: 36.8033, scrapedAt: now, source: "legacy" },
      { vertical: "cars", name: "Toyota Hiace Minibus", location: "Pickup in Nairobi", price: 12000, unit: "day", rating: 4.5, reviews: 178, image: "https://images.unsplash.com/photo-1583071299210-c6c0a2b45411?w=800", tags: ["Group", "Airport", "Chauffeur"], description: "Air-conditioned 12-14 seater minibus. Ideal for group transfers and airport shuttles.", lat: -1.3192, lng: 36.9278, scrapedAt: now, source: "legacy" },
      { vertical: "cars", name: "Safari Minibus Pop-up Roof", location: "Pickup in Nairobi", price: 20000, unit: "day", rating: 4.7, reviews: 298, image: "https://images.unsplash.com/photo-1594252233360-6e9ea2b398b7?w=800", tags: ["Safari", "Group", "Pop-up roof"], description: "Modified HiAce with pop-up roof for game viewing. Includes driver-guide.", lat: -1.3192, lng: 36.9278, scrapedAt: now, source: "legacy" },
      { vertical: "cars", name: "Mercedes E-Class Executive", location: "Pickup in Nairobi", price: 18500, unit: "day", rating: 4.9, reviews: 89, image: "https://images.unsplash.com/photo-1583121274602-3e2820c69888?w=800", tags: ["Luxury", "Executive", "VIP"], description: "Premium executive sedan with leather interior. Ideal for VIP transfers and corporate events.", lat: -1.3192, lng: 36.9278, scrapedAt: now, source: "legacy" },
    ],
  }
  return (all[vertical] || []).map((item) => ({ ...item, scrapedAt: now, source: "legacy" }))
}

export const scrapeVertical = internalAction({
  args: { vertical: v.string() },
  handler: async (ctx, { vertical }) => {
    const now = Date.now()
    let scraped: any[] = []

    if (vertical === "attractions") {
      try {
        const wikiResults = await scrapeAttractions("Kenya")
        if (wikiResults.length) {
          scraped = wikiResults.map((r) => ({
            vertical: "attractions",
            name: r.name,
            location: r.location,
            price: r.price,
            unit: r.unit,
            rating: r.rating,
            reviews: r.reviews,
            image: r.image,
            tags: r.tags,
            description: r.description,
            lat: r.lat,
            lng: r.lng,
            scrapedAt: now,
            source: "legacy",
          }))
        }
      } catch (e) {
        console.error("Wikipedia scrape failed:", e)
      }
    }

    if (vertical === "taxis") {
      try {
        const taxiResults = estimateTaxiFromQuery("JKIA")
        if (taxiResults.length) {
          scraped = taxiResults.map((r) => ({
            vertical: "taxis",
            name: r.name,
            location: r.location,
            price: r.price,
            unit: r.unit,
            rating: r.rating,
            reviews: r.reviews,
            image: r.image,
            tags: r.tags,
            description: r.description,
            lat: r.lat,
            lng: r.lng,
            scrapedAt: now,
            source: "legacy",
          }))
        }
      } catch (e) {
        console.error("Taxi estimate failed:", e)
      }
    }

    if (!scraped.length) {
      scraped = getFallbackData(vertical)
    }

    if (scraped.length > 0) {
      try {
        await ctx.runMutation(api.listings.upsertScraped, { vertical, items: scraped })
      } catch (e) {
        console.error("Failed to store scraped data:", e)
      }
    }
  },
})
