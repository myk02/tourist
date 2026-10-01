import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://kenyatrace.vercel.app'
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private trip space, token calendar feeds and APIs are never crawled.
        disallow: ['/api/', '/trips/', '/moments/', '/profile', '/trace/', '/recap/'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  }
}
