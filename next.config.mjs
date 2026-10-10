import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Playwright regression runs on 127.0.0.1 — allow its HMR origin in dev.
  allowedDevOrigins: ['127.0.0.1'],
  // Pin the workspace root so Turbopack doesn't infer it from a stray
  // ancestor lockfile (e.g. C:\Users\ADMIN\package-lock.json).
  turbopack: {
    root: projectDir,
  },
  images: {
    // Intentionally unoptimized (Phase 8 decision): moment photos come from
    // Convex storage on per-deployment hostnames that cannot be enumerated in
    // remotePatterns, and listing art hotlinks Wikimedia. A custom loader or
    // remotePatterns allowlist would break one of the three sources — revisit
    // when media moves to a single CDN hostname.
    unoptimized: true,
  },
}

export default nextConfig
