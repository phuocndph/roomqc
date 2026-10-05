import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Save, Trash2, Building2 } from 'lucide-react';
import { VIETNAM_BANKS, getBankName } from '@/lib/vietnam-banks';
import {
  useSuperAdminBankPaymentSettings,
  useCreateBankPaymentSettings,
  useUpdateBankPaymentSettings,
  useDeleteBankPaymentSettings,
} from '@/hooks/useBankPaymentSettings';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

const formSchema = z.object({
  bank_code: z.string().min(1, 'Vui lòng chọn ngân hàng'),
  account_number: z.string().min(1, 'Vui lòng nhập số tài khoản'),
  account_holder: z.string().min(1, 'Vui lòng nhập tên chủ tài khoản'),
  payment_prefix: z.string().min(1, 'Vui lòng nhập tiền tố'),
  qr_template: z.string().default('compact'),
  is_active: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

export function BankPaymentSettings() {
  const { data: settings, isLoading } = useSuperAdminBankPaymentSettings();
  const createMutation = useCreateBankPaymentSettings();
  const updateMutation = useUpdateBankPaymentSettings();
  const deleteMutation = useDeleteBankPaymentSettings();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      bank_code: '',
      account_number: '',
      account_holder: '',
      payment_prefix: 'HD-',
      qr_template: 'compact',
      is_active: true,
    },
  });

  // Update form when settings loaded
  useEffect(() => {
    if (settings) {
      form.reset({
        bank_code: settings.bank_code,
        account_number: settings.account_number,
        account_holder: settings.account_holder,
        payment_prefix: settings.payment_prefix || 'HD-',
        qr_template: settings.qr_template || 'compact',
        is_active: settings.is_active,
      });
    }
  }, [settings, form]);

  const onSubmit = async (values: FormValues) => {
    const bank = VIETNAM_BANKS.find(b => b.code === values.bank_code);
    
    if (settings?.id) {
      await updateMutation.mutateAsync({ 
        id: settings.id, 
        ...values,
        bank_name: bank?.name || values.bank_code,
      });
    } else {
      await createMutation.mutateAsync({
        bank_code: values.bank_code,
        bank_name: bank?.name || values.bank_code,
        account_number: values.account_number,
        account_holder: values.account_holder,
        payment_prefix: values.payment_prefix,
        qr_template: values.qr_template,
        is_active: values.is_active,
        hotel_id: null as unknown as string,
        tenant_id: null as unknown as string,
      });
    }
  };

  const handleDelete = async () => {
    if (settings?.id) {
      await deleteMutation.mutateAsync(settings.id);
      form.reset({
        bank_code: '',
        account_number: '',
        account_holder: '',
        payment_prefix: 'HD-',
        qr_template: 'compact',
        is_active: true,
      });
    }
  };

  const isSubmitting = createMutation.isPending || updateMutation.isPending;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Building2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Cài đặt thanh toán ngân hàng</CardTitle>
            <CardDescription>
              Cấu hình tài khoản ngân hàng để nhận thanh toán qua QR Code VietQR
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="bank_code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ngân hàng</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn ngân hàng" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent className="max-h-[300px]">
                      {VIETNAM_BANKS.map((bank) => (
                        <SelectItem key={bank.code} value={bank.code}>
                          {bank.shortName} - {bank.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="account_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Số tài khoản</FormLabel>
                  <FormControl>
                    <Input placeholder="Nhập số tài khoản" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="account_holder"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tên chủ tài khoản</FormLabel>
                  <FormControl>
                    <Input placeholder="Nhập tên chủ tài khoản (in hoa)" {...field} />
                  </FormControl>
                  <FormDescription>
                    Nhập đúng tên chủ tài khoản như trên ngân hàng
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="payment_prefix"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tiền tố mã thanh toán</FormLabel>
                  <FormControl>
                    <Input placeholder="VD: HD-, DK-" {...field} />
                  </FormControl>
                  <FormDescription>
                    Tiền tố sẽ được thêm vào nội dung chuyển khoản (VD: HD-ABC123)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="qr_template"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kiểu QR Code</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="compact">Compact (Nhỏ gọn)</SelectItem>
                      <SelectItem value="compact2">Compact 2 (Logo ngân hàng)</SelectItem>
                      <SelectItem value="print">Print (In ấn)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Kích hoạt</FormLabel>
                    <FormDescription>
                      Cho phép khách hàng thanh toán qua chuyển khoản ngân hàng
                    </FormDescription>
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

            <div className="flex gap-3">
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    {settings ? 'Cập nhật' : 'Lưu cài đặt'}
                  </>
                )}
              </Button>

              {settings && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Xóa cài đặt thanh toán?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Hành động này sẽ xóa thông tin tài khoản ngân hàng. Khách hàng sẽ không thể thanh toán qua chuyển khoản cho đến khi bạn cấu hình lại.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Hủy</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Xóa
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
