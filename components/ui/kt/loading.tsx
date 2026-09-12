'use client'

import { cn } from '@/lib/utils'

/**
 * Page-level loading state (Phase 8.1). A bare shimmer div announces nothing —
 * screen-reader users hear silence and sighted users see a blank page with no
 * context. This pairs the shimmer with a polite status announcement.
 */
export function PageLoading({ label, className, shimmerClassName }: {
  label: string
  className?: string
  shimmerClassName?: string
}) {
  return (
    <div className={className} role="status" aria-label={label}>
      <div className={cn('kt-shimmer', shimmerClassName)} aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  )
}
