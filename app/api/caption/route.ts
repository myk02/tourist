import { generateText, Output } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'
import { rateLimit, getClientKey } from '@/lib/rate-limit'
import { classifyAiApiError } from '@/lib/ai-api-error'

export const maxDuration = 60
const requestSchema = z.object({
  // Keep JSON under Vercel's request body cap; the client sends a downsized
  // JPEG, so valid photos normally stay well below this limit.
  imageData: z.string().max(4_000_000).regex(/^data:image\/(?:jpeg|png|webp);base64,/i),
})

function getOpenRouter() {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) return null
  return createOpenRouter({ apiKey: key })
}

export async function POST(request: Request) {
  try {
    const rl = rateLimit(`caption:${getClientKey(request)}`, 15, 60_000)
    if (!rl.ok) {
      return Response.json({ error: 'Too many caption requests — try again in a minute.' }, { status: 429 })
    }
    const body = await request.json().catch(() => null)
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: 'A valid JPEG, PNG, or WebP image under 3 MB is required' }, { status: 400 })
    }
    const openrouter = getOpenRouter()
    if (!openrouter) {
      return Response.json({ error: 'Caption service is not configured' }, { status: 503 })
    }
    const { imageData } = parsed.data
    const { output } = await generateText({
      model: openrouter('openai/gpt-4o-mini'),
      output: Output.object({ schema: z.object({ caption: z.string(), location: z.string() }) }),
      system: 'You are KenyaTrace, a travel journal assistant. Describe this travel photo from Kenya with a warm, concise caption of at most 15 words, and suggest a short location or place name (at most 4 words). Do not invent specific hotels.',
      prompt: [
        { role: 'user', content: [
          { type: 'image', image: imageData },
          { type: 'text', text: 'Suggest a caption and a location for this travel photo.' },
        ] },
      ],
    })
    return Response.json(output)
  } catch (error) {
    console.error('[caption] error', error)
    const failure = classifyAiApiError(error, 'Caption')
    return Response.json({ error: failure.message }, { status: failure.status })
  }
}
