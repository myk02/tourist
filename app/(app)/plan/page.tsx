import type { Metadata } from 'next'
import { GuidedJourney } from '@/components/kenyatrace/guided-journey'

export const metadata: Metadata = { title: 'Plan a trip' }

export default function PlanPage() {
  return <GuidedJourney />
}
