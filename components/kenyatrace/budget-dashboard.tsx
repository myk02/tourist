'use client'

import { useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { formatKES } from '@/lib/kenya-data'
import { cn } from '@/lib/utils'
import type { Stop } from './types'

const CATEGORY_ORDER = ['Stay', 'Transport', 'Experience', 'Food'] as const
const CATEGORY_LABEL: Record<string, string> = {
  Stay: 'Stays',
  Transport: 'Transport',
  Experience: 'Activities',
  Food: 'Food',
}
const CATEGORY_COLOR: Record<string, string> = {
  Stay: 'bg-blue-500',
  Transport: 'bg-amber-500',
  Experience: 'bg-emerald-500',
  Food: 'bg-rose-500',
}

/**
 * Centralized KES budget dashboard for a trip: categorized expenses (Stays,
 * Transport, Activities, Food), a per-day view, and a simple group
 * expense-splitting calculator for multi-traveller trips.
 */
export function BudgetDashboard({ stops, budget, totalCost }: { stops: Stop[]; budget: number; totalCost: number }) {
  const [travelers, setTravelers] = useState(2)

  const breakdown = useMemo(() => {
    const byKind = new Map<string, number>()
    const byDay = new Map<number, number>()
    for (const s of stops) {
      byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + s.cost)
      byDay.set(s.day, (byDay.get(s.day) ?? 0) + s.cost)
    }
    const categories = CATEGORY_ORDER
      .map(kind => ({ kind, label: CATEGORY_LABEL[kind] ?? kind, color: CATEGORY_COLOR[kind] ?? 'bg-secondary', value: byKind.get(kind) ?? 0 }))
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value)
    const days = [...byDay.entries()].sort((a, b) => a[0] - b[0]).map(([day, value]) => ({ day, value }))
    return { categories, days }
  }, [stops])

  const pctOfBudget = (value: number) => (budget > 0 ? Math.min((value / budget) * 100, 100) : 0)
  const perPerson = travelers > 0 ? Math.round(totalCost / travelers) : 0
  const perDayAverage = stops.length ? Math.round(totalCost / Math.max(1, Math.max(...stops.map(s => s.day)))) : 0

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardDescription>Total planned (KES)</CardDescription>
          <CardTitle className="text-4xl">{formatKES(totalCost)}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{formatKES(budget)} budget</span>
            <span className={cn('font-semibold', totalCost > budget && 'text-destructive')}>
              {totalCost > budget ? `${formatKES(totalCost - budget)} over` : `${formatKES(budget - totalCost)} remaining`}
            </span>
          </div>
          <Progress value={pctOfBudget(totalCost)} />
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>≈ {formatKES(perDayAverage)} / day</span>
            <span>≈ {formatKES(perPerson)} / traveller</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By category</CardTitle>
          <CardDescription>Stays, transport, activities and food</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2.5">
          {breakdown.categories.map(({ kind, label, color, value }) => (
            <div key={kind} className="flex items-center gap-2 text-xs">
              <span className="flex w-28 shrink-0 items-center gap-1.5">
                <span className={cn('size-2 rounded-full', color)} />
                {label}
              </span>
              <Progress className="h-1.5 flex-1" value={pctOfBudget(value)} />
              <span className="w-16 shrink-0 text-right font-medium">{formatKES(value)}</span>
            </div>
          ))}
          {breakdown.categories.length === 0 && <p className="text-sm text-muted-foreground">Add stops to see the breakdown.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By day</CardTitle>
          <CardDescription>How spend spreads across the route</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {breakdown.days.map(({ day, value }) => (
            <div key={day} className="flex items-center gap-2 text-xs">
              <span className="w-12 shrink-0">Day {day}</span>
              <Progress className="h-1.5 flex-1" value={pctOfBudget(value)} />
              <span className="w-16 shrink-0 text-right text-muted-foreground">{formatKES(value)}</span>
            </div>
          ))}
          {breakdown.days.length === 0 && <p className="text-sm text-muted-foreground">Add stops to see the daily spread.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Split the cost</CardTitle>
          <CardDescription>How much each traveller covers</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <label htmlFor="travelers" className="shrink-0 text-sm font-medium">Travellers</label>
            <Input
              id="travelers"
              type="number"
              min={1}
              max={50}
              className="h-9 w-24"
              value={travelers}
              onChange={e => setTravelers(Math.max(1, parseInt(e.target.value, 10) || 1))}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md bg-secondary p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Per person</p>
              <p className="mt-1 font-serif text-2xl font-semibold">{formatKES(perPerson)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">split {travelers} way{travelers === 1 ? '' : 's'}</p>
            </div>
            <div className="rounded-md bg-secondary p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Trip total</p>
              <p className="mt-1 font-serif text-2xl font-semibold">{formatKES(totalCost)}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">split {travelers} ways</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
