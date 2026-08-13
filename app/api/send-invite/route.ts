import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { EMAIL_FROM, resend } from '@/lib/resend'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * POST /api/send-invite
 *
 * Emails a trip invite link to a companion. Body:
 *   { to, tripId, token, tripName, role, senderName, message? }
 *
 * The invite link itself is the security boundary (anyone with it can join),
 * so no trip ownership check is needed beyond the signed-in caller — but the
 * route is Clerk-gated so it can't be abused anonymously.
 */
export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const to = typeof body.to === 'string' ? body.to.trim().toLowerCase() : ''
  const tripId = typeof body.tripId === 'string' ? body.tripId : ''
  const token = typeof body.token === 'string' ? body.token : ''
  const tripName = typeof body.tripName === 'string' ? body.tripName.trim() : ''
  const role = body.role === 'viewer' ? 'viewer' : 'editor'
  const senderName = typeof body.senderName === 'string' && body.senderName.trim() ? body.senderName.trim() : 'Someone'
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 500) : ''

  if (!EMAIL_RE.test(to)) return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 })
  if (!tripName) return NextResponse.json({ error: 'Missing invite details' }, { status: 400 })
  // The link base is server-configured, never the client's Origin header — a
  // page under an attacker's domain must not be able to make KenyaTrace email
  // links pointing at it (token capture).
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'https://kenyatrace.vercel.app'
  const link = `${origin}/trips/${tripId}?invite=${token}`

  // Convex IDs and invite tokens use a URL-safe alphabet — rejecting anything
  // else keeps the raw link interpolation in the email HTML injection-proof.
  if (!/^[a-zA-Z0-9_-]+$/.test(tripId) || !/^[a-zA-Z0-9_-]+$/.test(token)) {
    return NextResponse.json({ error: 'Invalid invite details' }, { status: 400 })
  }

  if (!resend) {
    return NextResponse.json(
      { error: 'Email is not configured yet — set RESEND_API_KEY to enable invites by email.' },
      { status: 503 },
    )
  }

  const roleLabel = role === 'viewer' ? 'view and comment on' : 'view and edit'

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e2da;">
          <tr>
            <td style="background:#0f6b4f;padding:24px 32px;">
              <p style="margin:0;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#c8f0df;">KenyaTrace</p>
              <p style="margin:8px 0 0;font-size:22px;font-weight:600;color:#ffffff;">You're invited to plan together</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1c1917;">
                ${escapeHtml(senderName)} invited you to <strong>${escapeHtml(tripName)}</strong> — a Kenya trip you can ${roleLabel} together. Changes sync live for everyone.
              </p>
              ${message ? `<p style="margin:0 0 16px;padding:12px 16px;background:#f5f3ef;border-left:3px solid #0f6b4f;font-style:italic;color:#44403c;">“${escapeHtml(message)}”</p>` : ''}
              <p style="margin:0 0 24px;text-align:center;">
                <a href="${link}" style="display:inline-block;padding:13px 28px;background:#0f6b4f;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Open the trip</a>
              </p>
              <p style="margin:0 0 8px;font-size:13px;color:#78716c;">If the button doesn't work, copy this link:</p>
              <p style="margin:0;font-size:12px;color:#44403c;word-break:break-all;">${link}</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`

  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to,
      subject: `${senderName} invited you to "${tripName}" on KenyaTrace`,
      html,
    })
    if (error) {
      console.error('[send-invite] Resend error:', error)
      return NextResponse.json({ error: 'Could not send the invite email' }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[send-invite] Failed to send:', e)
    return NextResponse.json({ error: 'Could not send the invite email' }, { status: 502 })
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
