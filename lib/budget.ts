/**
 * Budget logic shared by the planner API and the journey UI.
 * Pure functions — no server or framework dependencies — so they can be
 * unit-tested in isolation.
 */

export type BudgetTierId = 'shoestring' | 'mid' | 'premium' | 'luxury'

/** The user's per-day allowance: total budget divided across the trip. */
export function dailyAllowance(budget: number, days: number): number {
  if (!Number.isFinite(budget) || !Number.isFinite(days)) return 0
  const safeBudget = Math.max(0, budget)
  const safeDays = Math.max(1, Math.floor(days))
  return Math.round(safeBudget / safeDays)
}

/** Which destination price-band a trip's per-day money can realistically cover. */
export function budgetTierId(budget: number, days: number): BudgetTierId {
  // Uses the same rounded figure as dailyAllowance() so the tier shown in the
  // UI and the per-day amount never contradict each other at a boundary.
  const perDay = dailyAllowance(budget, days)
  if (perDay < 6000) return 'shoestring'
  if (perDay < 15000) return 'mid'
  if (perDay < 35000) return 'premium'
  return 'luxury'
}

export const BUDGET_TIER_META: Record<BudgetTierId, { label: string; range: string; prompt: string }> = {
  shoestring: {
    label: 'Shoestring',
    range: 'under KES 6,000/day',
    prompt: 'Shoestring (under KES 6,000/day): day trips, national parks and lakes close to the origin, matatus/PSVs, hostels and budget guesthouses. Avoid Maasai Mara, Amboseli, Samburu and long coastal transfers.',
  },
  mid: {
    label: 'Mid-range',
    range: 'KES 6,000-15,000/day',
    prompt: 'Mid-range (KES 6,000-15,000/day): Naivasha, Nakuru, Amboseli, Tsavo, Watamu or budget Diani — shared park drives and comfortable budget lodges.',
  },
  premium: {
    label: 'Premium',
    range: 'KES 15,000-35,000/day',
    prompt: 'Premium (KES 15,000-35,000/day): Maasai Mara, full Amboseli safaris, Diani resorts, Lamu or Samburu — private game drives and comfortable lodges.',
  },
  luxury: {
    label: 'Luxury',
    range: 'over KES 35,000/day',
    prompt: 'Luxury (over KES 35,000/day): Maasai Mara private conservancies, luxury coastal resorts, fly-in safari-and-beach combinations.',
  },
}

/** The AI-facing budget-tier guidance sentence for a given trip. */
export function budgetTierPrompt(budget: number, days: number): string {
  return BUDGET_TIER_META[budgetTierId(budget, days)].prompt
}

/** Interests that only shine at (or above) a certain budget tier. */
export const INTEREST_MIN_TIER: Record<string, BudgetTierId> = {
  Luxury: 'luxury',
  Safari: 'premium',
  Wildlife: 'premium',
  Beach: 'mid',
  Adventure: 'mid',
  Hiking: 'mid',
  Culture: 'mid',
  Food: 'shoestring',
  'Local life': 'shoestring',
  City: 'shoestring',
}

const TIER_RANK: Record<BudgetTierId, number> = { shoestring: 0, mid: 1, premium: 2, luxury: 3 }

/**
 * Warns when a selected interest realistically needs a higher budget tier
 * than the trip's per-day money provides. Returns null when everything fits.
 */
export function tierMismatchWarning(interests: string[], budget: number, days: number): string | null {
  const tier = budgetTierId(budget, days)
  const unmet = [...new Set(interests.filter(i => INTEREST_MIN_TIER[i] && TIER_RANK[INTEREST_MIN_TIER[i]] > TIER_RANK[tier]))]
  if (unmet.length === 0) return null
  const neededRank = Math.max(...unmet.map(i => TIER_RANK[INTEREST_MIN_TIER[i]]))
  const neededTier = (Object.keys(TIER_RANK) as BudgetTierId[]).find(k => TIER_RANK[k] === neededRank)!
  const label = BUDGET_TIER_META[neededTier].label.toLowerCase()
  const article = /^[aeiou]/.test(label) ? 'an' : 'a'
  return `${unmet.join(', ')} usually needs ${article} ${label} budget — raise your budget or enjoy ${unmet.length === 1 ? 'it' : 'them'} on a smaller scale.`
}

/**
 * Checks a generated plan against the trip budget. Returns a human-readable
 * rejection reason (also fed back into AI retries) or null when it fits.
 * The 15% overshoot tolerance exists because the model estimates costs
 * without arithmetic — only meaningful overspending triggers a retry.
 */
export function validatePlanBudget(stops: { cost: number }[], budget: number): string | null {
  if (!Number.isFinite(budget) || budget < 0) return "Invalid budget"
  const total = stops.reduce((sum, s) => sum + (Number.isFinite(s.cost) ? s.cost : 0), 0)
  if (!Number.isFinite(total)) return "Invalid plan costs"
  if (total > Math.ceil(budget * 1.15)) {
    return `total cost KES ${total.toLocaleString()} exceeds the KES ${budget.toLocaleString()} budget — pick a cheaper destination or cut costs`
  }
  // The mirror failure: wasting a generous budget on budget-only spots. Only
  // guarded when there is real headroom, so small budgets never fail.
  if (budget >= 50000 && total < budget * 0.35) {
    return `plan uses only about ${Math.round((total / budget) * 100)}% of the KES ${budget.toLocaleString()} budget — upgrade to a destination that matches the budget`
  }
  return null
}

/**
 * Checks a single regenerated day against roughly one day's share of the
 * trip budget. Returns a rejection reason or null when it fits.
 */
export function validateReplanDayCost(dayCost: number, budget: number, days: number, day: number): string | null {
  const allowance = dailyAllowance(budget, days)
  const ceiling = Math.max(allowance * 2, 6000)
  if (dayCost > ceiling) {
    return `day ${day} costs KES ${dayCost.toLocaleString()}, far above the ~KES ${allowance.toLocaleString()}/day allowance (max ~KES ${Math.round(ceiling).toLocaleString()}) — trim this day's stops`
  }
  return null
}
