'use client'

import { cn } from '@/lib/utils'

/**
 * Segmented List|Map|Day control (Phase 2.1). The same
 * `rounded-full border bg-muted/40 p-1` pill was hand-rolled in
 * itinerary-editor, moments-page and track-stage with drift — use this.
 */
export function PillToggle<T extends string>({ options, value, onChange, label }: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  label?: string
}) {
  return (
    <div role="tablist" aria-label={label ?? 'View'} className="flex w-fit items-center gap-1 rounded-full border border-border/70 bg-muted/40 p-1">
      {options.map(o => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-11 rounded-full px-4 text-sm font-medium transition-colors',
            o.value === value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
