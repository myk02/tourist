import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { EMAIL_FROM, resend } from '@/lib/resend'
import { rateLimit, getClientKey } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const REF_RE = /^[a-zA-Z0-9_-]+$/

/**
 * POST /api/payment-recovery
 *
 * Failed-payment support loop: when a Paystack checkout closes but server-side
 * verification can't confirm the charge, the client posts the reference here.
 * The route first re-verifies with Paystack — settled charges return
 * `{ verified: true }` so the client can run verifyAndConfirm instead of
 * bothering support. Only unverified references queue a human email with
 * everything needed to reconcile in the Paystack dashboard, and the hourly
 * `payments-reconcile` cron keeps retrying stale pendings server-side.
 *
 * Body: { reference, email }
 */
export async function POST(request: Request) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  const rl = rateLimit(`recovery:${getClientKey(request, userId)}`, 5, 60_000)
  if (!rl.ok) return NextResponse.json({ error: 'Too many requests — try again shortly.' }, { status: 429 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const reference = typeof body.reference === 'string' ? body.reference.trim().slice(0, 64) : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase().slice(0, 254) : ''
  if (!reference || !REF_RE.test(reference) || reference.length > 64) return NextResponse.json({ error: 'Invalid payment reference' }, { status: 400 })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: 'A valid payer email is required' }, { status: 400 })

  if (!resend) {
    return NextResponse.json(
      { error: 'Email is not configured yet — set RESEND_API_KEY to enable payment recovery.' },
      { status: 503 },
    )
  }

  // Reconcile first: if Paystack says the charge settled, tell the client to
  // run verifyAndConfirm instead of queueing a support email for a payment
  // that is actually fine. Only unverified references reach a human.
  let paystackStatus: string | null = null
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (secret) {
    try {
      const vRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
        headers: { Authorization: `Bearer ${secret}` },
      })
      if (vRes.ok) {
        const vJson = await vRes.json().catch(() => null)
        paystackStatus = vJson?.data?.status ?? null
        if (vJson?.status === true && vJson?.data?.status === 'success' && vJson?.data?.reference === reference) {
          return NextResponse.json({
            ok: true,
            verified: true,
            amount: typeof vJson.data.amount === 'number' ? vJson.data.amount / 100 : undefined,
            currency: vJson.data.currency ?? 'KES',
            hint: 'Charge settled — call verifyAndConfirm to mark it paid.',
          })
        }
      }
    } catch {
      // Verification network failure — fall through to support email.
    }
  }

  // Support goes to the operator inbox; RECOVERY_EMAIL overrides the default.
  const supportTo = process.env.RECOVERY_EMAIL || process.env.EMAIL_FROM || 'KenyaTrace <onboarding@resend.dev>'
  const paidAt = new Date().toISOString()

  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: supportTo,
      subject: `Unconfirmed payment · ${reference}`,
      html: `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e2da;">
          <tr>
            <td style="background:#b45309;padding:24px 32px;">
              <p style="margin:0;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#fde8c8;">KenyaTrace payments</p>
              <p style="margin:8px 0 0;font-size:22px;font-weight:600;color:#ffffff;">Unconfirmed payment needs review</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 12px;font-size:16px;line-height:1.6;color:#1c1917;">
                A checkout closed but verification could not confirm the charge. The traveller was told to wait for follow-up.
              </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f3ef;border-radius:8px;margin:0 0 20px;">
                  <tr><td style="padding:14px 18px;font-size:14px;color:#44403c;line-height:1.9;">
                    <strong>Reference:</strong> ${escapeHtml(reference)}<br/>
                    <strong>Payer email:</strong> ${escapeHtml(email)}<br/>
                    <strong>Clerk user:</strong> ${escapeHtml(userId)}<br/>
                    <strong>Paystack status:</strong> ${escapeHtml(paystackStatus ?? 'unverified')}<br/>
                    <strong>Flagged at:</strong> ${escapeHtml(paidAt)}
                  </td></tr>
                </table>
              <p style="margin:0;font-size:13px;line-height:1.6;color:#78716c;">
                Check this reference in the Paystack dashboard. If it settled, grant access or confirm the booking manually; if not, reply to the traveller with next steps.
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
    })
    if (error) {
      console.error('[payment-recovery] Resend error:', error)
      return NextResponse.json({ error: 'Could not queue the recovery email' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, verified: false })
  } catch (e) {
    console.error('[payment-recovery] Failed to send:', e)
    return NextResponse.json({ error: 'Could not queue the recovery email' }, { status: 502 })
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
