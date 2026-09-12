'use client'

import { Badge } from '@/components/ui/badge'
import { kindChip } from '@/lib/kind'
import { cn } from '@/lib/utils'

/** Kind chip backed by the single source in lib/kind.ts. */
export function KindChip({ kind, className }: { kind: string; className?: string }) {
  return <Badge className={cn('text-[10px]', kindChip(kind), className)}>{kind}</Badge>
}
