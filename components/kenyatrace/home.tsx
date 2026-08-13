'use client'

import { GuidedJourney } from './guided-journey'

/**
 * The home page IS the journey: location → budget → plan & how to get there
 * → live tracking → share & rate → session complete.
 */
export function Home() {
  return <GuidedJourney />
}
