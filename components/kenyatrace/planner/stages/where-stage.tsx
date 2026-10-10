'use client'

import { useState } from 'react'
import { ArrowRight, Check, ClipboardPaste, LocateFixed, MapPin, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/ui/kt/brand-mark'
import { Spinner } from '@/components/ui/kt/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { formatKES, wikimediaThumb } from '@/lib/kenya-data'
import { cn } from '@/lib/utils'
import { KenyaMap } from '../../kenya-map'
import { SampleTraceDialog } from '../../sample-trace'
import { ListingImage } from '../../shared'
import { useJourney } from '../context'
import { JOURNEY_HERO, MODELS, PASTE_HINT_PREFIX, TRAVELERS, interestsFromMatches, matchCatalogPlaces, type CatalogMatch } from '../lib'


/**
 * Start-from-anywhere v1: paste a WhatsApp forward, blog paragraph or listing
 * link and we match it against the verified catalog on the client — no AI,
 * nothing invented. Matches seed interest chips and travel with the plan
 * request as destination hints.
 */
function PasteBox() {
  const { allListings, setDraft } = useJourney()
  const [text, setText] = useState('')
  const [found, setFound] = useState<{ places: CatalogMatch[]; towns: string[]; interests: string[] } | null>(null)

  function apply() {
    const { places, towns } = matchCatalogPlaces(text, allListings)
    if (!places.length && !towns.length) {
      setFound({ places: [], towns: [], interests: [] })
      return
    }
    const interests = interestsFromMatches(places)
    const names = [...new Set([...places.map(p => p.name), ...towns])].slice(0, 6)
    setFound({ places, towns, interests })
    setDraft(d => ({
      ...d,
      interests: [...new Set([...d.interests, ...interests])],
      // One paste hint at a time — a new paste replaces the previous one.
      extra: `${PASTE_HINT_PREFIX}${names.join(', ')}`,
    }))
    toast.success(`${names.length > 1 ? `${names.length} ideas` : names[0]} added to your brief`)
  }

  return (
    <div className="rounded-none border border-dashed border-primary/40 bg-primary/[0.03] p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><ClipboardPaste className="size-4 text-primary" />Start from anything</p>
      <p className="mt-1 text-xs text-muted-foreground">Paste a WhatsApp forward, a blog paragraph or a listing link — we&apos;ll spot the Kenya places we know and weave them into your plan.</p>
      <Textarea
        className="mt-3 min-h-20 bg-card"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="e.g. “We were thinking Maasai Mara for two nights, then Diani…”"
        aria-label="Paste trip notes"
      />
      <div className="mt-2 flex items-center gap-3">
        <Button variant="outline" size="sm" onClick={apply} disabled={!text.trim()} className="gap-1.5">
          <Sparkles className="size-3.5" />Find ideas
        </Button>
        {text.trim() && found && (
          <button type="button" onClick={() => { setText(''); setFound(null) }} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            Clear
          </button>
        )}
      </div>
      {found && (
        found.places.length || found.towns.length ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {[...found.places.map(p => p.name), ...found.towns].map(n => (
              <span key={n} className="rounded-none bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{n}</span>
            ))}
            {found.interests.length > 0 && (
              <span className="text-xs text-muted-foreground">· interested in {found.interests.join(', ').toLowerCase()}</span>
            )}
            <span className="w-full text-[11px] text-muted-foreground">Matched against our verified catalog — they&apos;ll guide your plan.</span>
          </div>
        ) : (
          <p className="mt-3 text-xs text-muted-foreground">No catalog matches in that yet — add interests on the next step and we&apos;ll take it from there.</p>
        )
      )}
    </div>
  )
}

/** Stage 1 — where the traveller is, who's going, how long, plus models and the start-from-anything box. */
export function WhereStage() {
  const {
    isSignedIn, draft, setDraft, goTo,
    locating, locError, manualArea, setManualArea, resolvingArea, locate, resolveArea, applyModel,
    originPoints, originHighlight, originFocus,
  } = useJourney()

  return (
    <div className="flex flex-col gap-6">
      <div className="relative h-56 overflow-hidden rounded-none text-white shadow-soft md:h-64">
        <ListingImage src={wikimediaThumb(JOURNEY_HERO)} alt="Kenya" fill priority className="object-cover" sizes="100vw" />
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative flex h-full flex-col justify-end p-6 md:p-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-amber-300">KenyaTrace — Travel Kenya your way</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight md:text-5xl">Discover, plan, book and trace Kenya</h1>
          <p className="mt-3 max-w-xl text-white/85">AI-built day-by-day itineraries from your exact location, verified stays and experiences in KSh, M-Pesa checkout, live GPS trace and shareable moments.</p>
        </div>
      </div>

      {/* Signed-out visitors get the value story in one quiet line —
          planning is free, an account only enters at save time. */}
      {!isSignedIn && (
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 rounded-none border bg-card px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <span className="flex items-center gap-1.5"><Sparkles className="size-3.5 text-primary" />AI builds your day-by-day route</span>
          <span className="flex items-center gap-1.5"><Check className="size-3.5 text-primary" />Free to plan — sign in only to save</span>
          <span className="flex items-center gap-1.5"><MapPin className="size-3.5 text-primary" />Made for Kenya · prices in KSh</span>
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <Card className="flex-1">
          <CardContent className="flex flex-col gap-5 p-6">
            <div>
              <p className="text-sm font-medium">Your exact location</p>
              <div className="mt-3">
                {!draft.origin ? (
                  <div className="flex flex-col gap-3">
                    <Button size="lg" onClick={locate} disabled={locating} className="w-full gap-2 sm:w-auto">
                      <LocateFixed className="size-5" />{locating ? 'Finding your exact location…' : 'Use my location'}
                    </Button>
                    {locError && <p className="text-sm text-destructive">{locError}</p>}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
                    </div>
                    <div className="flex gap-2">
                      <Input
                        className="flex-1"
                        value={manualArea}
                        onChange={e => setManualArea(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') void resolveArea() }}
                        placeholder="Type your area, e.g. Westlands, Nairobi"
                      />
                      <Button variant="outline" onClick={() => void resolveArea()} disabled={!manualArea.trim() || resolvingArea}>
                        {resolvingArea ? '…' : 'Set'}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-none border border-primary/30 bg-primary/5 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <BrandMark icon="mapPin" size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{draft.origin}</p>
                          <p className="text-xs text-muted-foreground">
                            {draft.originLat != null && draft.originLng != null
                              ? `${Math.abs(draft.originLat).toFixed(4)}°${draft.originLat < 0 ? 'S' : 'N'}, ${Math.abs(draft.originLng).toFixed(4)}°${draft.originLng < 0 ? 'W' : 'E'} · exact location`
                              : 'Area set'}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button variant="outline" size="sm" onClick={() => setDraft(d => ({ ...d, origin: '', originLat: undefined, originLng: undefined }))}>Change</Button>
                        <Button variant="outline" size="sm" onClick={locate} disabled={locating}>{locating ? <Spinner label="Locating" /> : 'Re-locate'}</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium">Who&apos;s travelling?</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {TRAVELERS.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={draft.traveler === t.id}
                    onClick={() => setDraft(d => ({ ...d, traveler: t.id }))}
                    className={cn(
                      'rounded-none border p-3 text-left transition-colors',
                      draft.traveler === t.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/40 hover:bg-card',
                    )}
                  >
                    <p className="text-sm font-semibold">{t.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t.text}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">How many days?</p>
                <span className="text-sm font-semibold text-primary">{draft.days} day{draft.days === 1 ? '' : 's'}</span>
              </div>
              <Slider className="mt-3" min={1} max={14} step={1} value={[draft.days]} onValueChange={v => setDraft(d => ({ ...d, days: Array.isArray(v) ? v[0] : v }))} aria-label="Trip length in days" />
            </div>

            <div>
              <p className="text-sm font-medium">Or start from a model</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {MODELS.map(m => (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() => applyModel(m)}
                    className="rounded-none border p-3 text-left transition-colors hover:border-primary/50 hover:bg-primary/5"
                  >
                    <p className="text-sm font-semibold">{m.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{m.days} days · {formatKES(m.budget)}</p>
                  </button>
                ))}
              </div>
            </div>

            <PasteBox />

            <div className="flex flex-wrap items-center gap-3">
              <Button size="lg" disabled={!draft.origin || !draft.traveler} onClick={() => goTo('budget')} className="gap-2">
                Continue <ArrowRight className="size-4" />
              </Button>
              <SampleTraceDialog />
            </div>
          </CardContent>
        </Card>          <div className="w-full lg:w-96">
          <KenyaMap
            points={originPoints}
            highlight={originHighlight}
            focus={originFocus}
            className="h-72 lg:h-96"
          />
        </div>
      </div>
    </div>
  )
}
