'use client'

import { useMemo, useState } from 'react'
import { AlertTriangle, BookOpenText, Copy, Download, Landmark, Phone, Siren, Wallet } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BUSH_CHECKLIST, EMBASSIES, EMERGENCY_CONTACTS, PARK_FEES, parkFeeEstimate, sosMessage, type Residency } from '@/lib/safari-safety'
import { SWAHILI_CATEGORIES, filterPhrases, type SwahiliCategory } from '@/lib/swahili'
import { buildGpx, downloadTextFile, gpxFilename } from '@/lib/gpx'
import { formatKES } from '@/lib/kenya-data'

export interface EssentialsStop {
  name: string
  place?: string | null
  lat?: number | null
  lng?: number | null
  day?: number | null
  time?: string | null
}

/**
 * Trip Essentials — the Kenya-specific companion none of the generic
 * planners ship: SOS safety centre, KWS park-fee estimator, offline
 * Swahili kit, tourist M-Pesa guide and one-tap GPX vault export.
 */
export function TripEssentials({ tripName, stops, traceUrl }: {
  tripName: string
  stops: EssentialsStop[]
  traceUrl?: string
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <SafetyCard traceUrl={traceUrl} />
      <ParkFeeCard />
      <SwahiliCard />
      <MpesaAndVaultCard tripName={tripName} stops={stops} />
    </div>
  )
}

function SafetyCard({ traceUrl }: { traceUrl?: string }) {
  const [copied, setCopied] = useState(false)

  async function copySos() {
    const url = traceUrl ?? (typeof window !== 'undefined' ? window.location.href : 'your live-trace link')
    try {
      await navigator.clipboard.writeText(sosMessage(url))
      setCopied(true)
      toast.success('SOS message copied — paste into SMS/WhatsApp')
      setTimeout(() => setCopied(false), 2_000)
    } catch {
      toast.error('Could not copy — long-press to share manually')
    }
  }

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Siren className="size-4 text-destructive" /> Safety centre</CardTitle>
        <CardDescription>Kenya emergency numbers, embassies & the bush checklist. Works offline once opened.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          {EMERGENCY_CONTACTS.map(c => (
            <a key={c.name} href={c.telHref} className="flex items-center gap-2.5 rounded-none border px-3 py-2 text-sm transition-colors hover:bg-muted/60">
              <Phone className="size-3.5 shrink-0 text-destructive" />
              <span className="min-w-0 flex-1"><strong>{c.name}</strong><span className="block truncate text-xs text-muted-foreground">{c.number} · {c.note}</span></span>
            </a>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {EMBASSIES.map(e => (
            <a key={e.country} href={e.telHref} className="rounded-none border bg-muted/50 px-2.5 py-1 text-xs font-medium hover:bg-muted">{e.country} · {e.phone}</a>
          ))}
        </div>
        <div className="rounded-none border border-amber-500/30 bg-amber-500/10 p-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200"><AlertTriangle className="size-3.5" /> Before the bush</p>
          <ul className="mt-1.5 flex flex-col gap-1 text-sm">
            {BUSH_CHECKLIST.map(item => <li key={item} className="flex gap-2"><span aria-hidden>•</span><span>{item}</span></li>)}
          </ul>
        </div>
        <Button variant="destructive" onClick={() => void copySos()} className="gap-1.5">
          <Copy className="size-4" /> {copied ? 'Copied!' : 'Copy SOS message'}
        </Button>
      </CardContent>
    </Card>
  )
}

function ParkFeeCard() {
  const [park, setPark] = useState(PARK_FEES[0].park)
  const [residency, setResidency] = useState<Residency>('non-resident')
  const [days, setDays] = useState('2')
  const estimate = useMemo(() => {
    const d = parseInt(days, 10)
    return parkFeeEstimate(park, residency, Number.isFinite(d) ? d : 1)
  }, [park, residency, days])
  const row = PARK_FEES.find(p => p.park === park)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Landmark className="size-4" /> Park-fee estimator</CardTitle>
        <CardDescription>KWS planning estimates — confirm at the gate. Migration peaks Jul–Oct.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="grid gap-2 sm:grid-cols-[1fr_150px_90px]">
          <Select value={park} onValueChange={v => { if (v) setPark(v) }}>
            <SelectTrigger aria-label="Park"><SelectValue /></SelectTrigger>
            <SelectContent>{PARK_FEES.map(p => <SelectItem key={p.park} value={p.park}>{p.park}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={residency} onValueChange={v => { if (v) setResidency(v as Residency) }}>
            <SelectTrigger aria-label="Residency"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="citizen">Citizen</SelectItem>
              <SelectItem value="resident">Resident</SelectItem>
              <SelectItem value="non-resident">Non-resident</SelectItem>
            </SelectContent>
          </Select>
          <Input value={days} onChange={e => setDays(e.target.value)} inputMode="numeric" aria-label="Days" maxLength={2} />
        </div>
        <div className="rounded-none border bg-muted/40 px-3.5 py-2.5 text-sm" data-testid="park-estimate">
          <span className="font-semibold">
            {estimate == null ? '—' : residency === 'non-resident' ? `$${estimate} USD` : formatKES(estimate)}
          </span>
          <span className="text-muted-foreground"> estimated gate fees{row ? ` · ${row.note}` : ''}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function SwahiliCard() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<SwahiliCategory>('All')
  const rows = useMemo(() => filterPhrases(q, cat).slice(0, 12), [q, cat])

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied')
    } catch {
      toast.error('Could not copy')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><BookOpenText className="size-4" /> Swahili survival kit</CardTitle>
        <CardDescription>Offline phrases with pronunciation — tap to copy for the market or the guide.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2.5">
        <div className="grid gap-2 sm:grid-cols-[1fr_150px]">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search e.g. elephants, M-Pesa…" aria-label="Search phrases" />
          <Select value={cat} onValueChange={v => { if (v) setCat(v as SwahiliCategory) }}>
            <SelectTrigger aria-label="Category"><SelectValue /></SelectTrigger>
            <SelectContent>{SWAHILI_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {rows.length === 0 ? (
          <p className="py-2 text-center text-sm text-muted-foreground">No phrases match — try “hello” or “help”.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {rows.map(p => (
              <button key={p.swahili} type="button" onClick={() => void copy(p.swahili)} className="flex items-center gap-2.5 rounded-none border px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60">
                <span className="min-w-0 flex-1"><strong>{p.swahili}</strong><span className="block truncate text-xs text-muted-foreground">{p.english} · say “{p.say}” · {p.category}</span></span>
                <Copy className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function MpesaAndVaultCard({ tripName, stops }: { tripName: string; stops: EssentialsStop[] }) {
  const geoCount = stops.filter(s => s.lat != null && s.lng != null).length

  function exportGpx() {
    if (geoCount === 0) {
      toast.error('Add mapped stops first — GPX needs coordinates')
      return
    }
    try {
      downloadTextFile(gpxFilename(tripName), buildGpx(tripName, stops))
      toast.success(`GPX downloaded — open in Maps.me or Organic Maps`)
    } catch {
      toast.error('Could not create the GPX file')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Wallet className="size-4" /> M-Pesa guide + offline vault</CardTitle>
        <CardDescription>Tourists can use M-Pesa with a Safaricom SIM + passport. Mara signal drops — go offline-ready.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <ol className="flex flex-col gap-1.5">
          <li><strong>1.</strong> Buy a Safaricom SIM at JKIA arrivals (passport needed).</li>
          <li><strong>2.</strong> Dial <code>*334#</code> → Lipa na M-Pesa → Buy Goods (till) or Paybill.</li>
          <li><strong>3.</strong> Keep <strong>KES 10,000–20,000 cash</strong> backup for the Mara & Tsavo dead zones.</li>
          <li><strong>4.</strong> If STK push stalls, money stays in your wallet — retry with signal.</li>
        </ol>
        <div className="flex flex-wrap gap-2">
          <a href="tel:*334%23" className="inline-flex h-9 items-center gap-1.5 rounded-none border bg-muted px-3.5 text-sm font-medium hover:bg-muted/70"><Wallet className="size-4" /> Open M-Pesa (*334#)</a>
          <Button variant="outline" onClick={exportGpx} className="gap-1.5"><Download className="size-4" /> Download GPX ({geoCount} pins)</Button>
        </div>
        <p className="text-xs text-muted-foreground">GPX carries every mapped stop + the route track. Print/PDF stays in the trip’s More menu.</p>
      </CardContent>
    </Card>
  )
}
