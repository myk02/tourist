import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { DM_Sans, Lora } from 'next/font/google'
import { Toaster } from 'sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Providers } from '@/components/providers'
import './globals.css'

const sans = DM_Sans({ subsets: ['latin'], variable: '--font-dm-sans' })
const serif = Lora({ subsets: ['latin'], variable: '--font-lora' })

function getAppUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL || 'https://kenyatrace.vercel.app'
  try {
    return new URL(raw)
  } catch {
    return new URL('https://kenyatrace.vercel.app')
  }
}

export const metadata: Metadata = {
  title: { default: 'KenyaTrace — Travel Kenya your way', template: '%s · KenyaTrace' },
  description: 'Discover, plan, book and trace unforgettable journeys across Kenya.',
  metadataBase: getAppUrl(),
}

export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0e7a55' },
    { media: '(prefers-color-scheme: dark)', color: '#0a100d' },
  ],
  width: 'device-width',
  initialScale: 1,
  userScalable: true,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`bg-background ${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('kt-theme');var d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark')}catch(e){}})()`,
          }}
        />
      </head>
      <body className="font-sans antialiased">
        <Providers>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="top-center" />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </Providers>
      </body>
    </html>
  )
}
