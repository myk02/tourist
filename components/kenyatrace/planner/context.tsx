'use client'

import type { Dispatch, SetStateAction } from 'react'
import { createContext, useContext } from 'react'
import type { useRouter } from 'next/navigation'
import type { TrackingSession } from '../tracking-provider'
import type { Stop } from '../types'
import type { StayAlternative } from '../where-you-stay'
import type { Draft, JourneyPlan, ListingDoc, MapPoint, PickedFile, PlannerModel, Stage } from './lib'

/**
 * Everything the per-stage components need from the planner orchestrator.
 * One context keeps the stage files dumb and the behavior identical to the
 * pre-split single-file planner.
 */
export interface JourneyCtx {
  isSignedIn: boolean
  router: ReturnType<typeof useRouter>
  draft: Draft
  setDraft: Dispatch<SetStateAction<Draft>>
  stage: Stage
  goTo: (next: Stage, force?: boolean) => void

  plan: JourneyPlan | null
  destinationStop: Stop | undefined
  allListings: ListingDoc[] | undefined

  // Where stage
  locating: boolean
  locError: string | null
  manualArea: string
  setManualArea: (v: string) => void
  resolvingArea: boolean
  locate: () => void
  resolveArea: () => Promise<void>
  applyModel: (m: PlannerModel) => void
  originPoints: MapPoint[]
  originHighlight: string[]
  originFocus?: { lat: number; lng: number; zoom: number }

  // Budget stage
  prefilled: boolean
  loading: boolean
  progressStep: number
  generatePlan: () => Promise<void>

  // Plan stage
  saving: boolean
  adjustOpen: boolean
  setAdjustOpen: Dispatch<SetStateAction<boolean>>
  handleSaveTrip: () => void
  handleEditorSave: (stops: Stop[]) => void
  handleSwapStay: (indexes: number[], alt: StayAlternative) => void
  handleAddStay: (alt: StayAlternative) => void
  replanDay: (day: number, dayStops: Stop[]) => Promise<Stop[]>
  dayGroups: [number, Stop[]][]
  planMapPoints: MapPoint[]
  planHighlight: string[]
  planDestIds: string[]
  mapRoute: [number, number][]

  // Track stage
  activeSession: TrackingSession | null
  tracking: boolean
  /** True when neither the saved profile consent nor the session flip exists yet. */
  consentPrompt: boolean
  localConsent: boolean
  toggleConsent: (v: boolean) => void
  startTracking: () => void
  stopTracking: () => void

  // Share stage
  publishing: boolean
  files: PickedFile[]
  onPickFiles: (selected: FileList | null) => void
  removeFile: (index: number) => void
  caption: string
  setCaption: (v: string) => void
  handlePublish: () => void
  copied: boolean
  copyShareLink: () => Promise<void>
  shareLink: string
  shareText: string

  resetSession: () => void
}

const JourneyContext = createContext<JourneyCtx | null>(null)

export function JourneyProvider({ value, children }: { value: JourneyCtx; children: React.ReactNode }) {
  return <JourneyContext.Provider value={value}>{children}</JourneyContext.Provider>
}

export function useJourney(): JourneyCtx {
  const ctx = useContext(JourneyContext)
  if (!ctx) throw new Error('useJourney must be used within JourneyProvider')
  return ctx
}
