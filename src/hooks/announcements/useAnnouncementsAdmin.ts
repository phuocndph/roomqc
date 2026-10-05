import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Announcement, AnnouncementInput } from '@/types/announcement.types';

export function useAnnouncementsAdmin() {
  return useQuery({
    queryKey: ['announcements', 'admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });
}

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AnnouncementInput) => {
      const { data: u } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from('announcements')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ ...input, created_by: u.user?.id ?? null } as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Announcement;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Đã tạo thông báo');
    },
    onError: (e: Error) => toast.error(`Lỗi: ${e.message}`),
  });
}

export function useUpdateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<AnnouncementInput>) => {
      const { data, error } = await supabase
        .from('announcements')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(patch as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as Announcement;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Đã lưu thông báo');
    },
    onError: (e: Error) => toast.error(`Lỗi: ${e.message}`),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('announcements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      toast.success('Đã xoá thông báo');
    },
    onError: (e: Error) => toast.error(`Lỗi: ${e.message}`),
  });
}
