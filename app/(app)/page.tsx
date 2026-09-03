import type { Metadata } from 'next'
import { GuidedJourney } from '@/components/kenyatrace/guided-journey'

export const metadata: Metadata = { title: 'Plan your Kenya trip' }

export default function HomePage() {
  return <GuidedJourney />
}
