import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://kenyatrace.vercel.app'
  const now = new Date()
  const routes = ['', '/discover', '/discover/stays', '/discover/flights', '/discover/attractions', '/discover/cars', '/discover/taxis', '/plan', '/trips', '/moments', '/profile']
  return routes.map(r => ({
    url: `${base}${r}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: r === '' ? 1 : 0.7,
  }))
}
