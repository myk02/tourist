import type { Metadata } from 'next'
import { Home } from '@/components/kenyatrace/home'

export const metadata: Metadata = { title: 'Discover' }

export default function HomePage() {
  return <Home />
}
