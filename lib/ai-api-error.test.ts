import { describe, expect, it } from 'vitest'
import { classifyAiApiError } from './ai-api-error'

describe('classifyAiApiError', () => {
  it('marks missing provider configuration as unavailable', () => {
    expect(classifyAiApiError(new Error('OPENROUTER_API_KEY is not configured'), 'Planner')).toEqual({
      status: 503,
      message: 'Planner is temporarily unavailable. Try again shortly.',
    })
  })

  it('turns provider failures into retryable gateway errors', () => {
    expect(classifyAiApiError(new Error('AI request failed (429)'), 'Planner').status).toBe(502)
    expect(classifyAiApiError(new Error('Unexpected end of JSON input'), 'Brief').status).toBe(502)
  })

  it('does not expose unexpected server errors', () => {
    expect(classifyAiApiError(new Error('database password leaked'), 'Caption')).toEqual({
      status: 500,
      message: 'Caption failed unexpectedly. Please try again.',
    })
  })
})
