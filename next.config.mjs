import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root so Turbopack doesn't infer it from a stray
  // ancestor lockfile (e.g. C:\Users\ADMIN\package-lock.json).
  turbopack: {
    root: projectDir,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
