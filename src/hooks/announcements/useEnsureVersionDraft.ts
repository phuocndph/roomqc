import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { APP_VERSION, APP_VERSION_DATE } from '@/lib/app-version';
import type { Announcement } from '@/types/announcement.types';

interface ChangelogEntry {
  version: string;
  releaseDate?: string;
  title?: string;
  changes?: Array<{ type?: string; text: string }>;
}

async function fetchChangelog(): Promise<ChangelogEntry | null> {
  try {
    const res = await fetch('/changelog.json', { cache: 'no-cache' });
    if (!res.ok) return null;
    const raw = await res.json();
    if (raw && Array.isArray(raw.versions)) {
      return (raw.versions.find((v: ChangelogEntry) => v.version === APP_VERSION) ?? null) as ChangelogEntry | null;
    }
    if (raw && raw.version === APP_VERSION) return raw as ChangelogEntry;
    return null;
  } catch {
    return null;
  }
}

function buildDefaultBody(cl: ChangelogEntry | null): string {
  if (cl && cl.version === APP_VERSION && cl.changes?.length) {
    const lines = cl.changes.map((c) => `• ${c.text}`).join('\n');
    return `${cl.title ? cl.title + '\n\n' : ''}${lines}`;
  }
  return 'Hãy cập nhật mô tả thay đổi cho phiên bản này trước khi bật.';
}

/**
 * Tự động sinh draft (is_active=false) cho APP_VERSION nếu chưa có.
 * Chỉ chạy 1 lần / mount khi Super Admin truy cập trang quản lý thông báo.
 * Trả về { draft, isReady } — draft là bản ghi ứng với APP_VERSION (nếu có).
 */
export function useEnsureVersionDraft() {
  const qc = useQueryClient();
  const seedingRef = useRef(false);

  const query = useQuery({
    queryKey: ['announcements', 'version-draft', APP_VERSION],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .eq('kind', 'version_update')
        .eq('version', APP_VERSION)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as Announcement | null;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (query.isLoading || query.data || seedingRef.current) return;
    seedingRef.current = true;
    (async () => {
      try {
        const cl = await fetchChangelog();
        const { data: u } = await supabase.auth.getUser();
        const startsAt = APP_VERSION_DATE
          ? new Date(`${APP_VERSION_DATE}T00:00:00`).toISOString()
          : new Date().toISOString();

        const highlights =
          cl && cl.version === APP_VERSION && cl.changes?.length
            ? cl.changes.slice(0, 8).map((c) => ({
                icon: 'CheckCircle2',
                color: 'green' as const,
                title: c.text,
              }))
            : [];

        const content =
          highlights.length > 0
            ? {
                highlights,
                contacts: [
                  { type: 'phone' as const, value: '0828686866' },
                  { type: 'email' as const, value: 'roomqc@gmail.com' },
                ],
                contact_label: 'Liên hệ hỗ trợ:',
              }
            : null;

        const { error } = await supabase.from('announcements').insert({
          kind: 'version_update',
          placement: 'popup_center',
          variant: 'info',
          title: cl?.title ? `${cl.title} (v${APP_VERSION})` : `Phiên bản mới ${APP_VERSION}`,
          body: buildDefaultBody(cl),
          cta_label: 'Đã hiểu',
          cta_url: null,
          image_url: null,
          icon: 'Sparkles',
          audience: 'all',
          is_active: false,
          is_dismissible: true,
          starts_at: startsAt,
          ends_at: null,
          version: APP_VERSION,
          priority: 100,
          content,
          created_by: u.user?.id ?? null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);
        if (error && !`${error.message}`.toLowerCase().includes('duplicate')) {
          throw error;
        }
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['announcements', 'version-draft', APP_VERSION] }),
          qc.invalidateQueries({ queryKey: ['announcements', 'admin'] }),
        ]);
      } catch (e) {
        // Im lặng — không chặn UI nếu seed lỗi (RLS sẽ chặn nếu không phải super_admin)
        console.warn('[useEnsureVersionDraft] seed failed', e);
      } finally {
        seedingRef.current = false;
      }
    })();
  }, [query.isLoading, query.data, qc]);

  return {
    draft: query.data ?? null,
    isReady: !query.isLoading,
    appVersion: APP_VERSION,
  };
}
