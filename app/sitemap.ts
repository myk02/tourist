import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://kenyatrace.vercel.app'
  const now = new Date()
  // Public-only: authenticated trip space (/trips, /moments, /profile) must
  // never be crawled — it 404s/redirects for bots and dilutes SEO.
  // Note: /discover is a redirect to /discover/stays — never list redirects.
  const routes = ['', '/plan', '/discover/stays', '/discover/flights', '/discover/attractions', '/discover/cars', '/discover/taxis', '/terms', '/privacy']
  return routes.map(r => ({
    url: `${base}${r || '/'}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: r === '' ? 1 : 0.7,
  }))
}
