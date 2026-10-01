'use client'

import { CheckCircle2, Loader2, Sparkles, Star } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GENERATION_STEPS, STAGES, type Stage } from './lib'

export function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Rate your experience" className="flex gap-1" onKeyDown={e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); onChange(Math.min(5, (value || 0) + 1)) }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); onChange(Math.max(1, (value || 0) - 1)) }
    }}>
      {[1, 2, 3, 4, 5].map(n => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={n === value}
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
          onClick={() => onChange(n)}
          className="flex min-h-11 min-w-11 items-center justify-center rounded-none transition-colors hover:bg-muted focus-visible:outline-none"
        >
          <Star className={cn('size-6', n <= value ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
        </button>
      ))}
    </div>
  )
}

export function GenerationProgress({ active }: { active: number }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-none border bg-card p-4 shadow-soft">
      <p className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Sparkles className="size-4 animate-pulse" /> Planning your trip
      </p>
      <div className="flex flex-col gap-2">
        {GENERATION_STEPS.map((step, i) => {
          const isDone = i < active
          const isActive = i === active
          return (
            <div key={step} className={cn('flex items-center gap-2 text-sm transition-all duration-300', isActive ? 'font-medium text-foreground' : isDone ? 'text-muted-foreground' : 'text-muted-foreground opacity-40')}>
              {isDone ? (
                <CheckCircle2 className="size-4 shrink-0 text-primary" />
              ) : isActive ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
              ) : (
                <span className="flex size-4 shrink-0 items-center justify-center"><span className="size-1.5 rounded-none bg-border" /></span>
              )}
              <span className="truncate">{step}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Slim progress rail for the planner. Once a plan exists its name leads the
 * label ("Planning: Mara weekend") instead of generic copy, so the traveller
 * always knows which journey they're shaping.
 */
export function PlannerProgress({ stage, planName }: { stage: Stage; planName?: string }) {
  const idx = STAGES.findIndex(s => s.id === stage)
  const current = STAGES[idx]
  return (
    <div className="flex items-center gap-3" aria-label={`Planner step ${idx + 1} of ${STAGES.length}: ${current.label}`}>
      <span className="truncate text-xs font-semibold uppercase tracking-widest text-primary">
        {planName ? `Planning: ${planName}` : 'Plan a Kenya trip'}
      </span>
      <div className="flex flex-1 items-center gap-1.5">
        {STAGES.map((s, i) => (
          <span key={s.id} aria-hidden className={cn('h-1.5 flex-1 rounded-none transition-colors', i < idx ? 'bg-primary/50' : i === idx ? 'bg-primary' : 'bg-border')} />
        ))}
      </div>
      <span className="shrink-0 text-xs font-medium text-muted-foreground">{current.label} · {idx + 1}/{STAGES.length}</span>
    </div>
  )
}
