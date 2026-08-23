import { clerkMiddleware } from '@clerk/nextjs/server'

/**
 * Clerk request authentication for server-side `auth()` callers.
 *
 * Without this handler running on a route, any Route Handler that calls
 * `await auth()` throws (`/api/send-invite`, `/api/payment-recovery`) —
 * email invites and payment-recovery flagging were silently broken.
 *
 * The matcher is deliberately narrow: the app authenticates client-side via
 * ClerkProvider + Convex, and these are currently the only server-side
 * `auth()` call sites. Widen it if more server components/routes adopt
 * `auth()`.
 */
export default clerkMiddleware()

export const config = {
  matcher: ['/api/send-invite', '/api/payment-recovery'],
}
