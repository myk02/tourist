import { v } from "convex/values"
import { action, internalAction, query } from "../_generated/server"
import { api, internal } from "../_generated/api"
import { makeFunctionReference } from "convex/server"
import { STALE_AFTER_MS } from "./constants"

const VERTICALS = ["stays", "flights", "attractions", "cars", "taxis"] as const
type Vertical = (typeof VERTICALS)[number]

// Real reference to this module's own action, built by path so that
// `scrapeAll`/`clearAndRescrape` don't create a type-inference cycle (the
// `internal.*` proxy would also resolve it at runtime, but the self-reference
// breaks TS inference here).
const searchWithScrapeRef = makeFunctionReference<
  "action",
  { vertical: string },
  Record<string, unknown>
>("scraper/index/searchWithScrape")

export const searchWithScrape = action({
  args: { vertical: v.string() },
  // Explicit return type breaks the self-reference cycle: the handler calls
  // searchWithScrapeRef (itself), so without the annotation TS can't infer
  // this type without recursing and gives up with `any`/TS7022.
  handler: async (ctx, { vertical }): Promise<Record<string, unknown>> => {
    // Scraping burns paid Firecrawl quota — never let anonymous traffic
    // trigger it. Signed-in users still get auto-refreshed listings.
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return { status: "skipped", reason: "unauthenticated" }

    const items: any[] = await ctx.runQuery(api.listings.list, { vertical })
    const now = Date.now()
    const hasFresh = items?.some(
      (i: any) => i.scrapedAt !== undefined && now - i.scrapedAt < STALE_AFTER_MS,
    )
    if (hasFresh) {
      console.log(`[scraper] ${vertical}: fresh data exists, skipping scrape`)
      return { status: "skipped", reason: "fresh_data" }
    }
    // A catalog that only contains seeded/curated rows (no scrapedAt) is
    // intentional content, not stale data — scraping it on every visit would
    // spend API budget re-fetching what we already show. Only catalogs that
    // were scraped before get refreshed; empty catalogs bootstrap below.
    const hasScraped = items?.some((i: any) => i.scrapedAt !== undefined)
    if (!hasScraped && (items?.length ?? 0) > 0) {
      console.log(`[scraper] ${vertical}: curated-only catalog, skipping scrape`)
      return { status: "skipped", reason: "curated_data" }
    }

    // Prefer Firecrawl (richer, LLM-extracted listings) when the key is set,
    // and fall back to the built-in http scraper on any failure.
    if (process.env.FIRECRAWL_API_KEY) {
      try {
        console.log(`[scraper] ${vertical}: starting Firecrawl scrape`)
        const result: Record<string, unknown> = await ctx.runAction(internal.scraper.firecrawl.scrapeVertical, { vertical })
        return { status: "completed", source: "firecrawl", ...result }
      } catch (error) {
        console.error(`[scraper] ${vertical}: Firecrawl failed (${String(error)}), falling back to http scraper`)
      }
    }
    console.log(`[scraper] ${vertical}: starting http scrape`)
    try {
      await ctx.runAction(internal.scraper.http_scraper.scrapeVertical, { vertical })
      return { status: "completed", source: "http" }
    } catch (error) {
      console.error(`[scraper] ${vertical}: http scrape failed -`, error)
      return { status: "failed", source: "http", error: String(error) }
    }
  },
})

export const scrapeAll = internalAction({
  args: {},
  handler: async (ctx): Promise<Record<string, unknown>> => {
    const results: Record<string, unknown> = {}
    for (const vertical of VERTICALS) {
      try {
        const result: Record<string, unknown> = await ctx.runAction(searchWithScrapeRef, { vertical })
        results[vertical] = result
      } catch (error) {
        console.error(`[scrapeAll] ${vertical} failed:`, error)
        results[vertical] = { status: "failed", error: String(error) }
      }
    }
    return results
  },
})

export const clearAndRescrape = internalAction({
  args: { vertical: v.string() },
  handler: async (ctx, { vertical }): Promise<Record<string, unknown>> => {
    if (!VERTICALS.includes(vertical as Vertical)) {
      return { status: "skipped", reason: "invalid_vertical" }
    }

    await ctx.runMutation(internal.listings.clearVertical, { vertical })
    console.log(`[scraper] ${vertical}: cleared, starting fresh scrape`)

    if (process.env.FIRECRAWL_API_KEY) {
      try {
        const result: Record<string, unknown> = await ctx.runAction(internal.scraper.firecrawl.scrapeVertical, { vertical })
        return { status: "completed", source: "firecrawl", ...result }
      } catch (error) {
        console.error(`[scraper] ${vertical}: Firecrawl failed (${String(error)}), falling back to http scraper`)
      }
    }
    try {
      await ctx.runAction(internal.scraper.http_scraper.scrapeVertical, { vertical })
      return { status: "completed", source: "http" }
    } catch (error) {
      console.error(`[scraper] ${vertical}: http scrape failed -`, error)
      return { status: "failed", source: "http", error: String(error) }
    }
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
      const hasScraped = items.some((i: any) => i.scrapedAt !== undefined)
      // Curated-only catalogs (seed data) are not stale — they were
      // intentionally never scraped. Only catalogs that were scraped before
      // can become stale.
      if (!hasScraped) {
        status[vertical] = { count: items.length, stale: false, lastScraped: null }
        continue
      }
      const newest = Math.max(...items.filter((i: any) => i.scrapedAt !== undefined).map((i: any) => i.scrapedAt as number))
      status[vertical] = {
        count: items.length,
        stale: now - newest > STALE_AFTER_MS,
        lastScraped: newest,
      }
    }
    return status
  },
})