import type { Metadata } from 'next'
import { ManualPlanner } from '@/components/kenyatrace/manual-planner'

export const metadata: Metadata = { title: 'Plan it yourself' }

export default function PlanManualPage() {
  return <ManualPlanner />
}
