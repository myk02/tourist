'use client'

import { Suspense } from 'react'
import { KenyaTraceShell } from '@/components/kenyatrace/app-shell'
import { TrackingProvider } from '@/components/kenyatrace/tracking-provider'
import { TrackerWidget } from '@/components/kenyatrace/tracker-widget'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TrackingProvider>
      <Suspense>
        <KenyaTraceShell>{children}</KenyaTraceShell>
      </Suspense>
      <TrackerWidget />
    </TrackingProvider>
  )
}
