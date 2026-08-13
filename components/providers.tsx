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
  return <ClerkProvider appearance={theme === 'dark' ? dark : undefined}>{children}</ClerkProvider>
}

export function Providers({ children }: { children: ReactNode }) {
  const convex = useMemo(() => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!), [])

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
