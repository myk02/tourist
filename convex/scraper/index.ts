import { v } from "convex/values"
import { action, internalAction } from "../_generated/server"
import { api, internal } from "../_generated/api"
import { STALE_AFTER_MS } from "./constants"

export const searchWithScrape = action({
  args: { vertical: v.string() },
  handler: async (ctx, { vertical }) => {
    const items: any[] = await ctx.runQuery(api.listings.list, { vertical })
    const now = Date.now()
    const hasFresh = items.some(
      (i: any) => i.scrapedAt !== undefined && now - i.scrapedAt < STALE_AFTER_MS,
    )
    if (hasFresh) {
      console.log(`[scraper] ${vertical}: fresh data exists, skipping scrape`)
      return
    }

    console.log(`[scraper] ${vertical}: starting scrape (stale or empty)`)

    if (vertical === "taxis") {
      try {
        await ctx.runAction(internal.scraper.legacy.scrapeVertical, { vertical })
        console.log(`[scraper] ${vertical}: legacy scrape succeeded`)
      } catch (err) {
        console.error(`[scraper] ${vertical}: legacy scrape failed`, err)
      }
      return
    }

    try {
      await ctx.runAction(internal.scraper.firecrawl.scrapeVertical, { vertical })
      console.log(`[scraper] ${vertical}: Firecrawl scrape succeeded`)
    } catch (err) {
      console.error(`[scraper] ${vertical}: Firecrawl failed, falling back to legacy scraper`, err)
      try {
        await ctx.runAction(internal.scraper.legacy.scrapeVertical, { vertical })
        console.log(`[scraper] ${vertical}: legacy fallback scrape succeeded`)
      } catch (fallbackErr) {
        console.error(`[scraper] ${vertical}: legacy fallback also failed`, fallbackErr)
      }
    }
  },
})

export const seedAll = internalAction({
  handler: async (ctx) => {
    const verticals = ["stays", "flights", "things-to-do", "attractions", "cars", "taxis"]
    for (const vertical of verticals) {
      console.log(`[seedAll] Seeding ${vertical}...`)
      try {
        await ctx.runAction(internal.scraper.index.searchWithScrape, { vertical })
        console.log(`[seedAll] ${vertical} done`)
      } catch (err) {
        console.error(`[seedAll] ${vertical} failed`, err)
      }
    }
    console.log("[seedAll] All verticals seeded")
  },
})
