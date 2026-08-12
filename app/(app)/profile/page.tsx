import type { Metadata } from 'next'
import { Profile } from '@/components/kenyatrace/profile-page'

export const metadata: Metadata = { title: 'Profile' }

export default function ProfilePage() {
  return <Profile />
}
