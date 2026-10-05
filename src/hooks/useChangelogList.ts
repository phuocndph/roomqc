import { useQuery } from '@tanstack/react-query';
import type { ChangelogEntry, ChangelogFile } from '@/types/changelog';

interface LegacyChangelog extends ChangelogEntry {
  version: string;
}

function normalize(raw: unknown): ChangelogFile {
  if (raw && typeof raw === 'object' && 'versions' in (raw as Record<string, unknown>)) {
    return raw as ChangelogFile;
  }
  // Legacy: object đơn → wrap thành mảng
  const legacy = raw as LegacyChangelog;
  return {
    current: legacy?.version ?? '',
    versions: legacy?.version ? [legacy] : [],
  };
}

export function useChangelogList() {
  return useQuery({
    queryKey: ['changelog-list'],
    queryFn: async (): Promise<ChangelogFile> => {
      const res = await fetch(`/changelog.json?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return normalize(await res.json());
    },
    staleTime: 60_000,
  });
}
