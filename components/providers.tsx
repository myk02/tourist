'use client'

import { ClerkProvider, useAuth } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import { ConvexReactClient } from 'convex/react'
import { ConvexProviderWithClerk } from 'convex/react-clerk'
import { useMemo, type ReactNode } from 'react'
import { ThemeProvider, useTheme } from '@/components/theme-provider'

/** Clerk modals (sign-in, sign-up, account) follow the app's light/dark theme. */
function ClerkWithTheme({ children }: { children: ReactNode }) {
  const { theme } = useTheme()
  const appearance = useMemo(() => ({
    ...(theme === 'dark' ? dark : {}),
    layout: {
      // Hides the orange "Development mode" strip on the prebuilt modal.
      unsafe_disableDevelopmentModeWarnings: true,
    },
    elements: {
      cardBox: {
        '& > div:has(a[href*="clerk.com"]), & > div:has(a[href*="go.clerk.com"])': {
          display: 'none',
        },
      },
    },
  }), [theme])
  return (
    <ClerkProvider appearance={appearance}>
      {children}
    </ClerkProvider>
  )
}

export function Providers({ children }: { children: ReactNode }) {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  const convex = useMemo(() => {
    if (!url) {
      console.error('NEXT_PUBLIC_CONVEX_URL is not set — realtime features disabled')
      return null
    }
    return new ConvexReactClient(url)
  }, [url])

  if (!convex) {
    return (
      <ThemeProvider>
        <div className="flex min-h-screen items-center justify-center p-6 text-center">
          <div className="max-w-sm space-y-2">
            <h1 className="text-lg font-semibold">Realtime unavailable</h1>
            <p className="text-sm text-muted-foreground">
              KenyaTrace is missing its Convex configuration. Set
              <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">NEXT_PUBLIC_CONVEX_URL</code>
              in your environment to continue.
            </p>
          </div>
        </div>
      </ThemeProvider>
    )
  }

  return (
    <ThemeProvider>
      <ClerkWithTheme>
        <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
          {children}
        </ConvexProviderWithClerk>
      </ClerkWithTheme>
    </ThemeProvider>
  )
}
