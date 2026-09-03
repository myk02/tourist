'use client'

import { cn } from '@/lib/utils'

/**
 * Page-hero shell (Phase 2.1). The ONLY place the primary gradient may live —
 * one component, four call sites (trip-detail, recap, moments-share, profile).
 * Padding variants pass through className; everything else is fixed so heroes
 * can't drift apart again.
 */
export function GradientHero({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-[color-mix(in_oklch,var(--primary),#000_28%)] px-6 py-8 text-primary-foreground shadow-lift ring-1 ring-primary/20', className)}>
      {children}
    </div>
  )
}
