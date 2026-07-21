import { generateText, Output } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
})

const requestSchema = z.object({
  destinations: z.string().min(2).max(180),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  budget: z.number().positive().max(10_000_000),
  interests: z.string().min(2).max(500),
})

const itinerarySchema = z.object({
  name: z.string(),
  destination: z.string(),
  summary: z.string(),
  stops: z.array(z.object({
    day: z.number().int().positive(),
    time: z.string(),
    title: z.string(),
    place: z.string(),
    cost: z.number().nonnegative(),
    kind: z.enum(['Stay', 'Transport', 'Experience', 'Food']),
    lat: z.number().min(-5).max(5),
    lng: z.number().min(33).max(42),
  })).min(3).max(20),
})

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json())
    const { output } = await generateText({
      model: openrouter('openai/gpt-4o-mini'),
      output: Output.object({ schema: itinerarySchema }),
      system: 'You are KenyaTrace, an expert Kenya trip designer. Create realistic, geographically coherent itineraries using only real places in Kenya. Use KES costs, conservative travel times, practical daily pacing, and coordinates inside Kenya. Keep the total at or below the stated budget. Do not invent hotels or tour operators; generic stays and activities are acceptable.',
      prompt: `Plan a trip to ${input.destinations} from ${input.startDate} to ${input.endDate}. Budget: KES ${input.budget}. Interests and pace: ${input.interests}.`,
    })
    return Response.json(output)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to build an itinerary'
    return Response.json({ error: message }, { status: 400 })
  }
}
