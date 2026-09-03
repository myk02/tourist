'use client'

import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Flat brand tile for logos and feature icons (Phase 2.1).
 * Replaces the 9x pasted `bg-gradient-to-br from-primary to-[color-mix(...)]`
 * gradient tile — flat `bg-primary` is crisper at 36px and cheaper to paint.
 * Reach for GradientHero only at page-hero scale, never for icons.
 */
export function BrandMark({ icon: Icon, className, size = 'md' }: { icon: LucideIcon; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'sm' ? 'size-9' : size === 'lg' ? 'size-16' : 'size-12'
  const glyph = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-8' : 'size-6'
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft', dims, className)}>
      <Icon className={glyph} />
    </span>
  )
}
