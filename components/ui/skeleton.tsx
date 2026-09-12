import * as React from 'react'
import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn("kt-shimmer rounded-lg", className)}
      {...props}
    />
  )
}

export { Skeleton }
