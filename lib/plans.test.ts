import { describe, expect, it } from 'vitest'
import { PLAN_PRICES } from './plans'

describe('plan pricing', () => {
  it('charges KES 100 for the 7-day pack', () => {
    expect(PLAN_PRICES[7]).toBe(100)
  })

  it('charges KES 400 for the 30-day pack', () => {
    expect(PLAN_PRICES[30]).toBe(400)
  })

  it('is cheaper per day on the monthly pack', () => {
    expect(PLAN_PRICES[30] / 30).toBeLessThan(PLAN_PRICES[7] / 7)
  })

  it('30 days costs the same as 28 days of weekly packs', () => {
    expect(PLAN_PRICES[30]).toBe((PLAN_PRICES[7] / 7) * 28)
  })
})
