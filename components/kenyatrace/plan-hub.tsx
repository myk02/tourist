'use client'

import { Plus, Sparkles } from 'lucide-react'
import { EntryCard } from './home'
import { Trips } from './trips-page'

export function PlanHub(){return <div className="mx-auto flex max-w-6xl flex-col gap-10 px-5 py-10"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Trip planner</p><h1 className="mt-2 font-serif text-4xl font-semibold tracking-tight text-balance">How do you want to plan?</h1><p className="mt-3 text-lg text-muted-foreground">Start with an idea or build every stop yourself.</p></div><div className="grid gap-5 md:grid-cols-2"><EntryCard href="/plan/ai" icon={Sparkles} title="Plan with AI" text="Share your dates, budget and travel style. Get a grounded Kenya itinerary in moments."/><EntryCard href="/plan/manual" icon={Plus} title="Plan it myself" text="Add verified places to a live day-by-day itinerary and budget."/></div><Trips compact/></div>}
