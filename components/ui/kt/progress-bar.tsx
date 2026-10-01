'use client'

import { cn } from '@/lib/utils'

/**
 * Accessible linear progress (Phase 2.1). Replaces the 6x pasted inline
 * `style={{ width: pct% }}` divs — same visual, now with role=progressbar
 * and a shared height/radius scale.
 */
export function ProgressBar({ value, className, barClassName, label }: { value: number; className?: string; barClassName?: string; label?: string }) {
  const pct = Math.min(100, Math.max(0, Math.round(value)))
  return (
    <div className={cn('h-2 overflow-hidden rounded-none bg-muted', className)} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label ?? 'Progress'}>
      <div className={cn('h-full bg-primary transition-all', barClassName)} style={{ width: `${pct}%` }} />
    </div>
  )
}
