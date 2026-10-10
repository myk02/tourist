/**
 * Fair group settlement for trip expenses (the Splitwise-style core).
 * Pure functions so they are unit-testable and reusable in the UI.
 *
 * Inputs: individual expense rows ({amount, spentBy}) + headcount.
 * Output: per-person paid/share/balance + the minimal transfer plan that
 * settles all debts (greedy largest-debtor → largest-creditor matching).
 */

export interface SettlementExpense {
  amount: number
  spentBy?: string | null
}

export interface PersonBalance {
  name: string
  paid: number
  share: number
  balance: number // paid - share; >0 is owed money, <0 owes money
}

export interface SettlementTransfer {
  from: string
  to: string
  amount: number
}

export interface SettlementPlan {
  total: number
  perPerson: number
  headcount: number
  balances: PersonBalance[]
  transfers: SettlementTransfer[]
}

/** Normalize free-text payer names ("  alice " → "Alice"). */
export function normalizePayer(raw?: string | null): string | null {
  if (!raw) return null
  const text = raw.trim().replace(/\s+/g, ' ').slice(0, 80)
  if (!text) return null
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Compute who paid what, the equal share, and the minimal transfers.
 * - Expenses without a payer count toward the total (shared pot) but are
 *   attributed to no one, so named payers cover them via transfers.
 * - Unknown extra travellers are labelled "Traveller N".
 * - Amounts are rounded to whole KES; dust (<1 KES) transfers are dropped.
 */
export function computeSettlement(
  expenses: SettlementExpense[],
  headcount: number,
): SettlementPlan {
  const heads = Number.isFinite(headcount) && headcount > 0 ? Math.floor(headcount) : 1
  const total = expenses.reduce(
    (s, e) => s + (Number.isFinite(e.amount) && e.amount > 0 ? e.amount : 0),
    0,
  )
  const perPerson = heads > 0 ? Math.round((total / heads) * 100) / 100 : total

  const paidBy = new Map<string, number>()
  for (const e of expenses) {
    if (!Number.isFinite(e.amount) || e.amount <= 0) continue
    const name = normalizePayer(e.spentBy)
    if (!name) continue
    paidBy.set(name, (paidBy.get(name) ?? 0) + e.amount)
  }

  const names: string[] = [...paidBy.keys()]
  for (let i = names.length + 1; i <= heads; i++) names.push(`Traveller ${i}`)

  const balances: PersonBalance[] = names.map(name => {
    const paid = Math.round((paidBy.get(name) ?? 0) * 100) / 100
    const balance = Math.round((paid - perPerson) * 100) / 100
    return { name, paid, share: perPerson, balance }
  })
  // Deterministic order: biggest payer first.
  balances.sort((a, b) => b.paid - a.paid || a.name.localeCompare(b.name))

  // Greedy settlement: largest debtor pays largest creditor.
  const debtors = balances
    .filter(b => b.balance < -0.5)
    .map(b => ({ ...b, owed: -b.balance }))
    .sort((a, b) => b.owed - a.owed)
  const creditors = balances
    .filter(b => b.balance > 0.5)
    .map(b => ({ ...b, due: b.balance }))
    .sort((a, b) => b.due - a.due)

  const transfers: SettlementTransfer[] = []
  let i = 0
  let j = 0
  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]
    const c = creditors[j]
    const amount = Math.round(Math.min(d.owed, c.due))
    if (amount >= 1) {
      transfers.push({ from: d.name, to: c.name, amount })
      d.owed -= amount
      c.due -= amount
    }
    if (d.owed < 0.5) i++
    if (c.due < 0.5) j++
    // Safety: avoid infinite loop on rounding residue.
    if (amount < 1) {
      i++
      j++
    }
  }

  return { total, perPerson, headcount: heads, balances, transfers }
}

/** "Alice → Brian: KSh 1,200" lines for copy-to-WhatsApp. */
export function settlementMessage(plan: SettlementPlan): string {
  if (plan.transfers.length === 0) return 'All settled up — no one owes anything.'
  return plan.transfers
    .map(t => `${t.from} → ${t.to}: KSh ${new Intl.NumberFormat('en-KE').format(t.amount)}`)
    .join('\n')
}
