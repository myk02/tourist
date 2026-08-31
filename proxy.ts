import { clerkMiddleware } from '@clerk/nextjs/server'

/**
 * Clerk request authentication for server-side `auth()` callers.
 *
 * Covers all /api/* routes so any future `await auth()` call won't throw
 * with "auth() requires clerkMiddleware". Public AI routes (plan,
 * parse-booking, caption, brief) handle auth at the handler level (optional)
 * but still benefit from the middleware attaching the session cookie.
 */
export default clerkMiddleware()

export const config = {
  matcher: ['/api/:path*'],
}
