'use client'

import { useMemo } from 'react'
import { ArrowRight, Sparkles, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { BUDGET_TIER_META, budgetTierId, dailyAllowance, tierMismatchWarning } from '@/lib/budget'
import { formatKES } from '@/lib/kenya-data'
import { seasonLabel } from '@/lib/seasons'
import { cn } from '@/lib/utils'
import { GenerationProgress } from '../bits'
import { useJourney } from '../context'
import { BUDGETS, INTERESTS } from '../lib'

/** Stage 2 — when, how much, and what the traveller is into. */
export function BudgetStage() {
  const {
    draft, setDraft, goTo, prefilled,
    loading, progressStep, generatePlan,
  } = useJourney()

  // Warns when a selected interest needs more per-day money than the budget tier provides.
  const tierWarning = useMemo(
    () => tierMismatchWarning(draft.interests, draft.budget, draft.days),
    [draft.interests, draft.budget, draft.days],
  )

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-serif text-4xl font-semibold tracking-tight">What&apos;s your budget?</h1>
        <p className="mt-2 text-muted-foreground">{draft.days} day{draft.days === 1 ? '' : 's'} from {draft.origin}.</p>
      </div>

      {prefilled && (
        <p className="rounded-none border border-primary/25 bg-primary/5 px-3.5 py-2 text-sm text-primary"><Sparkles className="mr-1 inline size-4 align-[-3px]" />Pre-filled from your profile preferences — adjust anything below.</p>
      )}

      <Card>
        <CardContent className="flex flex-col gap-5 p-6">
          <div>
            <p className="text-sm font-medium">When are you going?</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Input type="month" className="w-auto" value={draft.travelMonth} onChange={e => setDraft(d => ({ ...d, travelMonth: e.target.value }))} aria-label="Travel month" />
              {draft.travelMonth && seasonLabel(draft.travelMonth) && (
                <span className="rounded-none bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">{seasonLabel(draft.travelMonth)}</span>
              )}
              {!draft.travelMonth && <span className="text-xs text-muted-foreground">Optional — we&apos;ll tailor every pick to the season.</span>}
            </div>
          </div>

          <div className="border-t pt-1">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Total trip budget</p>
              <span className="text-2xl font-bold text-primary">{formatKES(draft.budget)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>≈ {formatKES(dailyAllowance(draft.budget, draft.days))} per day</span>
              <span className="rounded-none bg-secondary px-2 py-0.5 font-semibold text-foreground">{BUDGET_TIER_META[budgetTierId(draft.budget, draft.days)].label}</span>
            </div>
            <Slider className="mt-4" min={5000} max={250000} step={5000} value={[draft.budget]} onValueChange={v => setDraft(d => ({ ...d, budget: Array.isArray(v) ? v[0] : v }))} aria-label="Trip budget" />
            <div className="mt-3 flex flex-wrap gap-2">
              {BUDGETS.map(b => (
                <button
                  key={b}
                  type="button"
                  aria-pressed={draft.budget === b}
                  onClick={() => setDraft(d => ({ ...d, budget: b }))}
                  className={cn(
                    'rounded-none border px-3 py-1.5 text-sm font-medium transition-colors',
                    draft.budget === b ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {formatKES(b)}
                </button>
              ))}
            </div>
          </div>

          <div className="border-t pt-4">
            <p className="text-sm font-medium">What are you into?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {INTERESTS.map(i => (
                <button
                  key={i}
                  type="button"
                  aria-pressed={draft.interests.includes(i)}
                  onClick={() => setDraft(d => ({ ...d, interests: d.interests.includes(i) ? d.interests.filter(x => x !== i) : [...d.interests, i] }))}
                  className={cn(
                    'rounded-none border px-3 py-1.5 text-sm font-medium transition-colors',
                    draft.interests.includes(i) ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                  )}
                >
                  {i}
                </button>
              ))}
            </div>
            {tierWarning && (
              <p className="mt-2 rounded-none border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                <TriangleAlert className="mr-1 inline size-3.5 align-[-2px]" />
                {tierWarning}
              </p>
            )}
          </div>

        </CardContent>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" onClick={() => goTo('where')}>Back</Button>
        <div className="flex-1" />
        {loading ? (
          <GenerationProgress active={progressStep} />
        ) : (
          <Button size="lg" onClick={generatePlan} className="gap-2">
            Get my plan <ArrowRight className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}
