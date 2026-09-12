import { z } from 'zod'

/**
 * The free OpenRouter model powering KenyaTrace's journey planner.
 * Verified live: it ignores structured-output modes (json_schema/json_object),
 * so we disable its chain-of-thought and parse JSON ourselves.
 */
export const JOURNEY_MODEL = 'nvidia/nemotron-3.5-lightning:free'
export const FALLBACK_MODEL = 'nvidia/nemotron-3-nano:free'

export function extractJson(text: string): string {
  let t = text.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const start = t.indexOf('{')
  if (start === -1) throw new Error('The AI did not return a JSON object')
  // Find matching closing brace for first object to avoid concatenating two objects
  let depth = 0
  let inString = false
  let escape = false
  let end = -1
  for (let i = start; i < t.length; i++) {
    const ch = t[i]
    if (escape) { escape = false; continue }
    if (ch === '\\' && inString) { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) { end = i; break }
    }
  }
  if (end === -1) {
    end = t.lastIndexOf('}')
    if (end <= start) throw new Error('The AI did not return a JSON object')
  }
  return t.slice(start, end + 1).replace(/[\u0000-\u001F]/g, ' ')
}

export async function chatRaw(system: string, prompt: string, maxTokens = 4000): Promise<string> {
  return complete(system, prompt, maxTokens)
}

async function complete(system: string, prompt: string, maxTokens: number): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) throw new Error('OPENROUTER_API_KEY is not configured')
  const models = [JOURNEY_MODEL, FALLBACK_MODEL]
  let lastError: unknown = null
  for (const model of models) {
    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        signal: AbortSignal.timeout(60000),
        body: JSON.stringify({
          model,
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
        // Log server-side for debugging without leaking details to client
        if (detail) console.error(`[ai] ${model} ${response.status}: ${detail.slice(0, 300)}`)
        const transient = [429, 502, 503, 504].includes(response.status)
        if (transient && model === JOURNEY_MODEL) {
          lastError = new Error(`AI temporarily unavailable (${response.status}) — retrying`)
          continue
        }
        throw new Error(`AI request failed (${response.status})`)
      }
      let data: unknown
      try {
        data = await response.json()
      } catch {
        if (model === JOURNEY_MODEL) {
          lastError = new Error('AI returned invalid JSON — retrying')
          continue
        }
        throw new Error('AI returned invalid response')
      }
      const content: string | undefined = (data as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content
      if (!content || !content.trim()) {
        if (model === JOURNEY_MODEL) {
          lastError = new Error('The AI returned an empty response — retrying')
          continue
        }
        throw new Error('The AI returned an empty response')
      }
      return content
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      const isTransient = /timeout|fetch failed|aborted|network|econnreset/i.test(msg)
      if (model === JOURNEY_MODEL && isTransient) {
        lastError = error
        continue
      }
      if (error instanceof Error && error.message.includes('retrying')) {
        lastError = error
        continue
      }
      throw error
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI request failed')
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
  let lastParseError: unknown = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const instruction =
      attempt === 0
        ? ''
        : ' Your previous answer was not valid JSON. Return ONLY a single valid JSON object matching the requested shape exactly — no explanations, no markdown, no code fences.'
    try {
      const raw = await complete(system, prompt + instruction, maxTokens)
      const jsonStr = extractJson(raw)
      const parsed = JSON.parse(jsonStr)
      return schema.parse(parsed)
    } catch (error) {
      const isParseError =
        error instanceof SyntaxError ||
        (error instanceof Error && /JSON|Zod|valid JSON|parse/i.test(error.message)) ||
        (typeof error === 'object' && error !== null && 'issues' in error)
      if (!isParseError || attempt === 1) {
        throw error instanceof Error ? error : new Error('The AI returned an unreadable response. Please try again.')
      }
      lastParseError = error
    }
  }
  throw lastParseError instanceof Error ? lastParseError : new Error('Could not generate a plan')
}
