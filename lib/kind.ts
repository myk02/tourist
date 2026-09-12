/**
 * Single source for itinerary-kind theming (Phase 2.1).
 *
 * Previously `KIND_STYLE` / `TYPE_STYLE` / `CATEGORY_COLOR` / `KIND_COLORS`
 * were copy-pasted across itinerary-editor, forward-booking, sample-trace,
 * budget-dashboard and shared.tsx — same hues, four spellings. Import from
 * here instead so a category is never green in one component and blue in
 * another.
 */

export const KIND_CHIP: Record<string, string> = {
  Stay: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  Transport: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  Experience: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  Food: 'bg-rose-500/10 text-rose-700 dark:text-rose-300',
  Flight: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  General: 'bg-secondary text-muted-foreground',
}

/** Hex dots for canvas/SVG contexts (maps, stacked budget bars). */
export const KIND_HEX: Record<string, string> = {
  Stay: '#3b82f6',
  Transport: '#f59e0b',
  Experience: '#10b981',
  Food: '#f43f5e',
  Flight: '#f59e0b',
}

/** Tailwind chip classes for a stop/booking kind, with safe fallback. */
export function kindChip(kind: string): string {
  return KIND_CHIP[kind] ?? 'bg-secondary text-muted-foreground'
}

/** Hex dot color for a stop/booking kind, with safe fallback. */
export function kindHex(kind: string): string {
  return KIND_HEX[kind] ?? '#6b7280'
}
