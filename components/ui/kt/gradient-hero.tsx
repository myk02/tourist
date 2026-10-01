'use client'

import { cn } from '@/lib/utils'

/**
 * Page-hero shell. Flat primary block — no gradient, no glow, no ring.
 * One component, four call sites (trip-detail, recap, moments-share, profile);
 * padding variants pass through className; everything else is fixed so heroes
 * can't drift apart again.
 */
export function GradientHero({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-none border border-primary bg-primary px-6 py-8 text-primary-foreground', className)}>
      {children}
    </div>
  )
}
