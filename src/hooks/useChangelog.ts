import { useEffect, useState } from 'react';
import type { ChangelogEntry } from '@/types/changelog';

interface UseChangelogResult {
  changelog: ChangelogEntry | null;
  loading: boolean;
  error: Error | null;
}

/**
 * Fetch /changelog.json with cache-bust query param.
 * Only fetches when `enabled` is true (typically when needRefresh becomes true).
 * Returns null on failure — UI should still render the update prompt.
 */
export function useChangelog(enabled: boolean): UseChangelogResult {
  const [changelog, setChangelog] = useState<ChangelogEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/changelog.json?t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const raw = await res.json();
        // Hỗ trợ cả format mới { current, versions[] } và legacy { version, ... }
        let entry: ChangelogEntry | null = null;
        if (raw && Array.isArray(raw.versions)) {
          entry = raw.versions.find((v: ChangelogEntry) => v.version === raw.current) ?? raw.versions[0] ?? null;
        } else if (raw && raw.version) {
          entry = raw as ChangelogEntry;
        }
        if (!cancelled) {
          setChangelog(entry);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn('[Changelog] Fetch failed:', err);
          setChangelog(null);
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { changelog, loading, error };
}
