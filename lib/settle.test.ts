import { describe, expect, it } from 'vitest'
import { computeSettlement, normalizePayer, settlementMessage } from './settle'

describe('settle', () => {
  it('splits evenly with no transfers when everyone paid their share', () => {
    const plan = computeSettlement(
      [
        { amount: 1000, spentBy: 'Alice' },
        { amount: 1000, spentBy: 'Brian' },
      ],
      2,
    )
    expect(plan.total).toBe(2000)
    expect(plan.perPerson).toBe(1000)
    expect(plan.transfers).toEqual([])
  })

  it('produces the minimal transfer plan', () => {
    const plan = computeSettlement(
      [
        { amount: 3000, spentBy: 'Alice' },
        { amount: 0, spentBy: 'Brian' },
      ].filter(e => e.amount > 0),
      2,
    )
    expect(plan.perPerson).toBe(1500)
    expect(plan.transfers).toEqual([{ from: 'Traveller 2', to: 'Alice', amount: 1500 }])
  })

  it('settles three-way debts with at most two transfers', () => {
    const plan = computeSettlement(
      [
        { amount: 6000, spentBy: 'alice' },
        { amount: 0, spentBy: 'Brian' },
        { amount: 0, spentBy: 'Ciku' },
      ].filter(e => e.amount > 0),
      3,
    )
    expect(plan.transfers.length).toBeLessThanOrEqual(2)
    const received = new Map<string, number>()
    for (const t of plan.transfers) {
      received.set(t.to, (received.get(t.to) ?? 0) + t.amount)
    }
    expect(received.get('Alice')).toBe(4000)
    expect(settlementMessage(plan)).toContain('→ Alice')
  })

  it('normalizes payer names', () => {
    expect(normalizePayer('  alice  mwangi ')).toBe('Alice mwangi')
    expect(normalizePayer('')).toBeNull()
    expect(normalizePayer(null)).toBeNull()
  })

  it('ignores invalid amounts and unpays', () => {
    const plan = computeSettlement(
      [{ amount: NaN }, { amount: -5 }, { amount: 2000, spentBy: 'Alice' }],
      2,
    )
    expect(plan.total).toBe(2000)
    expect(plan.transfers).toEqual([{ from: 'Traveller 2', to: 'Alice', amount: 1000 }])
  })
})
