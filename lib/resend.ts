import { Resend } from 'resend'

/**
 * Transactional email client (Resend). Used to deliver trip invite links from
 * the share dialog. Set RESEND_API_KEY in the environment to enable sending —
 * until a custom domain is verified in Resend, the free "onboarding@resend.dev"
 * from-address only delivers to the account owner's own inbox.
 */
export const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

export const EMAIL_FROM = process.env.EMAIL_FROM || 'KenyaTrace <onboarding@resend.dev>'
