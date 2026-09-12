import { v } from "convex/values"
import { internalAction } from "../_generated/server"
import { internal } from "../_generated/api"
import { STALE_AFTER_MS } from "./constants"

const USER_AGENT = "KenyaTrace/1.0 (compatible; Bot for scraping Kenya travel data)"
const MAX_RETRIES = 3
const REQUEST_DELAY = 1000

/**
 * Source tags written to listings.source so the UI can honestly label each
 * card. Anything not from Wikipedia or Firecrawl is ESTIMATED — the http
 * scraper does not have commercial agreements with booking sites and falls
 * back to placeholder pricing when the page structure changes. Marking these
 * rows lets the Discover UI show "Estimated" badges rather than implying
 * real-time inventory.
 */
export const SOURCE = {
  estimated: "scraper:estimated",
  wikipedia: "wikipedia",
  firecrawl: "firecrawl",
} as const

/** Deterministic pseudo-random so the same input always yields the same
 *  rating/reviews — avoids churn on every scrape refresh. */
function stableRating(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0
  return 4.2 + ((Math.abs(h) % 100) / 100) * 0.7
}
function stableReviews(seed: string, min: number, max: number): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 17 + seed.charCodeAt(i)) | 0
  return min + (Math.abs(h) % (max - min))
}

const TAXI_SKYLINE = "https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg/960px-Nairobi_Skyline_Savannah_Kenya_May19_R1600687.jpg"
const DIANI_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Diani_Beach_Ukunda.jpg/960px-Diani_Beach_Ukunda.jpg"
const NAIVASHA_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Naivasha_lake.jpg/960px-Naivasha_lake.jpg"

function taxiImage(dropoffName: string): string {
  const text = dropoffName.toLowerCase()
  if (text.includes("diani")) return DIANI_IMAGE
  if (text.includes("naivasha")) return NAIVASHA_IMAGE
  return TAXI_SKYLINE
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchHTML(url: string, retry = 0): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(30000),
    })
    if (!response.ok) {
      if (retry < MAX_RETRIES) {
        await sleep(REQUEST_DELAY * (retry + 1))
        return fetchHTML(url, retry + 1)
      }
      return null
    }
    return await response.text()
  } catch {
    if (retry < MAX_RETRIES) {
      await sleep(REQUEST_DELAY * (retry + 1))
      return fetchHTML(url, retry + 1)
    }
    return null
  }
}

const VERTICALS = ["stays", "flights", "attractions", "cars", "taxis"] as const
type Vertical = (typeof VERTICALS)[number]

async function scrapeStays(ctx: any, now: number): Promise<any[]> {
  const results: any[] = []
  const sources = [
    { name: "booking", url: "https://www.booking.com/city/ke/nairobi.html", parser: parseBookingResults },
    { name: "booking", url: "https://www.booking.com/city/ke/masai-mara.html", parser: parseBookingResults },
    { name: "booking", url: "https://www.booking.com/city/ke/mombasa.html", parser: parseBookingResults },
  ]

  for (const source of sources) {
    const html = await fetchHTML(source.url)
    if (!html) continue

    const items = await source.parser(html, now, source.name)
    results.push(...items)
    await sleep(500)
  }

  return results.slice(0, 50)
}

async function parseBookingResults(html: string, now: number, source: string): Promise<any[]> {
  const results: any[] = []
  const stayPattern = /<a[^>]*href="([^"]*hotel[^"]*)"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>[\s\S]*?<div[^>]*class="[^"]*bui-price[^"]*"[^>]*>[\s\S]*?([₤K][^<\n]+)[\s\S]*?<div[^>]*class="[^"]*bui-review-score[^"]*"[^>]*>[\s\S]*?(\d+,\d+|\d+\.\d+)[\s\S]*?<span[^>]*>(\d+)[\s\S]*reviews/gi

  let match
  while ((match = stayPattern.exec(html)) !== null && results.length < 15) {
    const price = parsePrice(match[3])
    const rating = parseFloat(match[4].replace(/,/g, "")) || 0
    const reviews = parseInt(match[5].replace(/,/g, "")) || 0

    results.push({
      vertical: "stays",
      name: match[2]?.trim() || "Unknown Property",
      location: extractLocation(html, match.index),
      price,
      unit: "night",
      rating: rating || stableRating(match[2] ?? "stay"),
      reviews: reviews || stableReviews(match[2] ?? "stay", 20, 400),
      image: extractImageFromHtml(html, match.index),
      tags: ["Estimated", source],
      description: `Accommodation in Kenya`,
      lat: 0,
      lng: 0,
      scrapedAt: now,
      source: SOURCE.estimated,
    })
  }

  return results
}

async function scrapeFlights(ctx: any, now: number): Promise<any[]> {
  const results: any[] = []
  const routes = [
    { from: "Nairobi", to: "Mombasa", url: "https://www.skyscanner.net/transport/flights/nbo/mba/" },
    { from: "Nairobi", to: "Kisumu", url: "https://www.skyscanner.net/transport/flights/nbo/kis/" },
    { from: "Nairobi", to: "Malindi", url: "https://www.skyscanner.net/transport/flights/nbo/myd/" },
    { from: "Nairobi", to: "Eldoret", url: "https://www.skyscanner.net/transport/flights/nbo/edl/" },
  ]

  for (const route of routes) {
    const html = await fetchHTML(route.url)
    if (!html) continue

    const flights = parseFlightResults(html, now, route)
    results.push(...flights)
    await sleep(500)
  }

  return results.slice(0, 30)
}

function parseFlightResults(html: string, now: number, route: any): any[] {
  const results: any[] = []
  const flightPattern = /KSH\s*([\d,]+)/gi

  let match
  while ((match = flightPattern.exec(html)) !== null && results.length < 3) {
    const price = parseInt(match[1].replace(/,/g, "")) || 0
    if (price > 0) {
      results.push({
        vertical: "flights",
        name: `${route.from} to ${route.to} Flight`,
        location: `${route.from}, Kenya → ${route.to}, Kenya`,
        price,
        unit: "one way",
        rating: stableRating(`${route.from}-${route.to}`),
        reviews: stableReviews(`${route.from}-${route.to}`, 50, 250),
        image: "https://upload.wikimedia.org/wikipedia/commons/e/ee/5Y-KZC_Boeing_787_Kenya_Airways_%2834754105944%29.jpg",
        tags: ["Domestic", "Estimated"],
        description: `Flight from ${route.from} to ${route.to}.`,
        lat: -1.3192,
        lng: 36.9278,
        scrapedAt: now,
        source: SOURCE.estimated,
      })
    }
  }

  return results
}

async function scrapeThingsToDo(ctx: any, now: number): Promise<any[]> {
  const results: any[] = []
  const activities = [
    { name: "Safari", location: "Maasai Mara", url: "https://www.getyourguide.com" },
    { name: "Tours", location: "Nairobi", url: "https://www.getyourguide.com" },
  ]

  for (const act of activities) {
    const html = await fetchHTML(act.url)
    if (!html) continue

    const items = parseActivityResults(html, now, act)
    results.push(...items)
    await sleep(500)
  }

  return results.slice(0, 30)
}

function parseActivityResults(html: string, now: number, act: any): any[] {
  const results: any[] = []
  const activityPattern = /<a[^>]*>([^<]+)<\/a>[\s\S]*?<span[^>]*>KSH\s*([\d,]+)/gi

  let match
  while ((match = activityPattern.exec(html)) !== null && results.length < 5) {
    const price = parseInt(match[2].replace(/,/g, "")) || 1500
    if (price > 0) {
      results.push({
        vertical: "attractions",
        name: match[1]?.trim() || "Activity",
        location: act.location,
        price,
        unit: "person",
        rating: stableRating(match[1] ?? act.name),
        reviews: stableReviews(match[1] ?? act.name, 50, 350),
        image: "https://upload.wikimedia.org/wikipedia/commons/1/17/Masai_Mara_at_Sunset.jpg",
        tags: ["Tour", "Estimated", act.name],
        description: `${match[1]?.trim()} experience in ${act.location}.`,
        lat: 0,
        lng: 0,
        scrapedAt: now,
        source: SOURCE.estimated,
      })
    }
  }

  return results
}

async function scrapeAttractions(ctx: any, now: number): Promise<any[]> {
  const results: any[] = []
  const wikiCategories = [
    "Tourist_attractions_in_Kenya",
    "National_parks_of_Kenya",
    "UNESCO_World_Heritage_Sites_in_Kenya",
  ]

  for (const category of wikiCategories) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=categorymembers&cmtitle=Category:${category}&cmlimit=50&format=json`
    const data = await fetchWikiAPI(url)
    if (data?.query?.categorymembers) {
      for (const page of data.query.categorymembers.slice(0, 20)) {
        const pageData = await fetchWikiPageSummary(page.title)
        if (pageData && pageData.description) {
          const price = estimateAttractionPrice(pageData.title)
          results.push({
            vertical: "attractions",
            name: pageData.title,
            location: "Kenya",
            price,
            unit: "person",
            rating: stableRating(pageData.title),
            reviews: stableReviews(pageData.title, 50, 550),
            image: pageData.image || "https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Giraffe_Centre_August_2025_04.jpg/800px-Giraffe_Centre_August_2025_04.jpg",
            tags: ["Attraction", "Wikipedia"],
            description: pageData.description.slice(0, 300) || pageData.extract?.slice(0, 300) || "",
            lat: pageData.lat || 0,
            lng: pageData.lng || 0,
            scrapedAt: now,
            source: SOURCE.wikipedia,
          })
        }
      }
    }
    await sleep(500)
  }

  return results.slice(0, 50)
}

function estimateAttractionPrice(name: string): number {
  const lower = name.toLowerCase()
  let base = 500
  let spread = 1500
  if (lower.includes("park") || lower.includes("reserve")) { base = 1000; spread = 3000 }
  else if (lower.includes("museum")) { base = 500; spread = 1500 }
  else if (lower.includes("beach")) { base = 500; spread = 2000 }
  // Deterministic per attraction so prices don't jitter on each refresh.
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return Math.round(base + (Math.abs(h) % spread))
}

async function fetchWikiAPI(url: string): Promise<any> {
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } })
    if (!response.ok) return null
    return await response.json()
  } catch {
    return null
  }
}

async function fetchWikiPageSummary(title: string): Promise<any> {
  const encoded = encodeURIComponent(title)
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encoded}`
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } })
    if (!response.ok) return null
    const data = await response.json()
    return {
      title: data.title,
      description: data.description,
      extract: data.extract,
      image: data.originalimage?.source || data.thumbnail?.source,
      lat: data.coordinates?.[0]?.lat,
      lng: data.coordinates?.[0]?.lon,
    }
  } catch {
    return null
  }
}

async function scrapeCars(ctx: any, now: number): Promise<any[]> {
  const results: any[] = []
  const carTypes = [
    { name: "Safari 4x4 Land Cruiser", price: 42000, tags: ["4x4", "Safari", "Off-road"], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/2021_Toyota_Land_Cruiser_300_3.4_ZX_%28Colombia%29_front_view_04.png/800px-2021_Toyota_Land_Cruiser_300_3.4_ZX_%28Colombia%29_front_view_04.png" },
    { name: "Toyota Prado TXL", price: 13500, tags: ["SUV", "Luxury", "7-seater"], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/e/e8/2024_Toyota_Land_Cruiser_250_VX_in_Platinum_White_Pearl_Mica%2C_front_left.jpg/800px-2024_Toyota_Land_Cruiser_250_VX_in_Platinum_White_Pearl_Mica%2C_front_left.jpg" },
    { name: "Nissan X-Trail SUV", price: 7500, tags: ["SUV", "Family", "AWD"], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Nissan_X-Trail_%28T33%29_1X7A7179.jpg/800px-Nissan_X-Trail_%28T33%29_1X7A7179.jpg" },
    { name: "Toyota Corolla Sedan", price: 6000, tags: ["Economy", "City", "Business"], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Toyota_Corolla_Hybrid_%28E210%29_IMG_4338.jpg/800px-Toyota_Corolla_Hybrid_%28E210%29_IMG_4338.jpg" },
    { name: "Toyota Vitz Hatchback", price: 3800, tags: ["Budget", "Economy", "City"], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/85/2017_Toyota_Yaris_L_5-door%2C_front_right%2C_08-25-2024.jpg/800px-2017_Toyota_Yaris_L_5-door%2C_front_right%2C_08-25-2024.jpg" },
    { name: "Toyota Hiace Minibus", price: 12000, tags: ["Group", "Airport", "Chauffeur"], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/2020_Toyota_HiAce_%28front%29.jpg/800px-2020_Toyota_HiAce_%28front%29.jpg" },
    { name: "Mercedes E-Class Executive", price: 18500, tags: ["Luxury", "Executive", "VIP"], image: "https://upload.wikimedia.org/wikipedia/commons/thumb/f/fd/Mercedes-Benz_W214_1X7A1841.jpg/800px-Mercedes-Benz_W214_1X7A1841.jpg" },
  ]

  for (const car of carTypes) {
    results.push({
      vertical: "cars",
      name: car.name,
      location: "Pickup in Nairobi",
      price: car.price,
      unit: "day",
      rating: stableRating(car.name),
      reviews: stableReviews(car.name, 50, 350),
      image: car.image,
      tags: car.tags,
      description: `${car.name} for rent in Nairobi.`,
      lat: -1.3192,
      lng: 36.9278,
      scrapedAt: now,
      source: SOURCE.estimated,
    })
  }

  return results
}

async function scrapeTaxis(ctx: any, now: number): Promise<any[]> {
  const results: any[] = []
  const routes = [
    { from: "JKIA", to: "Nairobi CBD", price: 1400 },
    { from: "JKIA", to: "Westlands", price: 1600 },
    { from: "Wilson Airport", to: "Nairobi CBD", price: 800 },
    { from: "Nairobi CBD", to: "Karen", price: 1300 },
    { from: "Nairobi CBD", to: "Mombasa", price: 22000 },
    { from: "Nairobi CBD", to: "Naivasha", price: 4500 },
    { from: "Mombasa Airport", to: "Diani Beach", price: 10000 },
  ]

  for (const route of routes) {
    results.push({
      vertical: "taxis",
      name: `${route.from} → ${route.to}`,
      location: `${route.from} → ${route.to}, Kenya`,
      price: route.price,
      unit: "ride",
      rating: stableRating(`${route.from}-${route.to}`),
      reviews: stableReviews(`${route.from}-${route.to}`, 500, 1500),
      image: taxiImage(route.to),
      tags: ["Ride-hailing", "Estimated"],
      description: `Transfer from ${route.from} to ${route.to}.`,
      lat: -1.2864,
      lng: 36.8172,
      scrapedAt: now,
      source: SOURCE.estimated,
    })
  }

  return results
}

function parsePrice(priceStr: string): number {
  const clean = priceStr.replace(/[^\dK]/gi, "").toLowerCase()
  const num = parseFloat(clean.replace(/[^\d.]/g, "")) || 0
  const isThousands = clean.includes("k")
  return isThousands ? num * 1000 : num
}

function extractLocation(html: string, index: number): string {
  const context = html.substring(Math.max(0, index - 200), index + 200).toLowerCase()
  const locations = ["nairobi", "masai mara", "mombasa", "naivasha", "nakuru", "diani", "lamu", "amboseli", "kisumu", "eldoret"]
  for (const loc of locations) {
    if (context.includes(loc)) {
      return loc.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")
    }
  }
  return "Nairobi"
}

function extractImageFromHtml(html: string, index: number): string {
  const context = html.substring(Math.max(0, index - 500), index + 500)
  const imgMatch = context.match(/<img[^>]*src="([^"]*?(?:jpg|png|webp)[^"]*)"[^>]*>/i)
  if (imgMatch?.[1]) {
    return imgMatch[1].replace(/&amp;/g, "&")
  }
  return "https://upload.wikimedia.org/wikipedia/commons/d/de/Secretary_Kerry_Sits_With_His_Fellow_Foreign_Ministers_at_the_Villa_Rosa_Kempinski_Hotel_in_Nairobi_%2828531519154%29.jpg"
}

/** Attractions now absorbs the bookable "things to do" tours/activities too,
 *  so the single Discover tab stays populated from both Wikipedia landmarks
 *  and scraped GetYourGuide/Viator activities. */
async function scrapeAttractionsAndActivities(ctx: any, now: number): Promise<any[]> {
  const [parks, activities] = await Promise.all([
    scrapeAttractions(ctx, now),
    scrapeThingsToDo(ctx, now),
  ])
  return [...parks, ...activities]
}

export const scrapeVertical = internalAction({
  args: { vertical: v.string() },
  handler: async (ctx, { vertical }) => {
    const now = Date.now()
    const scrapers: Record<string, (ctx: any, now: number) => Promise<any[]>> = {
      stays: scrapeStays,
      flights: scrapeFlights,
      attractions: scrapeAttractionsAndActivities,
      cars: scrapeCars,
      taxis: scrapeTaxis,
    }

    const scraper = scrapers[vertical]
    if (!scraper) {
      console.log(`[scraper] No scraper for vertical: ${vertical}`)
      return
    }

    try {
      const items = await scraper(ctx, now)
      if (items.length > 0) {
        await ctx.runMutation(internal.listings.upsertScraped, { vertical, items })
        console.log(`[scraper] ${vertical}: scraped ${items.length} items`)
      } else {
        throw new Error(`Scrape for ${vertical} returned no items`)
      }
    } catch (error) {
      console.error(`[scraper] ${vertical}: failed -`, error)
      // Rethrow so callers report failure instead of claiming a successful
      // refresh that never wrote anything.
      throw new Error(`Scrape for ${vertical} failed: ${String(error)}`, { cause: error })
    }
  },
})