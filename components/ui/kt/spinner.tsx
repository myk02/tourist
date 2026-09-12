'use client'

import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Labeled spinner — replaces bare `…` ellipsis loading text for SR users. */
export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
      {!label && <span className="sr-only">Loading</span>}
    </span>
  )
}
