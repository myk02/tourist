'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-5 py-12 text-center">
      <h2 className="font-serif text-xl font-semibold">Could not load this page</h2>
      <p className="text-sm text-muted-foreground">Please check your connection and try again.</p>
      <Button variant="outline" onClick={reset}>Retry</Button>
    </div>
  )
}
