import { z } from 'zod'

/**
 * The free OpenRouter model powering KenyaTrace's journey planner.
 * Verified live: it ignores structured-output modes (json_schema/json_object),
 * so we disable its chain-of-thought and parse JSON ourselves.
 */
export const JOURNEY_MODEL = 'nvidia/nemotron-3.5-lightning:free'

function extractJson(text: string): string {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  const end = t.lastIndexOf('}')
  if (start === -1 || end <= start) throw new Error('The AI did not return a JSON object')
  // Models sometimes emit raw control characters (e.g. newlines) inside JSON
  // strings, which JSON.parse rejects. Replacing them with spaces is harmless
  // outside strings and fixes the ones inside.
  return t.slice(start, end + 1).replace(/[\u0000-\u001F]/g, ' ')
}

export async function chatRaw(system: string, prompt: string, maxTokens = 4000): Promise<string> {
  return complete(system, prompt, maxTokens)
}

async function complete(system: string, prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY is not configured')
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: JOURNEY_MODEL,
      reasoning: { enabled: false },
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: prompt },
      ],
    }),
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`AI request failed (${response.status})${detail ? `: ${detail.slice(0, 160)}` : ''}`)
  }
  const data = await response.json()
  const content: string | undefined = data?.choices?.[0]?.message?.content
  if (!content) throw new Error('The AI returned an empty response')
  return content
}

/**
 * Runs the free Nemotron model and returns a zod-validated object.
 * The free model ignores structured-output modes, so we instruct it to emit
 * JSON only, strip any surrounding text, and retry once if parsing fails.
 */
export async function chatJSON<T>({
  system,
  prompt,
  schema,
  maxTokens = 4000,
}: {
  system: string
  prompt: string
  schema: z.ZodType<T>
  maxTokens?: number
}): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const instruction =
      attempt === 0
        ? ''
        : ' Your previous answer was not valid JSON. Return ONLY a single valid JSON object matching the requested shape exactly — no explanations, no markdown, no code fences.'
    try {
      const raw = await complete(system, prompt + instruction, maxTokens)
      return schema.parse(JSON.parse(extractJson(raw)))
    } catch (error) {
      if (attempt === 1) {
        throw error instanceof Error ? error : new Error('The AI returned an unreadable response. Please try again.')
      }
    }
  }
  throw new Error('Could not generate a plan')
}
