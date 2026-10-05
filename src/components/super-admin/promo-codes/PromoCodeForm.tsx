import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { useCreatePromoCode, useUpdatePromoCode } from '@/hooks/super-admin/usePromoCodes';
import type { PromotionalCode } from '@/types/super-admin.types';

const promoCodeSchema = z.object({
  code: z.string().min(3, 'Code must be at least 3 characters').max(50),
  description: z.string().optional(),
  discount_type: z.enum(['percentage', 'fixed_amount', 'free_trial_extension', 'free_months']),
  discount_value: z.coerce.number().min(0, 'Value must be positive'),
  applicable_plans: z.array(z.string()).default([]),
  applicable_billing_cycles: z.array(z.string()).default([]),
  max_uses: z.coerce.number().optional(),
  max_uses_per_tenant: z.coerce.number().default(1),
  valid_from: z.string(),
  valid_until: z.string().optional(),
  is_active: z.boolean().default(true),
});

type PromoCodeFormValues = z.infer<typeof promoCodeSchema>;

interface PromoCodeFormProps {
  promoCode: PromotionalCode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromoCodeForm({ promoCode, open, onOpenChange }: PromoCodeFormProps) {
  const createPromoCode = useCreatePromoCode();
  const updatePromoCode = useUpdatePromoCode();

  const form = useForm<PromoCodeFormValues>({
    resolver: zodResolver(promoCodeSchema),
    defaultValues: {
      code: '',
      description: '',
      discount_type: 'percentage',
      discount_value: 0,
      applicable_plans: [],
      applicable_billing_cycles: [],
      max_uses: undefined,
      max_uses_per_tenant: 1,
      valid_from: new Date().toISOString().split('T')[0],
      valid_until: undefined,
      is_active: true,
    },
  });

  useEffect(() => {
    if (promoCode) {
      form.reset({
        code: promoCode.code,
        description: promoCode.description || '',
        discount_type: promoCode.discount_type,
        discount_value: promoCode.discount_value,
        applicable_plans: promoCode.applicable_plans,
        applicable_billing_cycles: promoCode.applicable_billing_cycles,
        max_uses: promoCode.max_uses || undefined,
        max_uses_per_tenant: promoCode.max_uses_per_tenant,
        valid_from: promoCode.valid_from.split('T')[0],
        valid_until: promoCode.valid_until?.split('T')[0],
        is_active: promoCode.is_active,
      });
    } else {
      form.reset();
    }
  }, [promoCode, form]);

  const onSubmit = async (values: PromoCodeFormValues) => {
    try {
      if (promoCode) {
        await updatePromoCode.mutateAsync({
          id: promoCode.id,
          updates: values,
        });
      } else {
        await createPromoCode.mutateAsync(values as any);
      }
      onOpenChange(false);
      form.reset();
    } catch (error) {
      console.error('Failed to save promo code:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {promoCode ? 'Edit Promo Code' : 'Create Promo Code'}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Code</FormLabel>
                  <FormControl>
                    <Input placeholder="SAVE20" {...field} className="font-mono" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Internal description..." {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="discount_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage</SelectItem>
                        <SelectItem value="fixed_amount">Fixed Amount</SelectItem>
                        <SelectItem value="free_trial_extension">Free Trial Extension</SelectItem>
                        <SelectItem value="free_months">Free Months</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="discount_value"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Discount Value</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} placeholder="20" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="max_uses"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Total Uses (Optional)</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} placeholder="100" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="max_uses_per_tenant"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Uses Per Tenant</FormLabel>
                    <FormControl>
                      <Input type="number" min={0} placeholder="1" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="valid_from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid From</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="valid_until"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Valid Until (Optional)</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active</FormLabel>
                    <div className="text-sm text-muted-foreground">
                      Enable this promo code for use
                    </div>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createPromoCode.isPending || updatePromoCode.isPending}
              >
                {promoCode ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
