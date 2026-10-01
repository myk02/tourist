'use client'

import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { Backpack, Check, Loader2, Plus, Trash2, Umbrella, Building2, Stethoscope } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

const CATEGORY_ORDER = ['Essentials', 'Documents', 'Clothing', 'Safari', 'Beach', 'Health', 'Other'] as const
type Category = (typeof CATEGORY_ORDER)[number]

/** Default Kenya templates — tapping one seeds sensible items for that trip style. */
const TEMPLATES: Record<'safari' | 'coast' | 'city', { label: string; category: Category }[]> = {
  safari: [
    { label: 'Neutral-coloured clothing', category: 'Safari' },
    { label: 'Binoculars', category: 'Safari' },
    { label: 'Zoom camera + memory cards', category: 'Safari' },
    { label: 'Warm layer for morning game drives', category: 'Safari' },
    { label: 'Dust buff / scarf', category: 'Safari' },
    { label: 'Closed walking shoes', category: 'Safari' },
  ],
  coast: [
    { label: 'Swimwear', category: 'Beach' },
    { label: 'Reef-safe sunscreen SPF 50', category: 'Beach' },
    { label: 'Sandals / flip flops', category: 'Beach' },
    { label: 'Light cover-up', category: 'Beach' },
    { label: 'Snorkel mask', category: 'Beach' },
    { label: 'After-sun aloe', category: 'Beach' },
  ],
  city: [
    { label: 'Comfortable walking shoes', category: 'Clothing' },
    { label: 'Day backpack', category: 'Essentials' },
    { label: 'Power bank', category: 'Essentials' },
    { label: 'Universal adapter (Type G)', category: 'Essentials' },
    { label: 'Reusable water bottle', category: 'Essentials' },
    { label: 'Light rain jacket', category: 'Clothing' },
  ],
}

const COMMON: { label: string; category: Category }[] = [
  { label: 'Passport / ID', category: 'Documents' },
  { label: 'Travel insurance details', category: 'Documents' },
  { label: 'M-Pesa float topped up', category: 'Essentials' },
  { label: 'Malaria prophylaxis', category: 'Health' },
  { label: 'Personal medication', category: 'Health' },
  { label: 'Sunscreen', category: 'Health' },
  { label: 'Insect repellent (DEET)', category: 'Health' },
  { label: 'Phone charger', category: 'Essentials' },
]

export function PackingChecklist({ tripId, canEdit }: { tripId: Id<'trips'>; canEdit: boolean }) {
  const items = useQuery(api.packing.list, { tripId })
  const add = useMutation(api.packing.add)
  const addMany = useMutation(api.packing.addMany)
  const setPacked = useMutation(api.packing.setPacked)
  const remove = useMutation(api.packing.remove)
  const [label, setLabel] = useState('')
  const [category, setCategory] = useState<Category>('Essentials')
  const [seeding, setSeeding] = useState(false)

  async function addItem(text: string) {
    const value = text.trim()
    if (!value) return
    try {
      await add({ tripId, label: value, category })
      setLabel('')
    } catch {
      toast.error('Could not add the item')
    }
  }

  async function seedTemplate(key: keyof typeof TEMPLATES) {
    setSeeding(true)
    try {
      const { added } = await addMany({ tripId, items: [...TEMPLATES[key], ...COMMON] })
      if (added === 0) toast.info('Those items are already on your list')
    } catch {
      toast.error('Could not add the template')
    } finally {
      setSeeding(false)
    }
  }

  const packed = (items ?? []).filter(i => i.packed).length
  const total = items?.length ?? 0
  const pct = total ? Math.round((packed / total) * 100) : 0
  const hasAny = (items?.length ?? 0) > 0

  const grouped = CATEGORY_ORDER.map(cat => ({ cat, rows: (items ?? []).filter(i => i.category === cat) }))
    .filter(g => g.rows.length > 0)

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Packing list</p>
          <p className="text-sm font-semibold text-primary">{packed} of {total} packed</p>
        </div>
        <Progress className="mt-2 h-2" value={pct} />
      </div>

      {canEdit && (
        <div className="flex flex-col gap-2.5">
          <div className="flex gap-2">
            <Input
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void addItem(label) }}
              placeholder="Add an item…"
              aria-label="New packing item"
              className="h-10"
              maxLength={80}
            />
            <Button size="icon" variant="outline" aria-label="Add item" onClick={() => void addItem(label)} disabled={!label.trim()}>
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(['Essentials', 'Documents', 'Clothing', 'Safari', 'Beach', 'Health', 'Other'] as Category[]).map(c => (
              <button
                key={c}
                type="button"
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
                className={cn(
                  'rounded-none border px-3 py-1 text-xs font-medium transition-colors',
                  category === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {c}
              </button>
            ))}
          </div>
          {!hasAny && (
            <div className="flex flex-wrap items-center gap-2 rounded-none border border-dashed border-primary/40 bg-primary/[0.03] p-3">
              <span className="text-xs font-medium text-muted-foreground">Start from a Kenya template:</span>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={seeding} onClick={() => void seedTemplate('safari')}>
                {seeding ? <Loader2 className="size-3.5 animate-spin" /> : <Backpack className="size-3.5" />} Safari
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={seeding} onClick={() => void seedTemplate('coast')}>
                {seeding ? <Loader2 className="size-3.5 animate-spin" /> : <Umbrella className="size-3.5" />} Coast
              </Button>
              <Button size="sm" variant="outline" className="h-8 gap-1.5" disabled={seeding} onClick={() => void seedTemplate('city')}>
                {seeding ? <Loader2 className="size-3.5 animate-spin" /> : <Building2 className="size-3.5" />} City
              </Button>
            </div>
          )}
        </div>
      )}

      {items === undefined ? (
        <div className="kt-shimmer h-24 rounded-none" />
      ) : !hasAny ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nothing on the list yet{canEdit ? ' — add items or start from a template above.' : '.'}</p>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(({ cat, rows }) => (
            <div key={cat}>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{cat}</p>
              <div className="flex flex-col gap-1.5">
                {rows.map(item => (
                  <div key={item._id} className="group flex items-center gap-2">
                    <button
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={item.packed}
                      onClick={() => setPacked({ id: item._id, packed: !item.packed }).catch(() => toast.error('Could not update the item'))}
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-2.5 rounded-none border px-3 py-2 text-left transition-colors',
                        item.packed ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/40',
                        !canEdit && 'cursor-default',
                      )}
                    >
                      <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-none border transition-colors', item.packed ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 text-transparent')}>
                        <Check className="size-3.5" />
                      </span>
                      <span className={cn('min-w-0 flex-1 truncate text-sm', item.packed && 'text-muted-foreground line-through')}>{item.label}</span>
                    </button>
                    {canEdit && (
                      <button
                        type="button"
                        aria-label={`Remove ${item.label}`}
                        onClick={() => remove({ id: item._id }).catch(() => toast.error('Could not remove the item'))}
                        className="shrink-0 rounded-none p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
