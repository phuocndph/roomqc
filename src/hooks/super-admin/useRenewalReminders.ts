import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { RenewalReminder } from '@/types/super-admin.types';

export function useRenewalReminders(filters?: {
  status?: 'pending' | 'sent' | 'failed';
  reminderType?: string;
}) {
  return useQuery({
    queryKey: ['renewal-reminders', filters],
    queryFn: async () => {
      let query = supabase
        .from('renewal_reminders')
        .select(`
          *,
          tenant:tenants(id, name, subscription_end_date)
        `)
        .order('scheduled_for', { ascending: true });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.reminderType) {
        query = query.eq('reminder_type', filters.reminderType);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function usePendingReminders() {
  return useQuery({
    queryKey: ['renewal-reminders', 'pending'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewal_reminders')
        .select(`
          *,
          tenant:tenants(id, name, subscription_end_date)
        `)
        .eq('status', 'pending')
        .lte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true });

      if (error) throw error;
      return data;
    },
    refetchInterval: 60000,
  });
}

export function useReminderStats() {
  return useQuery({
    queryKey: ['reminder-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewal_reminders')
        .select('status');

      if (error) throw error;

      const totalReminders = data.length;
      const sentReminders = data.filter(r => r.status === 'sent').length;
      const pendingReminders = data.filter(r => r.status === 'pending').length;
      const failedReminders = data.filter(r => r.status === 'failed').length;

      const deliveryRate = totalReminders > 0 
        ? ((sentReminders / totalReminders) * 100).toFixed(1) 
        : '0';

      return {
        totalReminders,
        sentReminders,
        pendingReminders,
        failedReminders,
        deliveryRate,
      };
    },
  });
}

export function useRemindersByDate(date: Date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return useQuery({
    queryKey: ['renewal-reminders', 'by-date', date.toISOString().split('T')[0]],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('renewal_reminders')
        .select(`*, tenant:tenants(id, name)`)
        .gte('scheduled_for', startOfDay.toISOString())
        .lte('scheduled_for', endOfDay.toISOString())
        .order('scheduled_for', { ascending: true });

      if (error) throw error;
      return data;
    },
  });
}

export function useScheduleSummary() {
  return useQuery({
    queryKey: ['reminder-schedule-summary'],
    queryFn: async () => {
      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
      const todayEnd = new Date(now); todayEnd.setHours(23,59,59,999);
      
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() + 7);
      
      const monthEnd = new Date(now);
      monthEnd.setMonth(monthEnd.getMonth() + 1);

      const { data, error } = await supabase
        .from('renewal_reminders')
        .select('scheduled_for, status');

      if (error) throw error;

      const today = data.filter(r => {
        const d = new Date(r.scheduled_for);
        return d >= todayStart && d <= todayEnd;
      }).length;

      const thisWeek = data.filter(r => {
        const d = new Date(r.scheduled_for);
        return d >= todayStart && d <= weekEnd;
      }).length;

      const thisMonth = data.filter(r => {
        const d = new Date(r.scheduled_for);
        return d >= todayStart && d <= monthEnd;
      }).length;

      const overdue = data.filter(r => {
        const d = new Date(r.scheduled_for);
        return d < todayStart && r.status === 'pending';
      }).length;

      return { today, thisWeek, thisMonth, overdue };
    },
  });
}

export function useTenantReminders(tenantId: string | null) {
  return useQuery({
    queryKey: ['tenant-reminders', tenantId],
    queryFn: async () => {
      if (!tenantId) return null;
      const { data, error } = await supabase
        .from('renewal_reminders')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('scheduled_for', { ascending: false });

      if (error) throw error;
      return data as RenewalReminder[];
    },
    enabled: !!tenantId,
  });
}

export function useScheduleReminders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('schedule_renewal_reminders');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewal-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminder-stats'] });
      queryClient.invalidateQueries({ queryKey: ['reminder-schedule-summary'] });
      toast.success('Đã lên lịch nhắc nhở gia hạn');
    },
    onError: (error: any) => {
      toast.error('Lỗi lên lịch: ' + error.message);
    },
  });
}

export function useSendReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reminderId: string) => {
      // Get reminder details
      const { data: reminder, error: fetchError } = await supabase
        .from('renewal_reminders')
        .select('*, tenant:tenants(id, name, email)')
        .eq('id', reminderId)
        .single();

      if (fetchError) throw fetchError;

      // Try sending email via edge function
      if (reminder.tenant?.email) {
        const { error: emailError } = await supabase.functions.invoke('send-notification-email', {
          body: {
            to: reminder.tenant.email,
            subject: reminder.email_subject || `Nhắc nhở gia hạn - ${reminder.tenant.name}`,
            html: reminder.email_body || `<p>Đăng ký của ${reminder.tenant.name} sắp hết hạn. Vui lòng gia hạn.</p>`,
          },
        });

        if (emailError) {
          // Mark as failed
          await supabase
            .from('renewal_reminders')
            .update({ status: 'failed', error_message: emailError.message })
            .eq('id', reminderId);
          throw emailError;
        }
      }

      // Mark as sent
      const { data, error } = await supabase
        .from('renewal_reminders')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', reminderId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['renewal-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminder-stats'] });
      toast.success('Đã gửi nhắc nhở');
    },
    onError: (error: any) => {
      toast.error('Lỗi gửi: ' + error.message);
    },
  });
}

export function useBulkSendReminders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reminderIds: string[]) => {
      const { data, error } = await supabase
        .from('renewal_reminders')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .in('id', reminderIds)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminder-stats'] });
      toast.success(`Đã gửi ${data.length} nhắc nhở`);
    },
    onError: (error: any) => {
      toast.error('Lỗi gửi hàng loạt: ' + error.message);
    },
  });
}

export function useDeleteOldReminders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (daysOld: number = 90) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data, error } = await supabase
        .from('renewal_reminders')
        .delete()
        .lt('sent_at', cutoffDate.toISOString())
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['renewal-reminders'] });
      queryClient.invalidateQueries({ queryKey: ['reminder-stats'] });
      toast.success(`Đã xóa ${data?.length || 0} nhắc nhở cũ`);
    },
    onError: (error: any) => {
      toast.error('Lỗi xóa: ' + error.message);
    },
  });
}

// --- Automation Rules hooks ---
export function useAutomationRules() {
  return useQuery({
    queryKey: ['reminder-automation-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminder_automation_rules')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useToggleAutomationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from('reminder_automation_rules')
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminder-automation-rules'] });
    },
  });
}

export function useDeleteAutomationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('reminder_automation_rules')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminder-automation-rules'] });
      toast.success('Đã xóa quy tắc');
    },
    onError: (error: any) => {
      toast.error('Lỗi xóa: ' + error.message);
    },
  });
}

export function useSaveAutomationRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (rule: {
      id?: string;
      name: string;
      trigger_type: string;
      trigger_value: string;
      action_type: string;
      action_template: string;
      conditions: any;
    }) => {
      if (rule.id) {
        const { error } = await supabase
          .from('reminder_automation_rules')
          .update({
            name: rule.name,
            trigger_type: rule.trigger_type,
            trigger_value: rule.trigger_value,
            action_type: rule.action_type,
            action_template: rule.action_template,
            conditions: rule.conditions,
            updated_at: new Date().toISOString(),
          })
          .eq('id', rule.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('reminder_automation_rules')
          .insert({
            name: rule.name,
            trigger_type: rule.trigger_type,
            trigger_value: rule.trigger_value,
            action_type: rule.action_type,
            action_template: rule.action_template,
            conditions: rule.conditions,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminder-automation-rules'] });
      toast.success('Đã lưu quy tắc');
    },
    onError: (error: any) => {
      toast.error('Lỗi lưu: ' + error.message);
    },
  });
}

// --- Reminder Email Templates hooks ---
export function useReminderTemplates() {
  return useQuery({
    queryKey: ['reminder-email-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminder_email_templates')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveReminderTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (template: {
      id?: string;
      name: string;
      subject: string;
      category: string;
      content: string;
      variables: string[];
    }) => {
      if (template.id) {
        const { error } = await supabase
          .from('reminder_email_templates')
          .update({
            name: template.name,
            subject: template.subject,
            category: template.category,
            content: template.content,
            variables: template.variables,
            updated_at: new Date().toISOString(),
          })
          .eq('id', template.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('reminder_email_templates')
          .insert({
            name: template.name,
            subject: template.subject,
            category: template.category,
            content: template.content,
            variables: template.variables,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminder-email-templates'] });
      toast.success('Đã lưu mẫu');
    },
    onError: (error: any) => {
      toast.error('Lỗi lưu: ' + error.message);
    },
  });
}

export function useDeleteReminderTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('reminder_email_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminder-email-templates'] });
      toast.success('Đã xóa mẫu');
    },
    onError: (error: any) => {
      toast.error('Lỗi xóa: ' + error.message);
    },
  });
}
