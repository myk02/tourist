import type { Metadata } from 'next'
import { Home } from '@/components/kenyatrace/home'

export const metadata: Metadata = { title: 'Plan your Kenya trip' }

export default function HomePage() {
  return <Home />
}
