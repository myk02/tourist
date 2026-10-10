import type { Metadata } from 'next'
import { TripEssentials } from '@/components/kenyatrace/trip-essentials'
import { GradientHero } from '@/components/ui/kt/gradient-hero'

export const metadata: Metadata = {
  title: 'Essentials',
  description: 'Kenya trip essentials: safety centre, park fees, Swahili kit, M-Pesa guide and GPX offline export.',
}

export default function EssentialsPage() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8">
      <GradientHero className="px-6 py-10 md:px-10">
        <p className="text-xs font-semibold uppercase tracking-widest opacity-70">Kenya essentials</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">Safety, Swahili & park fees</h1>
        <p className="mt-2 max-w-2xl opacity-80">
          The offline-ready companion for the road: emergency numbers, KWS fee estimates,
          survival Swahili and the tourist M-Pesa playbook. No signal in the Mara? This page still works once opened.
        </p>
      </GradientHero>
      <TripEssentials tripName="Kenya trip" stops={[]} />
    </div>
  )
}
