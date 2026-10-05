import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import { Clock, Send, Loader2 } from 'lucide-react';
import {
  useRemindersByDate,
  useScheduleSummary,
  useBulkSendReminders,
} from '@/hooks/super-admin/useRenewalReminders';

const statusColor: Record<string, string> = {
  pending: 'text-amber-600',
  sent: 'text-green-600',
  failed: 'text-red-600',
};

export function ReminderScheduler() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { data: reminders = [], isLoading } = useRemindersByDate(selectedDate);
  const { data: summary } = useScheduleSummary();
  const bulkSend = useBulkSendReminders();

  const pendingIds = reminders.filter((r: any) => r.status === 'pending').map((r: any) => r.id);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Calendar + List */}
        <div className="lg:col-span-2 border rounded-lg p-3">
          <h3 className="text-sm font-medium mb-3">Lịch nhắc nhở</h3>
          <div className="flex gap-4">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              className="rounded-md border"
            />

            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium mb-3">
                {format(selectedDate, 'd MMMM, yyyy', { locale: vi })}
              </h4>

              <ScrollArea className="h-[280px]">
                {isLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : reminders.length > 0 ? (
                  <div className="space-y-2">
                    {reminders.map((reminder: any) => (
                      <div key={reminder.id} className="p-2 rounded-lg border hover:bg-accent/50 transition-colors">
                        <div className="flex items-start justify-between mb-1">
                          <div>
                            <p className="text-sm font-medium">{reminder.tenant?.name || 'N/A'}</p>
                            <p className="text-xs text-muted-foreground">{reminder.reminder_type}</p>
                          </div>
                          <span className={`text-xs font-medium ${statusColor[reminder.status] || ''}`}>
                            {reminder.status === 'pending' ? 'Chờ gửi' : reminder.status === 'sent' ? 'Đã gửi' : 'Thất bại'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {format(new Date(reminder.scheduled_for), 'HH:mm')}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Không có nhắc nhở nào trong ngày này
                  </p>
                )}
              </ScrollArea>

              {pendingIds.length > 0 && (
                <Button
                  size="sm"
                  className="w-full mt-3 h-8"
                  onClick={() => bulkSend.mutate(pendingIds)}
                  disabled={bulkSend.isPending}
                >
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  Gửi {pendingIds.length} nhắc nhở chờ
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="border rounded-lg p-3">
          <h3 className="text-sm font-medium mb-3">Tổng quan lịch</h3>
          <div className="space-y-2">
            <SummaryItem label="Hôm nay" value={summary?.today ?? 0} color="text-blue-600" />
            <SummaryItem label="Tuần này" value={summary?.thisWeek ?? 0} color="text-green-600" />
            <SummaryItem label="Tháng này" value={summary?.thisMonth ?? 0} color="text-purple-600" />
            <SummaryItem label="Quá hạn" value={summary?.overdue ?? 0} color="text-red-600" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg border">
      <span className="text-sm">{label}</span>
      <span className={`text-lg font-semibold ${color}`}>{value}</span>
    </div>
  );
}
