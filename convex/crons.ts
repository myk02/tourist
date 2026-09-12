import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

/**
 * Convex scheduled jobs. `reminders.sweepAll` fires daily at 08:00 UTC so
 * travellers who don't open the app still receive their 48h/24h booking
 * reminders. The action is idempotent via sent-markers on each booking.
 */
const crons = cronJobs()

crons.daily(
  'booking-reminders',
  { hourUTC: 8, minuteUTC: 0 },
  internal.reminders.sweepAll,
)

crons.hourly(
  'payments-reconcile',
  { minuteUTC: 15 },
  internal.payments_helpers.reconcileStale,
)

export default crons