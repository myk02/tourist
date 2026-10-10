'use client'

import { useMemo, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Loader2, Plus, Trash2, Wallet, Scale, Copy, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatKES } from '@/lib/kenya-data'
import { kindHex } from '@/lib/kind'
import { cn } from '@/lib/utils'
import { computeSettlement, settlementMessage } from '@/lib/settle'

const KINDS = ['Stay', 'Transport', 'Experience', 'Food', 'Other'] as const
type Kind = (typeof KINDS)[number]

/**
 * Trip expense log + group split (the Splitwise-style surface): log real
 * spend during the trip, compare planned vs actual per category, and split
 * the actual total across the trip's traveller count.
 */
export function ExpenseLog({ tripId, plannedTotal, travelers, canEdit }: {
  tripId: Id<'trips'>
  plannedTotal: number
  travelers: number
  canEdit: boolean
}) {
  const expenses = useQuery(api.expenses.list, { tripId })
  const add = useMutation(api.expenses.add)
  const remove = useMutation(api.expenses.remove)
  const [label, setLabel] = useState('')
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState<Kind>('Food')
  const [spentBy, setSpentBy] = useState('')
  const [saving, setSaving] = useState(false)
  const [settleCopied, setSettleCopied] = useState(false)

  async function submit() {
    if (saving) return
    const value = parseFloat(amount)
    if (!label.trim() || !Number.isFinite(value) || value <= 0) {
      toast.error('Add what it was for and the amount')
      return
    }
    setSaving(true)
    try {
      await add({ tripId, label, amount: value, kind, spentBy: spentBy.trim() || undefined })
      setLabel('')
      setAmount('')
      setSpentBy('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not log the expense')
    } finally {
      setSaving(false)
    }
  }

  const rows = expenses ?? []
  const actual = rows.reduce((s, x) => s + x.amount, 0)
  const settlement = useMemo(
    () => computeSettlement(rows.map(r => ({ amount: r.amount, spentBy: r.spentBy })), Math.max(travelers, 1)),
    [rows, travelers],
  )

  async function copySettlement() {
    try {
      await navigator.clipboard.writeText(settlementMessage(settlement))
      setSettleCopied(true)
      toast.success('Settle-up plan copied — paste into WhatsApp')
      setTimeout(() => setSettleCopied(false), 2_000)
    } catch {
      toast.error('Could not copy the plan')
    }
  }
  const byKind = useMemo(() => {
    const map = new Map<Kind, number>()
    for (const k of KINDS) map.set(k, 0)
    for (const r of rows) map.set(r.kind as Kind, (map.get(r.kind as Kind) ?? 0) + r.amount)
    return [...map.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
  }, [rows])

  const overPlanned = actual > plannedTotal
  const perPerson = travelers > 0 ? Math.round(actual / travelers) : actual

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-4" /> Actual spend</CardTitle>
        <CardDescription>Log what you really spend — planned vs actual, split across travellers.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canEdit && (
          <div className="grid gap-2 sm:grid-cols-[1fr_120px_140px_auto]">
            <Input
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void submit() }}
              placeholder="What was it? e.g. Gate fees"
              aria-label="Expense description"
              maxLength={120}
            />
            <Input
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void submit() }}
              type="number"
              min={1}
              placeholder="KES"
              aria-label="Amount in KES"
            />
            <Select value={kind} onValueChange={v => setKind((v ?? 'Other') as Kind)}>
              <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
              <SelectContent>
                {KINDS.map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button onClick={() => void submit()} disabled={saving || !label.trim() || !amount} className="gap-1.5">
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Log
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-none border bg-muted/40 px-3.5 py-2.5 text-sm">
          <span className={cn('font-semibold', overPlanned ? 'text-destructive' : 'text-primary')}>
            {formatKES(actual)} spent
          </span>
          <span className="text-muted-foreground">
            of {formatKES(plannedTotal)} planned · {overPlanned ? `${formatKES(actual - plannedTotal)} over` : `${formatKES(Math.max(plannedTotal - actual, 0))} left`}
          </span>
        </div>
        <Progress value={plannedTotal > 0 ? Math.min((actual / plannedTotal) * 100, 100) : 0} />

        {byKind.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {byKind.map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs">
                <span className="flex w-24 shrink-0 items-center gap-1.5">
                  <span className="size-2 rounded-none" style={{ backgroundColor: kindHex(k) }} />
                  {k}
                </span>
                <Progress className="h-1.5 flex-1" value={actual > 0 ? (v / actual) * 100 : 0} />
                <span className="w-16 shrink-0 text-right text-muted-foreground">{formatKES(v)}</span>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-none border border-border/60 bg-muted/60 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Split across {travelers} traveller{travelers === 1 ? '' : 's'}</p>
          <p className="mt-1 font-serif text-2xl font-semibold">{formatKES(perPerson)} <span className="text-sm font-normal text-muted-foreground">per person</span></p>
        </div>

        {rows.length > 0 && (
          <div className="rounded-none border border-primary/25 bg-primary/5 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
              <Scale className="size-3.5" /> Who owes whom
            </p>
            {settlement.transfers.length === 0 ? (
              <p className="mt-1.5 text-sm text-muted-foreground">All settled up — everyone paid their share.</p>
            ) : (
              <ul className="mt-1.5 flex flex-col gap-1 text-sm">
                {settlement.transfers.map(t => (
                  <li key={`${t.from}-${t.to}`} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <strong>{t.from}</strong>
                    <span className="text-muted-foreground">→</span>
                    <strong>{t.to}</strong>
                    <span className="font-semibold text-primary">{formatKES(t.amount)}</span>
                    <a
                      href="tel:*334%23"
                      className="text-xs font-medium text-muted-foreground underline underline-offset-2 hover:text-foreground"
                      title="Settle via M-Pesa"
                    >
                      via M-Pesa
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <Button variant="outline" size="sm" onClick={() => void copySettlement()} className="mt-2.5 gap-1.5">
              {settleCopied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              {settleCopied ? 'Copied!' : 'Copy settle-up plan'}
            </Button>
          </div>
        )}

        {expenses === undefined ? (
          <div className="kt-shimmer h-20 rounded-none" />
        ) : rows.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">No expenses logged yet{canEdit ? ' — add the first one above.' : '.'}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map(r => (
              <div key={r._id} className="group flex items-center gap-2 rounded-none border px-3 py-2 text-sm">
                <span className="size-2 shrink-0 rounded-none" style={{ backgroundColor: kindHex(r.kind) }} />
                <span className="min-w-0 flex-1 truncate">{r.label}{r.spentBy ? <span className="text-muted-foreground"> · {r.spentBy}</span> : null}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{new Date(r.spentAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
                <strong className="shrink-0">{formatKES(r.amount)}</strong>
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Remove ${r.label}`}
                    onClick={() => remove({ id: r._id }).catch(() => toast.error('Could not remove the expense'))}
                    className="shrink-0 rounded-none p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
