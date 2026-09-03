import type { Metadata } from 'next'
import Link from 'next/link'
import { Navigation } from 'lucide-react'
import { SignIn } from '@clerk/nextjs'

export const metadata: Metadata = {
  title: 'Sign in · KenyaTrace',
  description: 'Sign in to KenyaTrace — continue with Google, GitHub or Apple, or use your email.',
}

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-white text-foreground flex">
      {/* Left — form */}
      <div className="flex flex-1 flex-col bg-white">
        <div className="px-6 py-6 lg:px-8">
          <Link href="/" className="group inline-flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[color-mix(in_oklch,var(--primary),#000_25%)] text-primary-foreground shadow-xs">
              <Navigation className="size-5" />
            </span>
            <span className="font-serif text-xl font-semibold tracking-tight">KenyaTrace</span>
          </Link>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-8 lg:px-8">
          <div className="w-full max-w-[400px]">
            <SignIn
              routing="path"
              path="/sign-in"
              signUpUrl="/sign-up"
              fallbackRedirectUrl="/"
              appearance={
                {
                  variables: {
                    colorPrimary: '#0e7a55',
                    borderRadius: '0.75rem',
                  },
                  elements: {
                    rootBox: 'w-full',
                    cardBox: 'w-full shadow-none',
                    card: 'shadow-none border-0 bg-transparent p-0 gap-5',
                    header: 'gap-2',
                    headerTitle: 'font-serif text-[26px] font-semibold tracking-tight text-center text-[#0f172a]',
                    headerSubtitle: 'text-sm text-muted-foreground text-center',
                    socialButtonsBlockButton:
                      'h-[44px] rounded-lg border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] text-[14px] font-medium text-[#111827] shadow-sm transition-colors',
                    socialButtonsBlockButtonText: 'font-medium',
                    socialButtonsProviderIcon: 'size-4',
                    dividerLine: 'bg-[#e5e7eb]',
                    dividerText: 'text-xs font-medium tracking-wide text-[#9ca3af] bg-white px-3',
                    formFieldLabel: 'text-[13px] font-medium text-[#111827]',
                    formFieldInput:
                      'h-[44px] rounded-lg border border-[#e5e7eb] bg-white px-3 text-[14px] placeholder:text-[#9ca3af] focus:border-[#0e7a55] focus:ring-2 focus:ring-[#0e7a55]/15',
                    formButtonPrimary:
                      'h-[44px] rounded-lg bg-[#0e7a55] hover:bg-[#0c6b4a] text-white text-[14px] font-semibold shadow-sm disabled:bg-[#f3f4f6] disabled:text-[#9ca3af] disabled:border disabled:border-[#e5e7eb] disabled:shadow-none',
                    identityPreview: 'rounded-lg border border-[#e5e7eb] bg-[#f9fafb]',
                    formFieldAction: 'text-sm font-medium text-[#0e7a55] hover:underline',
                    alert: 'rounded-lg',
                    loaderIcon: 'text-[#0e7a55]',
                    logoBox: 'hidden',
                    footer: 'hidden',
                    footerAction: 'hidden',
                    footerActionText: 'hidden',
                    footerActionLink: 'hidden',
                    clerkBadge: 'hidden',
                    developmentModeBadge: 'hidden',
                    badge: 'hidden',
                  },
                  layout: {
                    socialButtonsPlacement: 'top',
                    socialButtonsVariant: 'blockButton',
                    unsafe_disableDevelopmentModeWarnings: true,
                  },
                } as any
              }
            />
            <p className="mt-6 text-center text-sm text-[#6b7280]">
              Don&apos;t have an account?{' '}
              <Link href="/sign-up" className="font-medium text-[#111827] underline underline-offset-4 hover:text-[#0e7a55]">
                Sign up
              </Link>
            </p>
            <p className="mt-6 text-center text-[11px] leading-relaxed text-[#9ca3af]">
              By signing in, you agree to our{' '}
              <a href={`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/terms`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-[#0e7a55]">
                Terms of Service
              </a>{' '}
              and{' '}
              <a href={`${process.env.NEXT_PUBLIC_APP_URL ?? ''}/privacy`} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-[#0e7a55]">
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </div>

        <div className="hidden lg:block h-6" />
      </div>

      {/* Right — decorative */}
      <div className="hidden lg:flex lg:w-[52%] relative overflow-hidden bg-[#fdfaf5] m-3 rounded-[28px] border border-black/[0.06] shadow-sm">
        <div className="absolute inset-x-0 top-0 h-[42%] bg-[#0e7a55] overflow-hidden">
          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px)',
              backgroundSize: '48px 48px',
            }}
          />
          <svg viewBox="0 0 800 260" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
            <path
              d="M -40 140 C 120 60, 260 180, 420 110 C 520 70, 640 120, 840 85 L 840 300 L -40 300 Z"
              fill="white"
              fillOpacity="0.06"
            />
            <path
              d="M -20 165 C 140 95, 280 200, 440 135 C 560 95, 680 145, 820 110"
              stroke="white"
              strokeOpacity="0.12"
              strokeWidth="1"
              fill="none"
            />
          </svg>
          <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#fdfaf5]/20 to-transparent" />
        </div>

        <div className="absolute inset-0 flex items-center justify-center px-10 pointer-events-none">
          <p className="text-center font-serif text-[30px] font-medium leading-tight tracking-tight text-[#0e7a55]/[0.18]">
            Welcome back to your
            <br /> Kenya journeys <span className="text-[#e09a12]">.</span>
          </p>
        </div>

        <div className="absolute right-[18%] top-[52%] hidden xl:grid grid-cols-6 gap-[10px] opacity-60">
          {Array.from({ length: 30 }).map((_, i) => {
            const row = Math.floor(i / 6)
            const col = i % 6
            const isGreen = row < 2
            const isOrange = row >= 3 && col >= 3
            const isMuted = row === 2
            return (
              <span
                key={i}
                className="size-[14px] rounded-full"
                style={{
                  backgroundColor: isGreen ? '#0e7a55' : isOrange ? '#e09a12' : isMuted ? '#9ca3af' : '#c8d5cf',
                  opacity: isGreen ? 0.95 : isOrange ? 1 : isMuted ? 0.35 : 0.45,
                }}
              />
            )
          })}
        </div>

        <div className="absolute bottom-0 left-0 h-[36%] w-[44%] overflow-hidden rounded-tr-[24px] bg-[#dbeafe] border-t border-r border-white/60">
          <div
            className="absolute inset-0 opacity-[0.32]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, #2563eb 1.2px, transparent 0)`,
              backgroundSize: '18px 18px',
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-tr from-[#0e7a55]/10 to-transparent" />
          <div className="absolute bottom-0 right-0 flex h-[84px] w-[148px] items-center justify-center bg-[#e09a12] rounded-tl-[12px] shadow-sm">
            <div className="relative size-10">
              <span className="absolute left-1/2 top-1/2 h-10 w-[6px] -translate-x-1/2 -translate-y-1/2 bg-white/95 rounded-full" />
              <span className="absolute left-1/2 top-1/2 h-[6px] w-10 -translate-x-1/2 -translate-y-1/2 bg-white/95 rounded-full" />
            </div>
            <span className="absolute right-3 top-3 size-2 rounded-full bg-white/30" />
          </div>
        </div>

        <div className="absolute bottom-0 right-0 h-[44%] w-[38%] overflow-hidden rounded-tl-[20px] bg-white shadow-[0_20px_60px_rgba(0,0,0,0.18)] border-t border-l border-white/70">
          <img src="/naivasha-lake.png" alt="Lake Naivasha, Kenya" className="h-full w-full object-cover" loading="eager" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/15 to-transparent" />
          <div className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold tracking-wide text-[#0e7a55] shadow-sm backdrop-blur">
            Kenya · Naivasha
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 rounded-[28px] ring-1 ring-white/60" />
      </div>
    </div>
  )
}
