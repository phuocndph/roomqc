import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit, Trash2, Zap, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { AutomationRuleDialog } from './AutomationRuleDialog';
import {
  useAutomationRules,
  useToggleAutomationRule,
  useDeleteAutomationRule,
} from '@/hooks/super-admin/useRenewalReminders';

export function ReminderAutomationRules() {
  const { data: rules = [], isLoading } = useAutomationRules();
  const toggleRule = useToggleAutomationRule();
  const deleteRule = useDeleteAutomationRule();
  const [editingRule, setEditingRule] = useState<any>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Quy tắc tự động</h3>
          <p className="text-xs text-muted-foreground">Cấu hình nhắc nhở tự động khi đăng ký sắp hết hạn</p>
        </div>
        <Button size="sm" className="h-8" onClick={() => { setEditingRule(null); setDialogOpen(true); }}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Tạo quy tắc
        </Button>
      </div>

      {/* Rules */}
      <div className="space-y-2">
        {rules.map((rule: any) => (
          <div key={rule.id} className={`border rounded-lg p-3 ${!rule.enabled ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 flex-1">
                <p className="text-sm font-medium">{rule.name}</p>
                {rule.enabled ? (
                  <span className="text-xs font-medium text-green-600 flex items-center gap-1">
                    <Zap className="h-3 w-3" /> Hoạt động
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">Tắt</span>
                )}
              </div>
              <Switch
                checked={rule.enabled}
                onCheckedChange={(checked) => toggleRule.mutate({ id: rule.id, enabled: checked })}
              />
            </div>

            <div className="grid md:grid-cols-3 gap-2 mb-2">
              <div className="border rounded p-2">
                <p className="text-xs text-muted-foreground mb-0.5">Điều kiện</p>
                <p className="text-xs font-medium">
                  {rule.trigger_type === 'days_before_expiry'
                    ? `${rule.trigger_value} ngày trước hạn`
                    : `Trạng thái: ${rule.trigger_value}`}
                </p>
              </div>
              <div className="border rounded p-2">
                <p className="text-xs text-muted-foreground mb-0.5">Hành động</p>
                <p className="text-xs font-medium capitalize">
                  {rule.action_type === 'send_email' ? 'Gửi email' : rule.action_type === 'send_sms' ? 'Gửi SMS' : 'Tạo task'}
                </p>
                <p className="text-xs text-muted-foreground font-mono">{rule.action_template}</p>
              </div>
              <div className="border rounded p-2">
                <p className="text-xs text-muted-foreground mb-0.5">Phạm vi</p>
                <p className="text-xs font-medium">
                  {rule.conditions?.plans?.length
                    ? `Gói: ${rule.conditions.plans.join(', ')}`
                    : 'Tất cả tenant'}
                </p>
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t">
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => { setEditingRule(rule); setDialogOpen(true); }}>
                <Edit className="h-3 w-3 mr-1" /> Sửa
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs text-red-600 hover:text-red-700" onClick={() => deleteRule.mutate(rule.id)}>
                <Trash2 className="h-3 w-3 mr-1" /> Xóa
              </Button>
            </div>
          </div>
        ))}

        {rules.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground">
            Chưa có quy tắc nào. Nhấn "Tạo quy tắc" để bắt đầu.
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-start gap-3 p-3 border rounded-lg">
        <Zap className="h-4 w-4 text-muted-foreground mt-0.5" />
        <div>
          <p className="text-sm font-medium">Cách hoạt động</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Quy tắc được đánh giá mỗi ngày lúc 2:00 AM UTC. Khi điều kiện thỏa mãn, hành động sẽ tự động thực thi.
          </p>
        </div>
      </div>

      <AutomationRuleDialog
        rule={editingRule}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
