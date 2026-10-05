import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Loader2, Save } from 'lucide-react';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePlatformSettings, useUpdateMultiplePlatformSettings } from '@/hooks/super-admin/usePlatformSettings';

const formSchema = z.object({
  trial_period_days: z.coerce.number().min(1).max(90),
  grace_period_days: z.coerce.number().min(1).max(30),
  default_rooms: z.coerce.number().min(1).max(1000),
  price_per_room_day: z.coerce.number().min(100).max(1000000),
  platform_name: z.string().min(1).max(100),
  support_email: z.string().email(),
});

type FormValues = z.infer<typeof formSchema>;

export function PlatformSettings() {
  const { t } = useTranslation('superAdmin');
  const { data: settings, isLoading } = usePlatformSettings();
  const updateMutation = useUpdateMultiplePlatformSettings();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      trial_period_days: 14,
      grace_period_days: 7,
      default_rooms: 10,
      price_per_room_day: 1000,
      platform_name: 'Hotel Asset Manager',
      support_email: 'support@example.com',
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        trial_period_days: settings.trial_period_days || 14,
        grace_period_days: settings.grace_period_days || 7,
        default_rooms: settings.default_rooms || 10,
        price_per_room_day: settings.price_per_room_day || 1000,
        platform_name: settings.platform_name || 'Hotel Asset Manager',
        support_email: settings.support_email || 'support@example.com',
      });
    }
  }, [settings, form]);

  const onSubmit = async (values: FormValues) => {
    const settingsToUpdate = Object.entries(values).map(([key, value]) => ({
      key,
      value,
    }));
    await updateMutation.mutateAsync(settingsToUpdate);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        {/* Subscription Settings */}
        <div className="p-4 border rounded-lg space-y-4">
          <h3 className="font-medium text-sm">{t('settings.platform.subscriptionSettings')}</h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="trial_period_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">{t('settings.platform.trialPeriod')}</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} className="h-9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="grace_period_days"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">{t('settings.platform.gracePeriod')}</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} className="h-9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="default_rooms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">{t('settings.platform.defaultRooms')}</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} className="h-9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="price_per_room_day"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">{t('settings.platform.pricePerRoom')}</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} className="h-9" {...field} />
                  </FormControl>
                  <FormDescription className="text-xs">
                    VND / phòng / ngày
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        {/* Platform Info */}
        <div className="p-4 border rounded-lg space-y-4">
          <h3 className="font-medium text-sm">{t('settings.platform.platformInfo')}</h3>
          
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="platform_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">{t('settings.platform.platformName')}</FormLabel>
                  <FormControl>
                    <Input className="h-9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="support_email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">{t('settings.platform.supportEmail')}</FormLabel>
                  <FormControl>
                    <Input type="email" className="h-9" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

        <Button type="submit" disabled={updateMutation.isPending}>
          {updateMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Đang lưu...
            </>
          ) : (
            <>
              <Save className="h-4 w-4 mr-2" />
              {t('settings.save')}
            </>
          )}
        </Button>
      </form>
    </Form>
  );
}
