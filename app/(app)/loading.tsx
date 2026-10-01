export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl p-8">
      <div className="kt-shimmer h-48 rounded-none" />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="kt-shimmer h-32 rounded-none" />
        <div className="kt-shimmer h-32 rounded-none" />
      </div>
    </div>
  )
}
