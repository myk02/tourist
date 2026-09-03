'use client'

import { BadgeCheck, Sparkles } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/** Green "verified listing" chip — was pasted in 3 files with drift. */
export function VerifiedBadge({ className }: { className?: string }) {
  return (
    <Badge className={cn('bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', className)}>
      <BadgeCheck className="size-3" /> Verified
    </Badge>
  )
}

/** Amber "AI suggestion, confirm before booking" chip. */
export function SuggestedBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn('border-amber-500/40 text-amber-700 dark:text-amber-300', className)}>
      <Sparkles className="size-3" /> Suggested
    </Badge>
  )
}
