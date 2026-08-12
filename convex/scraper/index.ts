import { v } from "convex/values"
import { action, query } from "../_generated/server"
import { api, internal } from "../_generated/api"
import { STALE_AFTER_MS } from "./constants"

const VERTICALS = ["stays", "flights", "things-to-do", "attractions", "cars", "taxis"] as const
type Vertical = (typeof VERTICALS)[number]

export const searchWithScrape = action({
  args: { vertical: v.string() },
  handler: async (ctx, { vertical }) => {
    const items: any[] = await ctx.runQuery(api.listings.list, { vertical })
    const now = Date.now()
    const hasFresh = items?.some(
      (i: any) => i.scrapedAt !== undefined && now - i.scrapedAt < STALE_AFTER_MS,
    )
    if (hasFresh) {
      console.log(`[scraper] ${vertical}: fresh data exists, skipping scrape`)
      return { status: "skipped", reason: "fresh_data" }
    }

    // Prefer Firecrawl (richer, LLM-extracted listings) when the key is set,
    // and fall back to the built-in http scraper on any failure.
    if (process.env.FIRECRAWL_API_KEY) {
      try {
        console.log(`[scraper] ${vertical}: starting Firecrawl scrape`)
        const result = await ctx.runAction(internal.scraper.firecrawl.scrapeVertical, { vertical })
        return { status: "completed", source: "firecrawl", ...result }
      } catch (error) {
        console.error(`[scraper] ${vertical}: Firecrawl failed (${String(error)}), falling back to http scraper`)
      }
    }
    console.log(`[scraper] ${vertical}: starting http scrape`)
    await ctx.runAction(internal.scraper.http_scraper.scrapeVertical, { vertical })
    return { status: "completed", source: "http" }
  },
})

export const scrapeAll = action({
  args: {},
  handler: async (ctx) => {
    const results: Record<string, any> = {}
    for (const vertical of VERTICALS) {
      try {
        const result = await ctx.runAction(internal.scraper.index.searchWithScrape, { vertical })
        results[vertical] = result
      } catch (error) {
        console.error(`[scrapeAll] ${vertical} failed:`, error)
        results[vertical] = { status: "failed", error: String(error) }
      }
    }
    return results
  },
})

export const clearAndRescrape = action({
  args: { vertical: v.string() },
  handler: async (ctx, { vertical }) => {
    if (!VERTICALS.includes(vertical as Vertical)) {
      return { status: "skipped", reason: "invalid_vertical" }
    }

    await ctx.runMutation(api.listings.clearVertical, { vertical })
    console.log(`[scraper] ${vertical}: cleared, starting fresh scrape`)

    if (process.env.FIRECRAWL_API_KEY) {
      try {
        const result = await ctx.runAction(internal.scraper.firecrawl.scrapeVertical, { vertical })
        return { status: "completed", source: "firecrawl", ...result }
      } catch (error) {
        console.error(`[scraper] ${vertical}: Firecrawl failed (${String(error)}), falling back to http scraper`)
      }
    }
    await ctx.runAction(internal.scraper.http_scraper.scrapeVertical, { vertical })
    return { status: "completed", source: "http" }
  },
})

export const getScrapeStatus = query({
  args: {},
  handler: async (ctx) => {
    const status: Record<string, any> = {}
    const now = Date.now()

    for (const vertical of VERTICALS) {
      const items = await ctx.runQuery(api.listings.list, { vertical })
      if (!items || items.length === 0) {
        status[vertical] = { count: 0, stale: true, lastScraped: null }
        continue
      }
      const newest = Math.max(...items.map((i: any) => i.scrapedAt || 0))
      status[vertical] = {
        count: items.length,
        stale: now - newest > STALE_AFTER_MS,
        lastScraped: newest,
      }
    }
    return status
  },
})