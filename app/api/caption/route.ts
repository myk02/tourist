import { generateText, Output } from 'ai'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { z } from 'zod'

const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY!,
})

export async function POST(request: Request) {
  try {
    const { imageData } = await request.json()
    if (!imageData || typeof imageData !== 'string' || !imageData.startsWith('data:image/') || imageData.length > 15_000_000) {
      return Response.json({ error: 'A valid image is required' }, { status: 400 })
    }
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
    const message = error instanceof Error ? error.message : 'Could not suggest a caption'
    return Response.json({ error: message }, { status: 400 })
  }
}
