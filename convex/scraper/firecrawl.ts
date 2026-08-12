import { v } from "convex/values"
import { internalAction } from "../_generated/server"
import { api } from "../_generated/api"
import { VERTICAL_CONFIG } from "./verticalConfig"
import { wikimediaThumb } from "../../lib/kenya-data"

const BASE = "https://api.firecrawl.dev/v1"
const MAX_URLS = 50
const EXTRACT_POLL_INTERVAL_MS = 5000
const EXTRACT_POLL_LIMIT = 24 // ~2 minutes max

interface ExtractData {
  success?: boolean
  id?: string
  status?: string
  error?: string
  data?: unknown
}

/** POST helper against the Firecrawl API with bearer auth. */
async function post<T>(path: string, body: Record<string, unknown>, apiKey: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Firecrawl ${path} failed (${response.status}): ${detail.slice(0, 200)}`)
  }
  return (await response.json()) as T
}

/** GET helper against the Firecrawl API with bearer auth (used for job polling). */
async function get<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => "")
    throw new Error(`Firecrawl ${path} failed (${response.status}): ${detail.slice(0, 200)}`)
  }
  return (await response.json()) as T
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Coerces LLM-extracted numeric fields to numbers. Firecrawl often returns
 * prices as strings ("KES 4,500", "$120", "from 2,000") — parse those
 * instead of silently defaulting to 0.
 */
function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = parseFloat(value.replace(/[^0-9.]/g, ""))
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

/**
 * Runs a Firecrawl extract job and waits for completion. Firecrawl's extract
 * endpoint is async for larger URL batches — it returns a job id that must be
 * polled until `status === "completed"`.
 */
async function runExtract(urls: string[], config: (typeof VERTICAL_CONFIG)[string], apiKey: string): Promise<any[]> {
  const job = await post<ExtractData>("/extract", {
    urls,
    prompt: config.extractPrompt,
    schema: config.schema,
  }, apiKey)

  if (job.id) {
    for (let attempt = 0; attempt < EXTRACT_POLL_LIMIT; attempt++) {
      await sleep(EXTRACT_POLL_INTERVAL_MS)
      const result = await get<ExtractData>(`/extract/${job.id}`, apiKey)
      if (result.status === "completed") return Array.isArray(result.data) ? result.data : result.data ? [result.data] : []
      if (result.status === "failed") throw new Error(`Firecrawl extract failed: ${result.error || "unknown error"}`)
    }
    throw new Error("Firecrawl extract timed out")
  }

  // Synchronous completion — data may be an array or a single object.
  return Array.isArray(job.data) ? job.data : job.data ? [job.data] : []
}

/** Normalizes raw Firecrawl extractions into the listings table shape. */
function normalize(raw: any[], vertical: string, now: number): any[] {
  return raw
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map(item => ({
      vertical,
      name: String(item.name ?? "Unknown").slice(0, 200),
      location: String(item.location ?? "Kenya").slice(0, 200),
      price: toNumber(item.price, 0),
      unit: String(item.unit ?? "person").slice(0, 40),
      rating: Math.min(Math.max(toNumber(item.rating, 4.5), 0), 5),
      reviews: Math.max(toNumber(item.reviews, 0), 0),
      image: wikimediaThumb(typeof item.image === "string" ? item.image : ""),
      tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 6) : [],
      description: String(item.description ?? "").slice(0, 600),
      lat: toNumber(item.lat, 0),
      lng: toNumber(item.lng, 0),
      scrapedAt: now,
      source: "firecrawl",
    }))
}

export const scrapeVertical = internalAction({
  args: { vertical: v.string() },
  handler: async (ctx, { vertical }) => {
    const apiKey = process.env.FIRECRAWL_API_KEY
    if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set")
    const config = VERTICAL_CONFIG[vertical]
    if (!config) throw new Error(`No Firecrawl config for vertical: ${vertical}`)

    // 1. Collect candidate URLs from the vertical's search queries.
    const urls = new Set<string>()
    for (const query of config.searchQueries) {
      try {
        const res = await post<{ data?: { url?: string }[] }>("/search", {
          query,
          limit: config.resultsPerQuery,
          lang: "en",
          country: "ke",
        }, apiKey)
        for (const item of res.data ?? []) {
          if (item?.url) urls.add(item.url)
        }
      } catch (error) {
        console.error(`[firecrawl] search failed for query "${query.slice(0, 60)}": ${String(error)}`)
      }
    }
    if (urls.size === 0) throw new Error("Firecrawl search returned no results across all queries")

    const urlList = [...urls].slice(0, MAX_URLS)
    console.log(`[firecrawl] ${vertical}: collected ${urlList.length} unique URLs across ${config.searchQueries.length} queries`)

    // 2. Extract structured listings from those pages.
    const extracted = await runExtract(urlList, config, apiKey)
    const items = normalize(extracted, vertical, Date.now())
    if (items.length === 0) throw new Error("Firecrawl extract returned no data")

    console.log(`[firecrawl] ${vertical}: storing ${items.length} items`)
    const result = await ctx.runMutation(api.listings.upsertScraped, { vertical, items })
    console.log(`[firecrawl] ${vertical}: ${result.inserted} rows upserted`)
    return { status: "completed", stored: items.length }
  },
})
