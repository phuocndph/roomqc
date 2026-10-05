import { useReminderStats } from '@/hooks/super-admin/useRenewalReminders';
import { Loader2 } from 'lucide-react';

export function ReminderAnalytics() {
  const { data: stats, isLoading } = useReminderStats();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const total = stats?.totalReminders || 0;
  const sent = stats?.sentReminders || 0;
  const pending = stats?.pendingReminders || 0;
  const failed = stats?.failedReminders || 0;

  const sentPct = total > 0 ? ((sent / total) * 100).toFixed(1) : '0';
  const pendingPct = total > 0 ? ((pending / total) * 100).toFixed(1) : '0';
  const failedPct = total > 0 ? ((failed / total) * 100).toFixed(1) : '0';

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-medium">Phân tích nhắc nhở</h3>

      {/* Status distribution */}
      <div className="space-y-3">
        <StatusBar label="Đã gửi" value={sent} pct={sentPct} color="bg-green-500" textColor="text-green-600" />
        <StatusBar label="Chờ gửi" value={pending} pct={pendingPct} color="bg-amber-500" textColor="text-amber-600" />
        <StatusBar label="Thất bại" value={failed} pct={failedPct} color="bg-red-500" textColor="text-red-600" />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-3 pt-3 border-t">
        <div className="text-center">
          <p className="text-xl font-semibold text-green-600">{stats?.deliveryRate || 0}%</p>
          <p className="text-xs text-muted-foreground">Tỷ lệ gửi</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold">{total}</p>
          <p className="text-xs text-muted-foreground">Tổng cộng</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold text-red-600">{failed}</p>
          <p className="text-xs text-muted-foreground">Thất bại</p>
        </div>
      </div>
    </div>
  );
}

function StatusBar({ label, value, pct, color, textColor }: {
  label: string; value: number; pct: string; color: string; textColor: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs">{label}</span>
        <span className={`text-xs font-medium ${textColor}`}>{value} ({pct}%)</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
