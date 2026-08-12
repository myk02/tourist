'use client'

import { Suspense } from 'react'
import { KenyaTraceShell } from '@/components/kenyatrace/app-shell'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <Suspense><KenyaTraceShell>{children}</KenyaTraceShell></Suspense>
}
