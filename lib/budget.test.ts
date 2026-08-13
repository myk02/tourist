import { describe, expect, it } from 'vitest'
import {
  BUDGET_TIER_META,
  budgetTierId,
  budgetTierPrompt,
  dailyAllowance,
  tierMismatchWarning,
  validatePlanBudget,
  validateReplanDayCost,
} from './budget'

describe('dailyAllowance', () => {
  it('divides the budget evenly across days', () => {
    expect(dailyAllowance(60000, 4)).toBe(15000)
  })

  it('rounds to whole shillings', () => {
    expect(dailyAllowance(100000, 3)).toBe(33333)
  })

  it('never divides by zero or negative days', () => {
    expect(dailyAllowance(50000, 0)).toBe(50000)
    expect(dailyAllowance(50000, -2)).toBe(50000)
  })
})

describe('budgetTierId', () => {
  it('maps a tight daily budget to shoestring', () => {
    expect(budgetTierId(10000, 2)).toBe('shoestring') // 5,000/day
    expect(budgetTierId(59990, 10)).toBe('shoestring') // 5,999/day
  })

  it('maps mid-range daily budgets', () => {
    expect(budgetTierId(30000, 3)).toBe('mid') // 10,000/day
    expect(budgetTierId(74000, 5)).toBe('mid') // 14,800/day
  })

  it('maps premium daily budgets', () => {
    expect(budgetTierId(50000, 2)).toBe('premium') // 25,000/day
    expect(budgetTierId(100000, 3)).toBe('premium') // ~33,333/day
  })

  it('maps generous daily budgets to luxury', () => {
    expect(budgetTierId(200000, 3)).toBe('luxury')
    expect(budgetTierId(1000000, 4)).toBe('luxury')
  })

  it('falls on the right side of the 6,000/day boundary', () => {
    expect(budgetTierId(12000, 2)).toBe('mid') // exactly 6,000/day
    expect(budgetTierId(11000, 2)).toBe('shoestring') // 5,500/day
  })
})

describe('budgetTierPrompt', () => {
  it('returns the tier guidance that matches the tier id', () => {
    const budget = 30000
    const days = 3
    const tier = budgetTierId(budget, days)
    expect(budgetTierPrompt(budget, days)).toBe(BUDGET_TIER_META[tier].prompt)
  })

  it('every tier has a label, a range and a non-empty prompt', () => {
    for (const meta of Object.values(BUDGET_TIER_META)) {
      expect(meta.label).toBeTruthy()
      expect(meta.range).toMatch(/KES/)
      expect(meta.prompt.length).toBeGreaterThan(30)
    }
  })
})

describe('tierMismatchWarning', () => {
  it('returns null when interests fit the tier', () => {
    expect(tierMismatchWarning(['Wildlife'], 60000, 2)).toBeNull() // premium
    expect(tierMismatchWarning(['Food', 'City'], 10000, 2)).toBeNull() // shoestring
    expect(tierMismatchWarning([], 10000, 2)).toBeNull()
  })

  it('warns when an interest needs a higher tier', () => {
    const warning = tierMismatchWarning(['Luxury'], 10000, 2)
    expect(warning).toContain('Luxury')
    expect(warning).toContain('luxury budget')
  })

  it('warns for safari interests on a mid-range budget', () => {
    const warning = tierMismatchWarning(['Safari'], 30000, 3) // mid-range
    expect(warning).toContain('Safari')
    expect(warning).toContain('premium')
  })

  it('dedupes repeated interests and lists all unmet ones', () => {
    const warning = tierMismatchWarning(['Wildlife', 'Wildlife', 'Luxury'], 10000, 2)
    expect(warning).toContain('Wildlife, Luxury')
  })

  it('ignores unknown interests', () => {
    expect(tierMismatchWarning(['Golf'], 10000, 2)).toBeNull()
  })
})

describe('validatePlanBudget', () => {
  const stops = (costs: number[]) => costs.map(cost => ({ cost }))

  it('accepts a plan at or under the budget', () => {
    expect(validatePlanBudget(stops([20000, 15000, 10000]), 50000)).toBeNull()
    expect(validatePlanBudget(stops([50000]), 50000)).toBeNull()
  })

  it('tolerates small overshoots (the model estimates costs)', () => {
    // 56,000 is within the 15% tolerance of a 50,000 budget.
    expect(validatePlanBudget(stops([56000]), 50000)).toBeNull()
  })

  it('accepts exactly the 15% tolerance ceiling and rejects one shilling more', () => {
    expect(validatePlanBudget(stops([57500]), 50000)).toBeNull() // 50,000 * 1.15 = 57,500
    expect(validatePlanBudget(stops([57501]), 50000)).toContain('exceeds')
  })

  it('rejects a meaningful overshoot with an actionable reason', () => {
    const reason = validatePlanBudget(stops([70000]), 50000)
    expect(reason).toContain('exceeds')
    expect(reason).toContain('50,000')
    expect(reason).toContain('cheaper')
  })

  it('rejects a plan that wastes a generous budget', () => {
    const reason = validatePlanBudget(stops([30000]), 100000)
    expect(reason).toContain('30%')
    expect(reason).toContain('upgrade')
  })

  it('does not apply the undershoot guard to small budgets', () => {
    // 40,000 budget is below the 50,000 guard threshold.
    expect(validatePlanBudget(stops([5000]), 40000)).toBeNull()
  })
})

describe('validateReplanDayCost', () => {
  it('accepts a day that costs about one day share', () => {
    expect(validateReplanDayCost(12000, 60000, 5, 2)).toBeNull()
  })

  it('accepts up to twice the daily allowance', () => {
    expect(validateReplanDayCost(24000, 60000, 5, 2)).toBeNull()
  })

  it('rejects a day far above the daily allowance', () => {
    const reason = validateReplanDayCost(30000, 60000, 5, 2)
    expect(reason).toContain('day 2')
    expect(reason).toContain('12,000')
    expect(reason).toContain('trim')
  })

  it('keeps a generous 6,000 floor for tiny allowances', () => {
    // 5,000 / 14 days = ~357/day, but a real day still costs a few thousand.
    expect(validateReplanDayCost(6000, 5000, 14, 1)).toBeNull()
    const reason = validateReplanDayCost(6500, 5000, 14, 1)
    expect(reason).toContain('day 1')
  })
})
