import type { Metadata } from 'next'
import { AIPlanner } from '@/components/kenyatrace/ai-planner'

export const metadata: Metadata = { title: 'Plan with AI' }

export default function PlanAIPage() {
  return <AIPlanner />
}
