/**
 * Query options for data that decides what the signed-in actor may see or use
 * (effective permissions, assigned hotels, tenant usage mode). An administrator
 * can change any of these from another device while this session stays open,
 * and Realtime is not used for them, so they are re-read whenever the window
 * regains focus or the network reconnects. Background refetches keep the
 * previous data, so consumers do not flash their loading state.
 */

/** For queries with a single or few consumers: also re-read on every mount. */
export const liveAuthorityQueryOptions = {
  staleTime: 0,
  refetchOnMount: 'always' as const,
  refetchOnWindowFocus: 'always' as const,
  refetchOnReconnect: 'always' as const,
}

/**
 * For widely used queries (many components mount them): keep the normal cache
 * window for mounts, but always re-read on focus and reconnect.
 */
export const liveAuthorityRefreshOptions = {
  refetchOnWindowFocus: 'always' as const,
  refetchOnReconnect: 'always' as const,
}
