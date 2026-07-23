"use node";
import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import { VERTICAL_CONFIG } from "./verticalConfig";
import { STALE_AFTER_MS } from "./constants";

const BASE = "https://api.firecrawl.dev/v1";

async function geocodeLocation(location: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url =
      "https://nominatim.openstreetmap.org/search?" +
      new URLSearchParams({ q: location + ", Kenya", format: "json", limit: "1" }).toString();
    const res = await fetch(url, { headers: { "User-Agent": "KenyaTrace/1.0" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lng) };
  } catch {
    return null;
  }
}

function extractItems(data: unknown): any[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object" && "data" in (data as any)) {
    const nested = (data as any).data;
    if (Array.isArray(nested)) return nested;
  }
  return [];
}

export const scrapeVertical = internalAction({
  args: { vertical: v.string() },
  handler: async (ctx, { vertical }) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set");

    const config = VERTICAL_CONFIG[vertical];
    if (!config) throw new Error(`No Firecrawl config for vertical: ${vertical}`);

    const headers = { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };

    const allUrls = new Set<string>();

    for (const query of config.searchQueries) {
      try {
        const searchRes = await fetch(`${BASE}/search`, {
          method: "POST",
          headers,
          body: JSON.stringify({ query, limit: config.resultsPerQuery }),
        });
        if (!searchRes.ok) {
          console.error(`[firecrawl] search failed for query "${query.slice(0, 60)}": ${searchRes.status}`);
          continue;
        }
        const body = await searchRes.json();
        const results: { url: string }[] = body.data || [];
        for (const r of results) {
          if (r.url) allUrls.add(r.url);
        }
      } catch (e) {
        console.error(`[firecrawl] search error for query "${query.slice(0, 60)}":`, e);
      }
    }

    if (!allUrls.size) throw new Error("Firecrawl search returned no results across all queries");

    const urls = [...allUrls];
    console.log(`[firecrawl] ${vertical}: collected ${urls.length} unique URLs across ${config.searchQueries.length} queries`);

    let extracted: any[] = [];

    const tryExtract = async (targetUrls: string[]): Promise<any[]> => {
      const res = await fetch(`${BASE}/extract`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          urls: targetUrls,
          schema: config.schema,
          prompt: config.extractPrompt,
        }),
      });
      if (!res.ok) {
        console.error(`[firecrawl] extract failed (${res.status}) for ${targetUrls.length} URLs`);
        return [];
      }
      const body = await res.json();
      return extractItems(body.data || body);
    };

    extracted = await tryExtract(urls);

    if (!extracted.length) {
      for (const url of urls) {
        const items = await tryExtract([url]);
        if (items.length) {
          extracted.push(...items);
        }
      }
    }

    if (!extracted.length) throw new Error("Firecrawl extract returned no data");

    const now = Date.now();
    const enriched = [];
    for (const item of extracted) {
      const hasCoords = item.lat && item.lng && item.lat !== 0 && item.lng !== 0;
      let lat = item.lat || 0;
      let lng = item.lng || 0;
      if (!hasCoords && item.location) {
        const coords = await geocodeLocation(item.location);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }
      enriched.push({
        vertical,
        name: String(item.name || ""),
        location: String(item.location || ""),
        price: Number(item.price) || 0,
        unit: String(item.unit || "person"),
        rating: Number(item.rating) || 0,
        reviews: Number(item.reviews) || 0,
        image: String(item.image || ""),
        tags: Array.isArray(item.tags) ? item.tags.map(String) : [],
        description: String(item.description || ""),
        lat,
        lng,
        scrapedAt: now,
        source: "firecrawl",
      });
    }

    if (enriched.length) {
      console.log(`[firecrawl] ${vertical}: storing ${enriched.length} items`);
      await ctx.runMutation(api.listings.upsertScraped, { vertical, items: enriched });
    }
  },
});
