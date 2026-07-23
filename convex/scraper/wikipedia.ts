const WIKI_API = "https://en.wikipedia.org/w/api.php"
const WIKI_REST = "https://en.wikipedia.org/api/rest_v1"

async function wikiFetch(params: Record<string, string>): Promise<any> {
  const url = new URL(WIKI_API)
  Object.entries({ ...params, format: "json", origin: "*" }).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), { headers: { "User-Agent": "KenyaTrace/1.0" } })
  if (!res.ok) throw new Error(`Wikipedia API error: ${res.status}`)
  return res.json()
}

async function restFetch(path: string): Promise<any> {
  const res = await fetch(`${WIKI_REST}${path}`, { headers: { "User-Agent": "KenyaTrace/1.0" } })
  if (!res.ok) return null
  return res.json()
}

async function searchPages(query: string, limit = 10): Promise<string[]> {
  const data = await wikiFetch({
    action: "query",
    list: "search",
    srsearch: `${query} Kenya tourist attraction`,
    srlimit: String(limit),
  })
  return data.query?.search?.map((s: any) => s.title) || []
}

async function getPageSummary(title: string): Promise<{
  title: string
  description: string
  image: string
  lat: number
  lng: number
  extract: string
} | null> {
  const encoded = encodeURIComponent(title)
  const summary = await restFetch(`/page/summary/${encoded}`)
  if (!summary) return null

  let lat = 0, lng = 0
  if (summary.coordinates?.length) {
    lat = summary.coordinates[0].lat
    lng = summary.coordinates[0].lon
  } else {
    const geo = await restFetch(`/page/coordinates/${encoded}`)
    if (geo?.items?.length) {
      lat = geo.items[0].lat
      lng = geo.items[0].lon
    }
  }

  let image = ""
  if (summary.originalimage?.source) {
    image = summary.originalimage.source
  } else if (summary.thumbnail?.source) {
    image = summary.thumbnail.source
  }

  return {
    title: summary.title,
    description: summary.description || summary.extract?.slice(0, 200) || "",
    extract: summary.extract || "",
    image,
    lat,
    lng,
  }
}

async function searchAttractionsInCategory(category: string): Promise<string[]> {
  const data = await wikiFetch({
    action: "query",
    list: "categorymembers",
    cmtitle: `Category:${category}`,
    cmlimit: "50",
  })
  return data.query?.categorymembers?.map((m: any) => m.title) || []
}

export type ScrapedAttraction = {
  name: string
  location: string
  price: number
  unit: string
  rating: number
  reviews: number
  image: string
  tags: string[]
  description: string
  lat: number
  lng: number
}

export async function scrapeAttractions(location: string): Promise<ScrapedAttraction[]> {
  const results: ScrapedAttraction[] = []
  const seen = new Set<string>()

  const query = location ? `${location} Kenya` : "Kenya"
  const titles = await searchPages(query, 15)

  const kenyaAttractions = await searchAttractionsInCategory("Tourist_attractions_in_Kenya")
  const allTitles = [...new Set([...titles, ...kenyaAttractions])].slice(0, 20)

  for (const title of allTitles) {
    if (seen.has(title.toLowerCase())) continue
    seen.add(title.toLowerCase())

    const page = await getPageSummary(title)
    if (!page || !page.description) continue

    const tags = ["Attraction"]
    const description = page.extract || page.description

    if (description.toLowerCase().includes("park") || description.toLowerCase().includes("reserve")) tags.push("National park")
    if (description.toLowerCase().includes("beach") || description.toLowerCase().includes("coast")) tags.push("Beach")
    if (description.toLowerCase().includes("museum") || description.toLowerCase().includes("heritage")) tags.push("History")
    if (description.toLowerCase().includes("mountain") || description.toLowerCase().includes("hike")) tags.push("Adventure")
    if (description.toLowerCase().includes("hotel") || description.toLowerCase().includes("lodge")) tags.push("Stay")

    results.push({
      name: page.title,
      location: `Kenya${location ? `, ${location}` : ""}`,
      price: Math.floor(Math.random() * 5000) + 500,
      unit: "person",
      rating: +(3.5 + Math.random() * 1.5).toFixed(1),
      reviews: Math.floor(Math.random() * 800) + 50,
      image: page.image || `https://images.unsplash.com/photo-1547471080-7cc2caa01a7e?w=800`,
      tags,
      description: description.slice(0, 300),
      lat: page.lat,
      lng: page.lng,
    })
  }

  return results
}
