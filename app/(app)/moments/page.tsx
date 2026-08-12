import type { Metadata } from 'next'
import { Moments } from '@/components/kenyatrace/moments-page'

export const metadata: Metadata = { title: 'Moments' }

export default function MomentsPage() {
  return <Moments />
}
