import { focusManager, onlineManager, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/hooks/useUser';
import { useTenantSubscription } from '@/hooks/useSubscription';
import { isTenantOwner, isManager, isStaff } from '@/lib/userAccess';
import type { Announcement, AnnouncementPlacement } from '@/types/announcement.types';
import { announcementScope, confirmDismissal, dismissalSnapshot, isAnnouncementDismissed, pendingDismissals, rememberDismissal, subscribeDismissals } from '@/lib/announcement-state';
import { instanceChannelName } from '@/lib/realtime/channelName'

const syncing = new Map<string, Promise<void>>();
const lastAttempt = new Map<string, number>();

// MainLayout mounts several announcement consumers (active-banner, top,
// bottom and popup). They all need the same invalidation signal, but creating
// the same Realtime topic once per consumer makes newer supabase-js versions
// reject a second callback registration after the topic is subscribed. Keep a
// single channel and fan the invalidation out locally. Realtime is an
// enhancement here: a channel failure must never take down the authenticated
// application; the query still has its normal fetch/focus recovery path.
let announcementsChannel: RealtimeChannel | null = null;
const announcementRealtimeListeners = new Set<() => void>();

function subscribeAnnouncementRealtime(listener: () => void): () => void {
  announcementRealtimeListeners.add(listener);

  if (!announcementsChannel) {
    try {
      const channel = supabase.channel(instanceChannelName('announcements-runtime-v2'));
      announcementsChannel = channel;
      channel
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'announcements' },
          () => {
            for (const invalidate of announcementRealtimeListeners) invalidate();
          },
        )
        .subscribe((status, error) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            // Keep the query usable through its HTTP/focus path. Do not throw
            // from a realtime callback because it would crash MainLayout.
            console.warn('[Announcements] Realtime unavailable:', error?.message ?? status);
          }
        });
    } catch (error) {
      // A malformed/stale Realtime runtime must not block login or navigation.
      console.warn('[Announcements] Realtime setup skipped:', error);
      announcementsChannel = null;
    }
  }

  return () => {
    announcementRealtimeListeners.delete(listener);
    if (announcementRealtimeListeners.size === 0 && announcementsChannel) {
      const channel = announcementsChannel;
      announcementsChannel = null;
      void supabase.removeChannel(channel).catch(() => undefined);
    }
  };
}

async function syncDismissals(scope: string, userId: string) {
  const existing = syncing.get(scope);
  if (existing) return existing;
  if (!pendingDismissals(scope).length || navigator.onLine === false) return;
  // Several layout slots consume this hook. One bounded attempt per scope,
  // with a cooldown on focus/remount, instead of a retry loop on API failure.
  if (Date.now() - (lastAttempt.get(scope) ?? 0) < 30000) return;
  lastAttempt.set(scope, Date.now());
  const work = (async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || data.user?.id !== userId) return;
    for (const id of pendingDismissals(scope)) {
      const { error: insertError } = await supabase.from('announcement_dismissals')
        .insert({ announcement_id: id, user_id: userId });
      if (insertError && insertError.code !== '23505') break;
      confirmDismissal(scope, id);
    }
  })();
  syncing.set(scope, work);
  try { await work } finally { syncing.delete(scope) }
}

function audienceMatches(
  audience: Announcement['audience'],
  ctx: { isOwner: boolean; isMgr: boolean; isStf: boolean; status?: string },
): boolean {
  switch (audience) {
    case 'all':
      return true;
    case 'tenant_owner':
      return ctx.isOwner;
    case 'manager':
      return ctx.isMgr;
    case 'staff':
      return ctx.isStf;
    case 'trial_only':
      return ctx.status === 'trial';
    case 'expired_only':
      return ctx.status === 'expired' || ctx.status === 'cancelled';
    default:
      return false;
  }
}

export function useActiveAnnouncements(placement?: AnnouncementPlacement) {
  const qc = useQueryClient();
  const { user } = useUser();
  const subscriptionQuery = useTenantSubscription();
  const subscription = subscriptionQuery.data;
  const userId = user?.id;
  const scope = user ? announcementScope(user.id, user.tenant_id) : null;
  useSyncExternalStore(subscribeDismissals, () => dismissalSnapshot(scope), () => '');

  useEffect(() => {
    if (!scope || !userId) return;
    const sync = () => { void syncDismissals(scope, userId).catch(() => { /* Keep pending for the next reconnect. */ }) };
    const reconnect = () => {
      lastAttempt.delete(scope);
      sync();
    };
    sync();
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', sync);
    // Capacitor feeds these managers directly; WebView may not fire browser
    // online/focus events when Android resumes or restores its network.
    const offOnline = onlineManager.subscribe(online => { if (online) reconnect() });
    const offFocus = focusManager.subscribe(focused => { if (focused) sync() });
    return () => {
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', sync);
      offOnline();
      offFocus();
    };
  }, [scope, userId]);

  // Realtime invalidation
  useEffect(() => {
    return subscribeAnnouncementRealtime(() => {
      void qc.invalidateQueries({ queryKey: ['announcements', 'active'] });
    });
  }, [qc]);

  const query = useQuery({
    queryKey: ['announcements', 'active', scope, subscription?.subscription_status, placement],
    enabled: !!user && (!user.tenant_id || subscriptionQuery.isSuccess),
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      let q = supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .or(`starts_at.is.null,starts_at.lte.${nowIso}`)
        .or(`ends_at.is.null,ends_at.gte.${nowIso}`)
        .order('priority', { ascending: false });
      if (placement) q = q.eq('placement', placement);

      const [{ data: anns, error }, { data: dismissed, error: dismissalError }] = await Promise.all([
        q,
        supabase
          .from('announcement_dismissals')
          .select('announcement_id')
          .eq('user_id', user!.id),
      ]);
      if (error) throw error;
      if (dismissalError) throw dismissalError;

      const dismissedIds = new Set((dismissed ?? []).map((d) => d.announcement_id));
      const ctx = {
        isOwner: isTenantOwner(user),
        isMgr: isManager(user),
        isStf: isStaff(user),
        status: subscription?.subscription_status,
      };
      return ((anns ?? []) as Announcement[])
        .filter((a) => !dismissedIds.has(a.id))
        .filter((a) => audienceMatches(a.audience, ctx));
    },
  });
  return {
    ...query,
    // Do not let cached announcements open while eligibility or dismissal reads failed.
    isSuccess: query.isSuccess && (!user?.tenant_id || subscriptionQuery.isSuccess),
    data: scope ? query.data?.filter(a => !isAnnouncementDismissed(scope, a.id)) : undefined,
  };
}

export function useDismissAnnouncement() {
  const qc = useQueryClient();
  const { user } = useUser();
  const scope = user ? announcementScope(user.id, user.tenant_id) : null;
  const mutation = useMutation({
    networkMode: 'always',
    retry: 0,
    mutationFn: async ({ id, userId, ownerScope }: { id: string; userId: string; ownerScope: string }) => {
      const { data: u, error: authError } = await supabase.auth.getUser();
      if (authError || u.user?.id !== userId) throw new Error('Không thể đồng bộ trạng thái thông báo của tài khoản này.');
      const { error } = await supabase
        .from('announcement_dismissals')
        .insert({ announcement_id: id, user_id: userId });
      if (error && error.code !== '23505') throw error;
      confirmDismissal(ownerScope, id);
    },
    onSuccess: (_, variables) => qc.invalidateQueries({ queryKey: ['announcements', 'active', variables.ownerScope] }),
  });
  return {
    ...mutation,
    mutate: (id: string) => {
      if (!scope || !user || isAnnouncementDismissed(scope, id)) return;
      // Synchronous, before navigation/unmount and before any network request.
      rememberDismissal(scope, id);
      mutation.mutate({ id, userId: user.id, ownerScope: scope });
    },
  };
}
