'use client'

import type { LucideIcon } from 'lucide-react'
import { Camera, MapPin } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Shared empty state (Phase 2.1). One illustration scale, one padding scale —
 * replaces the 5 dashed-border empties with 5 different paddings.
 */
export function EmptyState({ icon: Icon = MapPin, title, body, className }: {
  icon?: LucideIcon
  title: string
  body?: string
  className?: string
}) {
  return (
    <div className={cn('flex min-h-52 flex-col items-center justify-center rounded-none border border-dashed p-8 text-center', className)}>
      <Icon className="size-8 text-primary" />
      <p className="mt-4 font-serif text-2xl">{title}</p>
      {body && <p className="mt-2 max-w-md text-muted-foreground">{body}</p>}
    </div>
  )
}

/** No public photos on this trip — never render a fake image with a real caption. */
export function EmptyMoments({ className }: { className?: string }) {
  return (
    <EmptyState
      icon={Camera}
      title="No shared moments yet"
      body="The traveller hasn't made any moments public on this trip."
      className={className}
    />
  )
}
