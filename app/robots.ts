import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://kenyatrace.vercel.app'
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/moments/', '/trace/', '/recap/'],
        // Private trip space, token calendar feeds and APIs are never crawled.
        // Public share pages (/moments/[tripId], /trace/[id], /recap/[tripId])
        // stay crawlable so shared trips can index.
        disallow: ['/api/', '/trips', '/profile'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
