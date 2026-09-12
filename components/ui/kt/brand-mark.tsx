'use client'

import { Check, Compass, Flag, MapPin, Navigation, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

// String keys (not component references): BrandMark is used inside Server
// Components (sign-in/sign-up pages), and functions/classes cannot cross the
// server→client serialization boundary.
const ICONS = {
  check: Check,
  compass: Compass,
  flag: Flag,
  mapPin: MapPin,
  navigation: Navigation,
  sparkles: Sparkles,
} as const

export type BrandMarkIcon = keyof typeof ICONS

/**
 * Flat brand tile for logos and feature icons (Phase 2.1).
 * Replaces the 9x pasted `bg-gradient-to-br from-primary to-[color-mix(...)]`
 * gradient tile — flat `bg-primary` is crisper at 36px and cheaper to paint.
 * Reach for GradientHero only at page-hero scale, never for icons.
 */
export function BrandMark({ icon, className, size = 'md' }: { icon: BrandMarkIcon; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  // Never hard-crash on an unknown key (e.g. a stale client chunk passing an
  // old value after a deploy) — fall back to the brand compass.
  const Icon = ICONS[icon] ?? Navigation
  const dims = size === 'sm' ? 'size-9' : size === 'lg' ? 'size-16' : 'size-12'
  const glyph = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-8' : 'size-6'
  return (
    <span className={cn('flex shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-soft', dims, className)}>
      <Icon className={glyph} />
    </span>
  )
}
