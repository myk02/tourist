import type { Metadata } from 'next'
import { PlanHub } from '@/components/kenyatrace/plan-hub'

export const metadata: Metadata = { title: 'Plan a trip' }

export default function PlanPage() {
  return <PlanHub />
}
