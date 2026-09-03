const clerkDomain = process.env.CLERK_DOMAIN
if (!clerkDomain) {
  throw new Error('CLERK_DOMAIN is not set. Convex auth cannot be configured.')
}

export default {
  providers: [{ domain: clerkDomain, applicationID: 'convex' }],
}
