import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 p-6">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  )
}