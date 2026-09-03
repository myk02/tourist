import type { Metadata } from 'next'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { TripDetail } from '@/components/kenyatrace/trip-detail'

export const metadata: Metadata = { title: 'Trip' }

export default async function TripDetailPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')
  return <TripDetail />
}
