'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center gap-4 px-5 py-24 text-center">
      <h2 className="font-serif text-2xl font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground">An unexpected error occurred. Please try again.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  )
}
