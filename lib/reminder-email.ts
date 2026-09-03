/**
 * Single reminder-email template (Phase 3.3). Previously the same ~35-line
 * MJML-ish HTML was pasted in both `sweep` and `sweepAll` in
 * convex/reminders.ts — two copies that could drift (subject, CTA, footer).
 * Both paths now build through here.
 */

import { prettyDate } from "./dates"

export interface ReminderDue {
  bookingId: string
  which: "r48" | "r24"
  to: string
  label: string
  place?: string
  type: string
  reference: string
  checkIn: string
  amount: number
  guests?: number
  tripId?: string
  tripName?: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function buildReminderEmail(d: ReminderDue, appUrl: string): { subject: string; html: string } {
  const whenLabel = d.which === "r48" ? "In 2 days" : "Tomorrow"
  const subject = `${whenLabel}: ${d.label} · check-in ${prettyDate(d.checkIn)}`
  const link = `${appUrl}${d.tripId ? `/trips/${d.tripId}` : "/profile?tab=bookings"}`
  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f3ef;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ef;padding:32px 16px;">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e2da;">
          <tr>
            <td style="background:#0f6b4f;padding:24px 32px;">
              <p style="margin:0;font-size:13px;letter-spacing:1px;text-transform:uppercase;color:#c8f0df;">KenyaTrace</p>
              <p style="margin:8px 0 0;font-size:22px;font-weight:600;color:#ffffff;">${escapeHtml(whenLabel)} — ${escapeHtml(d.tripName ?? "your Kenya trip")}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1c1917;">
                <strong>${escapeHtml(d.label)}</strong> starts on <strong>${prettyDate(d.checkIn)}</strong>${d.place ? ` in ${escapeHtml(d.place)}` : ""}.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f3ef;border-radius:8px;margin:0 0 20px;">
                <tr><td style="padding:14px 18px;font-size:14px;color:#44403c;line-height:1.9;">
                  <strong>Reference:</strong> ${escapeHtml(d.reference)}<br/>
                  <strong>Type:</strong> ${escapeHtml(d.type)}${d.guests != null ? `<br/><strong>Guests:</strong> ${d.guests}` : ""}<br/>
                  <strong>Amount:</strong> KES ${d.amount.toLocaleString("en-KE")}
                </td></tr>
              </table>
              <p style="margin:0 0 24px;text-align:center;">
                <a href="${link}" style="display:inline-block;padding:13px 28px;background:#0f6b4f;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">Open your trip</a>
              </p>
              <p style="margin:0;font-size:12px;color:#78716c;">You get this because you added this reservation to KenyaTrace. Cancelled reservations never remind.</p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
  return { subject, html }
}
