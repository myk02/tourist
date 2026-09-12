import type { MetadataRoute } from 'next'

/**
 * PWA identity. The in-trip audience installs KenyaTrace to their home
 * screen so the itinerary and live trace are one tap away on the road —
 * the manifest makes that installable and gives it a proper app shell.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'KenyaTrace — Travel Kenya your way',
    short_name: 'KenyaTrace',
    description: 'Discover, plan, book and trace unforgettable journeys across Kenya.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f7f8f4',
    theme_color: '#0e7a55',
    categories: ['travel', 'navigation'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Plan a trip', url: '/plan', description: 'Start a new Kenya itinerary' },
      { name: 'Live trace', url: '/trips', description: 'Open your trips and live track' },
    ],
  }
}
