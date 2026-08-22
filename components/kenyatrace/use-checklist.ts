'use client'

import { useCallback, useEffect, useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { toast } from 'sonner'
import { readCache, writeCache } from '@/lib/offline-cache'

interface QueueItem {
  stopId: string
  completed: boolean
}

const queueKey = (tripId: string) => `kt-checklist-${tripId}`

function enqueue(tripId: string, item: QueueItem) {
  const queue = readCache<QueueItem[]>(queueKey(tripId))?.value ?? []
  const idx = queue.findIndex(x => x.stopId === item.stopId)
  if (idx >= 0) queue[idx] = item
  else queue.push(item)
  writeCache(queueKey(tripId), queue)
}

function dequeueAll(tripId: string, stopIds: Set<string>) {
  const queue = readCache<QueueItem[]>(queueKey(tripId))?.value ?? []
  writeCache(queueKey(tripId), queue.filter(x => !stopIds.has(x.stopId)))
}

/**
 * Optimistic checklist toggling that survives dead zones: a tap flips the UI
 * instantly and is queued in localStorage; when the mutation fails (no
 * network) it stays queued and is flushed automatically on reconnect or the
 * next visit. Displayed state = local override on top of the server value,
 * so a queued tap never snaps back while offline.
 */
export function useChecklistToggle(tripId: string) {
  const setCompleted = useMutation(api.trips.setStopCompleted)
  // Callers hold plain strings (cached JSON, doc aliases) — the mutation
  // wants branded ids, so narrow once at the boundary.
  const tid = tripId as Id<'trips'>
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  // Pending offline taps re-apply as overrides so they survive reloads.
  useEffect(() => {
    const queue = readCache<QueueItem[]>(queueKey(tripId))?.value ?? []
    if (!queue.length) return
    setOverrides(prev => {
      const seeded: Record<string, boolean> = {}
      for (const item of queue) seeded[item.stopId] = item.completed
      return { ...seeded, ...prev }
    })
  }, [tripId])

  const flush = useCallback(() => {
    const queue = readCache<QueueItem[]>(queueKey(tripId))?.value ?? []
    if (!queue.length) return
    let remaining = [...queue]
    const next = () => {
      const item = remaining[0]
      if (!item) return
      setCompleted({ tripId: tid, stopId: item.stopId as Id<'tripStops'>, completed: item.completed })
        .then(() => {
          remaining = remaining.slice(1)
          dequeueAll(tripId, new Set([item.stopId]))
          setOverrides(prev => {
            if (!(item.stopId in prev)) return prev
            const nextOverrides = { ...prev }
            delete nextOverrides[item.stopId]
            return nextOverrides
          })
          next()
        })
        .catch(() => {
          // Stay queued — retried on reconnect or next mount. One quiet
          // notice per flush attempt, never per item.
          toast('Still offline — your ticks will sync automatically', { id: 'kt-checklist-sync' })
        })
    }
    next()
  }, [tripId, setCompleted])

  // Flush pending toggles shortly after mount and whenever connectivity
  // returns — the "online" event covers regaining signal mid-visit.
  useEffect(() => {
    const timer = setTimeout(flush, 1500)
    window.addEventListener('online', flush)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('online', flush)
    }
  }, [flush])

  const toggle = useCallback((stopId: string, isDone: boolean) => {
    const completed = !isDone
    setOverrides(prev => ({ ...prev, [stopId]: completed }))
    enqueue(tripId, { stopId, completed })
    setCompleted({ tripId: tid, stopId: stopId as Id<'tripStops'>, completed })
      .then(() => {
        dequeueAll(tripId, new Set([stopId]))
        setOverrides(prev => {
          if (!(stopId in prev)) return prev
          const nextOverrides = { ...prev }
          delete nextOverrides[stopId]
          return nextOverrides
        })
      })
      .catch(() => {
        // Kept queued — the flush cycle will retry.
        toast('Saved offline — syncs when you reconnect', { id: 'kt-checklist-offline' })
      })
  }, [tripId, tid, setCompleted])

  return { overrides, toggle }
}
