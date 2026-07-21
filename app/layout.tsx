import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { DM_Sans, Lora } from 'next/font/google'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Providers } from '@/components/providers'
import './globals.css'

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const serif = Lora({ subsets: ['latin'], variable: '--font-lora' })

export const metadata: Metadata = {
  title: { default: 'KenyaTrace — Travel Kenya your way', template: '%s · KenyaTrace' },
  description: 'Discover, plan, book and trace unforgettable journeys across Kenya.',
}

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#0B6E4F',
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`bg-background ${sans.variable} ${serif.variable}`}><body className="font-sans antialiased"><Providers><TooltipProvider>{children}</TooltipProvider><Toaster richColors position="top-center" />{process.env.NODE_ENV === 'production' && <Analytics />}</Providers></body></html>
}
