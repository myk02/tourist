'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Camera, Check, Copy, Flag, Loader2, MapPin, MessageCircle, Send, Share2, Star, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BrandMark } from '@/components/ui/kt/brand-mark'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { formatKES } from '@/lib/kenya-data'
import { cn } from '@/lib/utils'
import { ListingImage } from '../../shared'
import { useJourney } from '../context'
import { StarRating } from '../bits'

/** Stage 5 — photos, caption and a rating; publishes to the public moments page. */
export function ShareStage() {
  const {
    router, draft, setDraft, goTo,
    saving, handleSaveTrip,
    publishing, files, onPickFiles, removeFile, caption, setCaption,
    handlePublish, copied, copyShareLink, shareLink, shareText,
  } = useJourney()

  // One object URL per file, revoked on change/unmount. Created in an effect
  // (never during render): URL.createObjectURL is a side effect, and a render-
  // phase version leaked blob handles on StrictMode double-renders.
  const [fileUrls, setFileUrls] = useState<Map<File, string>>(() => new Map())
  useEffect(() => {
    const urls = new Map(files.map(f => [f.file, URL.createObjectURL(f.file)]))
    setFileUrls(urls)
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url)
    }
  }, [files])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">Share your experience</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight">{draft.published ? 'Experience shared' : 'How was it?'}</h1>
      </div>

      {!draft.tripId ? (
        <div className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed p-10 text-center">
          <Camera className="size-10 text-primary" />
          <h2 className="font-serif text-3xl">Save your trip first</h2>
          <p className="max-w-md text-muted-foreground">Share this trip&apos;s photos, videos and rating.</p>
          <Button onClick={handleSaveTrip} disabled={saving} className="gap-2">{saving ? <><Loader2 className="size-4 animate-spin" />Saving…</> : 'Save trip'}</Button>
        </div>
      ) : draft.published ? (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4 rounded-2xl border border-primary/25 bg-primary/5 p-5 shadow-soft">
            <BrandMark icon={Check} />
            <div>
              <p className="font-semibold">Your experience is live</p>
              <p className="text-sm text-muted-foreground">Anyone with the link can see your photos, videos and {draft.rating}/5 rating.</p>
            </div>
          </div>

          <Card>
            <CardContent className="flex flex-col gap-4 p-6">
              <p className="text-sm font-medium">Share this experience</p>
              <div className="flex items-center gap-2">
                <Input readOnly value={shareLink} className="flex-1 font-mono text-xs" />
                <Button variant="outline" onClick={() => void copyShareLink()} className="gap-1.5">{copied ? <Check className="size-4 text-primary" /> : <Copy className="size-4" />}{copied ? 'Copied' : 'Copy'}</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" nativeButton={false} render={<a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" />} className="gap-1.5"><MessageCircle className="size-4" />WhatsApp</Button>
                <Button variant="outline" nativeButton={false} render={<a href={`https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer" />} className="gap-1.5"><Send className="size-4" />Telegram</Button>
                <Button variant="outline" nativeButton={false} render={<a href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(shareLink)}`} target="_blank" rel="noopener noreferrer" />} className="gap-1.5"><Share2 className="size-4" />Post</Button>
                <Button variant="ghost" nativeButton={false} render={<a href={`/moments/${draft.tripId}`} target="_blank" rel="noopener noreferrer" />}>Open shared page</Button>
              </div>
              <p className="text-xs text-muted-foreground">Know someone planning a trip? Send them the link — it works without an account.</p>
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => goTo('track')}>Back</Button>
            <Button size="lg" onClick={() => goTo('done')} className="gap-2">Finish session <Flag className="size-4" /></Button>
          </div>
        </div>
      ) : (
        <>
          <Card>
            <CardContent className="flex flex-col gap-5 p-6">
              <div>
                <p className="text-sm font-medium">Photos & videos</p>
                <div className="mt-2">
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-8 text-center transition-colors hover:border-primary/40 hover:bg-primary/5">
                    <Camera className="size-8 text-primary" />
                    <span className="text-sm font-medium">Tap to add photos or videos</span>
                    <span className="text-xs text-muted-foreground">Up to 8 files · JPG, PNG, MP4</span>
                    <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => { onPickFiles(e.target.files); e.target.value = '' }} />
                  </label>
                </div>
                {files.length > 0 && (
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {files.map((f, i) => (
                      <div key={i} className="relative aspect-square overflow-hidden rounded-xl border">
                        {f.video ? (
                          <video src={fileUrls.get(f.file) ?? ''} className="size-full object-cover" muted playsInline />
                        ) : (
                          <ListingImage src={fileUrls.get(f.file) ?? ''} alt={`Preview of ${f.file.name}`} fill className="object-cover" sizes="160px" />
                        )}
                        <button
                          type="button"
                          aria-label={`Remove ${f.file.name}`}
                          onClick={() => removeFile(i)}
                          className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-full bg-black/60 text-white after:absolute after:-inset-2 after:content-['']"
                        >
                          <X className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="text-sm font-medium">Caption</label>
                <Input className="mt-1" value={caption} onChange={e => setCaption(e.target.value)} placeholder="The story behind this trip…" />
              </div>

              <div className="rounded-xl border bg-card p-4">
                <p className="text-sm font-medium">Rate your experience</p>
                <div className="mt-2"><StarRating value={draft.rating} onChange={n => setDraft(d => ({ ...d, rating: n }))} /></div>
                <p className="mt-1 text-xs text-muted-foreground">{draft.rating ? `${draft.rating}/5 — ${draft.rating >= 4 ? 'glad you loved it' : draft.rating === 3 ? 'worthwhile trip' : 'thanks for the honest review'}` : 'Tap a star to rate'}</p>
                <Textarea className="mt-3" value={draft.review} onChange={e => setDraft(d => ({ ...d, review: e.target.value }))} placeholder="A short review (optional)…" />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button variant="outline" onClick={() => goTo('track')}>Back</Button>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => router.push('/discover')}>Skip for now</Button>
              <Button size="lg" onClick={handlePublish} disabled={publishing || draft.rating === 0} className="gap-2">
                {publishing ? <><Loader2 className="size-4 animate-spin" />Publishing…</> : <><Share2 className="size-4" />Publish &amp; share</>}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/** Stage 6 — session wrap-up. */
export function DoneStage() {
  const { draft, plan, resetSession } = useJourney()

  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-6 py-6 text-center">
      <BrandMark icon={Flag} size="lg" className="rounded-full shadow-pop" />
      <h1 className="font-serif text-4xl font-semibold tracking-tight">Session complete</h1>
      <p className="max-w-md text-muted-foreground">
        {plan ? `You planned ${plan.destination} from ${draft.origin} over ${draft.days} day${draft.days === 1 ? '' : 's'} on a ${formatKES(draft.budget)} budget${draft.rating ? `, and rated it ${draft.rating}/5` : ''}.` : 'Your Kenya journey is complete.'}
      </p>

      {draft.rating > 0 && (
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(n => <Star key={n} className={cn('size-6', n <= draft.rating ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />)}
        </div>
      )}

      <div className="mt-2 flex flex-wrap justify-center gap-3">
        <Button size="lg" onClick={resetSession} className="gap-2"><MapPin className="size-4" />Start a new session</Button>
        <Button variant="outline" nativeButton={false} render={<Link href="/trips" />}>View my trips</Button>
      </div>
      <p className="text-xs text-muted-foreground">Every session plans one destination — pick a new one and go again.</p>
    </div>
  )
}
