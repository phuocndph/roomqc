import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { MarketingCampaign, CampaignEngagement } from '@/types/super-admin.types';

export function useMarketingCampaigns(filters?: {
  status?: 'draft' | 'scheduled' | 'active' | 'paused' | 'completed';
  targetAudience?: string;
}) {
  return useQuery({
    queryKey: ['marketing-campaigns', filters],
    queryFn: async () => {
      let query = supabase
        .from('marketing_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.targetAudience) {
        query = query.eq('target_audience', filters.targetAudience);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as MarketingCampaign[];
    },
  });
}

export function useCampaign(campaignId: string | null) {
  return useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: async () => {
      if (!campaignId) return null;

      const { data, error } = await supabase
        .from('marketing_campaigns')
        .select('*')
        .eq('id', campaignId)
        .single();

      if (error) throw error;
      return data as MarketingCampaign;
    },
    enabled: !!campaignId,
  });
}

export function useCampaignStats(campaignId: string | null) {
  return useQuery({
    queryKey: ['campaign-stats', campaignId],
    queryFn: async () => {
      if (!campaignId) return null;

      const { data, error } = await supabase
        .from('campaign_engagement')
        .select('*')
        .eq('campaign_id', campaignId);

      if (error) throw error;

      const totalSent = data.filter(e => e.email_sent_at).length;
      const totalOpened = data.filter(e => e.email_opened_at).length;
      const totalClicked = data.filter(e => e.clicked_at).length;
      const totalConverted = data.filter(e => e.converted_at).length;

      const openRate = totalSent > 0 ? (totalOpened / totalSent) * 100 : 0;
      const clickRate = totalOpened > 0 ? (totalClicked / totalOpened) * 100 : 0;
      const conversionRate = totalSent > 0 ? (totalConverted / totalSent) * 100 : 0;

      return {
        totalSent,
        totalOpened,
        totalClicked,
        totalConverted,
        openRate: openRate.toFixed(2),
        clickRate: clickRate.toFixed(2),
        conversionRate: conversionRate.toFixed(2),
      };
    },
    enabled: !!campaignId,
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaign: Omit<MarketingCampaign, 'id' | 'created_at' | 'updated_at' | 'emails_sent' | 'emails_opened' | 'clicks' | 'conversions'>) => {
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .insert(campaign)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      toast.success('Đã tạo chiến dịch');
    },
    onError: (error: any) => {
      toast.error('Lỗi tạo chiến dịch: ' + error.message);
    },
  });
}

export function useUpdateCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      updates 
    }: { 
      id: string; 
      updates: Partial<MarketingCampaign>;
    }) => {
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign', variables.id] });
      toast.success('Đã cập nhật chiến dịch');
    },
    onError: (error: any) => {
      toast.error('Lỗi cập nhật: ' + error.message);
    },
  });
}

export function useLaunchCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase.functions.invoke('launch-campaign', {
        body: { campaign_id: campaignId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { ok: boolean; total: number; sent: number; failed: number };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      const sent = data?.sent ?? 0;
      const failed = data?.failed ?? 0;
      if (failed > 0) {
        toast.warning(`Đã gửi ${sent} email, ${failed} thất bại`);
      } else {
        toast.success(`Đã khởi chạy chiến dịch — gửi ${sent} email`);
      }
    },
    onError: (error: any) => {
      toast.error('Lỗi khởi chạy: ' + error.message);
    },
  });
}

export function usePauseCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await supabase
        .from('marketing_campaigns')
        .update({ status: 'paused' })
        .eq('id', campaignId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketing-campaigns'] });
      toast.success('Đã tạm dừng chiến dịch');
    },
    onError: (error: any) => {
      toast.error('Lỗi tạm dừng: ' + error.message);
    },
  });
}
