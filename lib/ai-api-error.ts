export interface AiApiFailure {
  status: 400 | 500 | 502 | 503
  message: string
}

/** Convert provider/model failures into retryable HTTP responses without
 * exposing credentials or vendor response details to the browser. */
export function classifyAiApiError(error: unknown, service: string): AiApiFailure {
  const raw = error instanceof Error ? error.message : ''
  const name = error instanceof Error ? error.name : ''

  if (/OPENROUTER_API_KEY is not configured|not configured/i.test(raw)) {
    return { status: 503, message: `${service} is temporarily unavailable. Try again shortly.` }
  }

  const providerFailure =
    name === 'SyntaxError' ||
    name === 'ZodError' ||
    /^AI[_ ]/i.test(name) ||
    /AI request failed|AI temporarily unavailable|AI returned|the AI did not|unexpected.*JSON|invalid JSON|Bearer|timed? ?out|fetch failed|network|ECONN|rate limit|\b(?:429|500|502|503|504)\b|journey leg|plan.*budget|budget.*exceed|no stops returned/i.test(raw)

  if (providerFailure) {
    return { status: 502, message: `${service} could not be generated right now. Please try again.` }
  }

  // Avoid returning raw stack or unexpected server details to clients.
  return { status: 500, message: `${service} failed unexpectedly. Please try again.` }
}
