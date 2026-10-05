import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useUser } from '@/hooks/useUser';
import { useTenantSubscription } from '@/hooks/useSubscription';
import { isTenantOwner, isManager, isStaff } from '@/lib/userAccess';
import type { Announcement, AnnouncementPlacement } from '@/types/announcement.types';

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
  const { data: subscription } = useTenantSubscription();

  // Realtime invalidation
  useEffect(() => {
    const ch = supabase
      .channel('announcements-runtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'announcements' },
        () => qc.invalidateQueries({ queryKey: ['announcements', 'active'] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  return useQuery({
    queryKey: ['announcements', 'active', user?.id, subscription?.subscription_status, placement],
    enabled: !!user,
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

      const [{ data: anns, error }, { data: dismissed }] = await Promise.all([
        q,
        supabase
          .from('announcement_dismissals')
          .select('announcement_id')
          .eq('user_id', user!.id),
      ]);
      if (error) throw error;

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
}

export function useDismissAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (announcementId: string) => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { error } = await supabase
        .from('announcement_dismissals')
        .insert({ announcement_id: announcementId, user_id: u.user.id });
      if (error && !error.message.includes('duplicate')) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['announcements', 'active'] }),
  });
}
