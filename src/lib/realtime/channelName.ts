let sequence = 0

/**
 * Give one Realtime subscription its own topic.
 *
 * supabase-js returns the existing channel when the same topic is requested
 * again, and throws "cannot add `postgres_changes` callbacks ... after
 * `subscribe()`" when a second hook/component instance chains `.on()` onto
 * that already joining/joined channel. This crashed the inventory page when
 * two components mounted the same hook (W1, 2026-11-06), and it also affects
 * an effect that re-runs before the previous removeChannel() has finished.
 *
 * For `postgres_changes` the topic is only a client-side label (the server
 * routes by schema/table/filter), so a per-subscription suffix keeps the
 * readable base name and changes no delivery semantics. Do not use this for
 * presence or broadcast channels, whose topic must be shared across clients.
 */
export function instanceChannelName(base: string): string {
  sequence += 1
  return `${base}#${sequence}`
}
