'use client'

import { useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { Check, MessageSquare, Send, ThumbsUp, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useChecklistToggle } from './use-checklist'

export interface ChecklistStop {
  _id: string
  day: number
  time: string
  name: string
  place: string
  kind: string
  completedAt?: number
}

/**
 * The trip checklist: day-by-day stops the traveller checks off as they go,
 * with live progress ("7 of 14 done"). Viewers get a read-only list — only
 * the owner and editors can toggle stops. Toggles are optimistic and queue
 * offline (useChecklistToggle), so the list stays usable in airplane mode.
 *
 * With `collab`, the checklist becomes the trip's group layer (Tripnotes-lite,
 * no chat): editors/owners can drop a thumb on any stop and leave short notes
 * on a day; everyone with access sees counts and threads live. Viewers are
 * read-only — the mutations enforce it server-side too.
 */
export function TripChecklist({ tripId, stops, editable = true, collab = false, isOwner = false }: { tripId: string; stops: ChecklistStop[]; editable?: boolean; collab?: boolean; isOwner?: boolean }) {
  const { user } = useUser()
  const myId = user?.id
  const { overrides, toggle } = useChecklistToggle(tripId)
  const setVote = useMutation(api.trips.setStopVote)
  const votes = useQuery(api.trips.votesForTrip, collab ? { tripId: tripId as never } : 'skip')
  const notes = useQuery(api.trips.dayNotesForTrip, collab ? { tripId: tripId as never } : 'skip')

  const isDone = (s: ChecklistStop) => overrides[s._id] ?? !!s.completedAt
  const done = stops.filter(isDone).length
  const pct = stops.length ? Math.round((done / stops.length) * 100) : 0
  const days = [...new Set(stops.map(s => s.day))].sort((a, b) => a - b)

  // Vote aggregation: total ups per stop + this user's own vote state.
  const upCount = new Map<string, number>()
  const myVotes = new Set<string>()
  for (const v of votes ?? []) {
    if (v.vote !== 'up') continue
    upCount.set(v.stopId, (upCount.get(v.stopId) ?? 0) + 1)
    if (myId && v.userId === myId) myVotes.add(v.stopId)
  }

  async function vote(stopId: string) {
    if (!collab || !editable) return
    try {
      await setVote({ stopId: stopId as never, vote: myVotes.has(stopId) ? null : 'up' })
    } catch {
      toast.error('Could not save your thumb')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Trip checklist</p>
          <p className="text-sm font-semibold text-primary">{done} of {stops.length} done</p>
        </div>
        <Progress className="mt-2 h-2" value={pct} />
        {stops.length > 0 && pct === 100 && <p className="mt-1 text-xs font-medium text-primary">Every stop checked off — trip complete!</p>}
      </div>

      {stops.length === 0 ? (
        <p className="text-sm text-muted-foreground">This trip has no stops yet.</p>
      ) : (
        days.map(day => (
          <div key={day}>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Day {day}</p>
            <div className="flex flex-col gap-1.5">
              {stops
                .filter(s => s.day === day)
                .sort((a, b) => a.time.localeCompare(b.time))
                .map(s => {
                  const checked = isDone(s)
                  const ups = upCount.get(s._id) ?? 0
                  return (
                    <div key={s._id} className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => toggle(s._id, checked)}
                        aria-pressed={checked}
                        className={cn(
                          'flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                          checked ? 'border-primary/40 bg-primary/5' : 'border-border hover:border-primary/40 hover:bg-card',
                          !editable && 'cursor-default',
                        )}
                      >
                        <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors', checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 text-transparent')}>
                          <Check className="size-3.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn('block truncate text-sm font-medium', checked && 'text-muted-foreground line-through')}>{s.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">{s.time} · {s.place} · {s.kind}</span>
                        </span>
                      </button>
                      {collab && (
                        <button
                          type="button"
                          disabled={!editable}
                          onClick={() => void vote(s._id)}
                          aria-label={`Thumbs up ${s.name}`}
                          className={cn(
                            'flex h-9 shrink-0 items-center gap-1 rounded-xl border px-2.5 text-xs font-semibold transition-colors',
                            myVotes.has(s._id) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                            !editable && 'cursor-default opacity-70',
                          )}
                        >
                          <ThumbsUp className="size-3.5" />{ups > 0 ? ups : ''}
                        </button>
                      )}
                    </div>
                  )
                })}
            </div>
            {collab && <DayNotes tripId={tripId} day={day} notes={notes} canPost={editable} isOwner={isOwner} myId={myId} />}
          </div>
        ))
      )}
    </div>
  )
}

/** One lightweight thread per day — short notes, no chat. */
function DayNotes({ tripId, day, notes, canPost, isOwner, myId }: { tripId: string; day: number; notes: ReturnType<typeof useQuery<typeof api.trips.dayNotesForTrip>> | undefined; canPost: boolean; isOwner: boolean; myId?: string }) {
  const addNote = useMutation(api.trips.addDayNote)
  const removeNote = useMutation(api.trips.removeDayNote)
  const [body, setBody] = useState('')
  const [posting, setPosting] = useState(false)

  const dayNotesList = notes?.filter(n => n.day === day) ?? []

  async function post() {
    const text = body.trim()
    if (!text) return
    setPosting(true)
    try {
      await addNote({ tripId: tripId as never, day, body: text })
      setBody('')
    } catch {
      toast.error('Could not add the note')
    } finally {
      setPosting(false)
    }
  }

  async function remove(id: string) {
    try {
      await removeNote({ noteId: id as never })
    } catch {
      toast.error('Could not remove the note')
    }
  }

  return (
    <div className="mt-1.5 ml-8 flex flex-col gap-1.5 border-l-2 border-border/70 pl-3">
      {dayNotesList.map(n => (
        <div key={n._id} className="group flex items-start gap-2 text-xs">
          <MessageSquare className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
          <p className="min-w-0 flex-1 text-muted-foreground">
            <span className="font-medium text-foreground">{n.authorName ?? 'Traveller'}</span> {n.body}
            <span className="ml-1.5 whitespace-nowrap opacity-60">{new Date(n.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
          </p>
          {(isOwner || (myId && n.authorId === myId)) && (
            <button type="button" aria-label="Remove note" onClick={() => void remove(n._id)} className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100">
              <X className="size-3" />
            </button>
          )}
        </div>
      ))}
      {canPost && (
        <div className="flex items-center gap-1.5">
          <Input
            value={body}
            onChange={e => setBody(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void post() }}
            placeholder="Add a note for this day…"
            className="h-8 bg-card text-xs"
            maxLength={500}
          />
          <Button variant="ghost" size="sm" className="size-8 shrink-0 p-0" onClick={() => void post()} disabled={!body.trim() || posting} aria-label="Add note">
            <Send className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
