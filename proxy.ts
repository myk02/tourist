import { clerkMiddleware } from '@clerk/nextjs/server'

/**
 * Clerk request authentication for server-side `auth()` callers.
 *
 * Runs on all app/api and page routes (excluding static assets) so any future
 * `await auth()` in a server component won't throw "auth() requires clerkMiddleware".
 * Public AI routes (plan, parse-booking, caption, brief) and public share pages
 * (trace/recap/moments) handle auth at the handler level (optional) but still
 * benefit from the middleware attaching the session cookie.
 */
export default clerkMiddleware()

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
