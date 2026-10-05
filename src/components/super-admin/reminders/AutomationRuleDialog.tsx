import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useSaveAutomationRule } from '@/hooks/super-admin/useRenewalReminders';

const ruleSchema = z.object({
  name: z.string().min(3, 'Tên phải có ít nhất 3 ký tự'),
  triggerType: z.enum(['days_before_expiry', 'subscription_status']),
  triggerValue: z.string().min(1),
  actionType: z.enum(['send_email', 'send_sms', 'create_task']),
  emailTemplate: z.string(),
  plans: z.array(z.string()),
});

type RuleFormValues = z.infer<typeof ruleSchema>;

interface AutomationRuleDialogProps {
  rule: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AutomationRuleDialog({ rule, open, onOpenChange }: AutomationRuleDialogProps) {
  const saveRule = useSaveAutomationRule();

  const form = useForm<RuleFormValues>({
    resolver: zodResolver(ruleSchema),
    defaultValues: {
      name: '',
      triggerType: 'days_before_expiry',
      triggerValue: '7',
      actionType: 'send_email',
      emailTemplate: '',
      plans: [],
    },
  });
  const { reset } = form;

  useEffect(() => {
    if (open) {
      if (rule) {
        reset({
          name: rule.name,
          triggerType: rule.trigger_type,
          triggerValue: String(rule.trigger_value),
          actionType: rule.action_type,
          emailTemplate: rule.action_template || '',
          plans: rule.conditions?.plans || [],
        });
      } else {
        reset({
          name: '', triggerType: 'days_before_expiry', triggerValue: '7',
          actionType: 'send_email', emailTemplate: '', plans: [],
        });
      }
    }
  }, [open, rule, reset]);

  const onSubmit = (data: RuleFormValues) => {
    saveRule.mutate({
      id: rule?.id,
      name: data.name,
      trigger_type: data.triggerType,
      trigger_value: data.triggerValue,
      action_type: data.actionType,
      action_template: data.emailTemplate,
      conditions: data.plans.length > 0 ? { plans: data.plans } : {},
    }, {
      onSuccess: () => onOpenChange(false),
    });
  };

  const availablePlans = [
    { id: 'basic', label: 'Gói cơ bản' },
    { id: 'premium', label: 'Gói cao cấp' },
    { id: 'enterprise', label: 'Gói doanh nghiệp' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? 'Sửa quy tắc' : 'Tạo quy tắc mới'}</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Tên quy tắc</FormLabel>
                <FormControl><Input placeholder="VD: 7 ngày trước hạn" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* Trigger */}
            <div className="space-y-3 p-3 border rounded-lg">
              <h3 className="text-sm font-medium">Điều kiện kích hoạt</h3>
              <FormField control={form.control} name="triggerType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Loại</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="h-8"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="days_before_expiry">Số ngày trước hạn</SelectItem>
                      <SelectItem value="subscription_status">Trạng thái đăng ký</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {form.watch('triggerType') === 'days_before_expiry' ? (
                <FormField control={form.control} name="triggerValue" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Số ngày</FormLabel>
                    <FormControl><Input type="number" min={0} placeholder="7" {...field} className="h-8" /></FormControl>
                    <FormDescription className="text-xs">Gửi nhắc nhở trước ngày hết hạn</FormDescription>
                    <FormMessage />
                  </FormItem>
                )} />
              ) : (
                <FormField control={form.control} name="triggerValue" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Trạng thái</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="h-8"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="grace_period">Gia hạn</SelectItem>
                        <SelectItem value="cancelled">Đã hủy</SelectItem>
                        <SelectItem value="suspended">Tạm ngưng</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </div>

            {/* Action */}
            <div className="space-y-3 p-3 border rounded-lg">
              <h3 className="text-sm font-medium">Hành động</h3>
              <FormField control={form.control} name="actionType" render={({ field }) => (
                <FormItem>
                  <FormLabel>Loại</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl><SelectTrigger className="h-8"><SelectValue /></SelectTrigger></FormControl>
                    <SelectContent>
                      <SelectItem value="send_email">Gửi email</SelectItem>
                      <SelectItem value="send_sms">Gửi SMS</SelectItem>
                      <SelectItem value="create_task">Tạo task</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )} />

              {form.watch('actionType') === 'send_email' && (
                <FormField control={form.control} name="emailTemplate" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mẫu email</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="h-8"><SelectValue placeholder="Chọn mẫu" /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="renewal_7_days">7 ngày trước</SelectItem>
                        <SelectItem value="renewal_3_days_urgent">3 ngày - Gấp</SelectItem>
                        <SelectItem value="renewal_1_day_final">1 ngày - Cuối</SelectItem>
                        <SelectItem value="grace_period_payment_failed">Thanh toán thất bại</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </div>

            {/* Conditions */}
            <div className="space-y-3 p-3 border rounded-lg">
              <h3 className="text-sm font-medium">Phạm vi (tùy chọn)</h3>
              <FormField control={form.control} name="plans" render={() => (
                <FormItem>
                  <FormLabel>Áp dụng cho gói</FormLabel>
                  <div className="space-y-2">
                    {availablePlans.map((plan) => (
                      <FormField key={plan.id} control={form.control} name="plans" render={({ field }) => (
                        <FormItem key={plan.id} className="flex flex-row items-start space-x-3 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={field.value?.includes(plan.id)}
                              onCheckedChange={(checked) =>
                                checked
                                  ? field.onChange([...field.value, plan.id])
                                  : field.onChange(field.value?.filter((v) => v !== plan.id))
                              }
                            />
                          </FormControl>
                          <FormLabel className="font-normal text-sm">{plan.label}</FormLabel>
                        </FormItem>
                      )} />
                    ))}
                  </div>
                  <FormDescription className="text-xs">Để trống = áp dụng tất cả</FormDescription>
                  <FormMessage />
                </FormItem>
              )} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Hủy</Button>
              <Button type="submit" size="sm" disabled={saveRule.isPending}>
                {rule ? 'Cập nhật' : 'Tạo mới'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
