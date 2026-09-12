import { clerkMiddleware } from '@clerk/nextjs/server'

/**
 * Clerk request authentication for server-side `auth()` callers.
 *
 * Runs on all app/api and page routes (excluding static assets) so any future
 * `await auth()` in a server component won't throw "auth() requires clerkMiddleware".
 *
 * NOTE (Phase 3.4): the public AI routes (plan, parse-booking, caption, brief)
 * and public share pages (trace/recap/moments) intentionally perform NO
 * `auth()` check — they are anonymous-by-design, spend-gated only by the
 * per-instance IP rate limit in lib/rate-limit.ts. Do not add auth() to them
 * without also shipping a guest-quota replacement, or shared links break.
 */
export default clerkMiddleware()

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
