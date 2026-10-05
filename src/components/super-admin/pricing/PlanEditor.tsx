import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUpdatePlan } from '@/hooks/super-admin/usePricingManagement';
import { Settings, DollarSign, Database, Sparkles } from 'lucide-react';
import type { SubscriptionPlan } from '@/types/subscription.types';

const planSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Code is required'),
  description: z.string().optional(),
  price_monthly: z.number().min(0),
  price_yearly: z.number().min(0),
  max_hotels: z.number().min(1),
  max_users: z.number().min(1),
  max_storage_gb: z.number().min(0),
  display_order: z.number().min(0),
  is_active: z.boolean(),
  features: z.object({
    advanced_reporting: z.boolean(),
    api_access: z.boolean(),
    priority_support: z.boolean(),
    custom_branding: z.boolean(),
    sso: z.boolean(),
    audit_logs: z.boolean(),
  }),
});

type PlanFormValues = z.infer<typeof planSchema>;

interface PlanEditorProps {
  plan: SubscriptionPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PlanEditor({ plan, open, onOpenChange }: PlanEditorProps) {
  const updatePlan = useUpdatePlan();

  const form = useForm<PlanFormValues>({
    resolver: zodResolver(planSchema),
    defaultValues: {
      name: '',
      code: '',
      description: '',
      price_monthly: 0,
      price_yearly: 0,
      max_hotels: 1,
      max_users: 5,
      max_storage_gb: 1,
      display_order: 0,
      is_active: true,
      features: {
        advanced_reporting: false,
        api_access: false,
        priority_support: false,
        custom_branding: false,
        sso: false,
        audit_logs: false,
      },
    },
  });

  useEffect(() => {
    if (plan) {
      const planFeatures = typeof plan.features === 'object' && plan.features !== null 
        ? plan.features as any 
        : {};
        
      form.reset({
        name: plan.name,
        code: plan.code,
        description: plan.description || '',
        price_monthly: plan.price_monthly,
        price_yearly: plan.price_yearly,
        max_hotels: plan.max_hotels,
        max_users: plan.max_users,
        max_storage_gb: plan.max_storage_gb,
        display_order: plan.display_order,
        is_active: plan.is_active,
        features: {
          advanced_reporting: planFeatures.advanced_reporting || false,
          api_access: planFeatures.api_access || false,
          priority_support: planFeatures.priority_support || false,
          custom_branding: planFeatures.custom_branding || false,
          sso: planFeatures.sso || false,
          audit_logs: planFeatures.audit_logs || false,
        },
      });
    }
  }, [plan, form]);

  const onSubmit = async (data: PlanFormValues) => {
    if (!plan) return;

    await updatePlan.mutateAsync({
      id: plan.id,
      updates: {
        name: data.name,
        code: data.code,
        description: data.description,
        price_monthly: data.price_monthly,
        price_yearly: data.price_yearly,
        max_hotels: data.max_hotels,
        max_users: data.max_users,
        max_storage_gb: data.max_storage_gb,
        display_order: data.display_order,
        is_active: data.is_active,
        features: data.features,
      },
    });

    onOpenChange(false);
  };

  const monthlySaving = form.watch('price_monthly')
    ? Math.round((1 - form.watch('price_yearly') / (form.watch('price_monthly') * 12)) * 100)
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Plan - {plan?.name}</DialogTitle>
          <DialogDescription>
            Update plan details, pricing, limits, and features
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <Tabs defaultValue="general" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general">
                  <Settings className="h-4 w-4 mr-2" />
                  General & Pricing
                </TabsTrigger>
                <TabsTrigger value="limits">
                  <Database className="h-4 w-4 mr-2" />
                  Limits
                </TabsTrigger>
                <TabsTrigger value="features">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Features
                </TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plan Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Professional" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Plan Code</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., professional" {...field} />
                      </FormControl>
                      <FormDescription>Unique identifier for this plan</FormDescription>
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
                        <Textarea
                          placeholder="Describe what's included in this plan..."
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="price_monthly"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Monthly Price ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number" min={0}
                            step="0.01"
                            placeholder="29.99"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="price_yearly"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Yearly Price ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number" min={0}
                            step="0.01"
                            placeholder="299.99"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        {monthlySaving > 0 && (
                          <FormDescription className="text-green-600">
                            Save {monthlySaving}% with yearly billing
                          </FormDescription>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="display_order"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Display Order</FormLabel>
                        <FormControl>
                          <Input
                            type="number" min={0}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormDescription>Lower numbers appear first</FormDescription>
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
                          <FormLabel className="text-base">Active</FormLabel>
                          <FormDescription>
                            Available for new subscriptions
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
                </div>
              </TabsContent>

              <TabsContent value="limits" className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="max_hotels"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Hotels</FormLabel>
                        <FormControl>
                          <Input
                            type="number" min={0}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="max_users"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Max Users</FormLabel>
                        <FormControl>
                          <Input
                            type="number" min={0}
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="max_storage_gb"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Storage Limit (GB)</FormLabel>
                        <FormControl>
                          <Input
                            type="number" min={0}
                            step="0.1"
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </TabsContent>

              <TabsContent value="features" className="space-y-4">
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="features.advanced_reporting"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Advanced Reporting</FormLabel>
                          <FormDescription>
                            Access to detailed analytics and custom reports
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

                  <FormField
                    control={form.control}
                    name="features.api_access"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">API Access</FormLabel>
                          <FormDescription>
                            RESTful API for integrations
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

                  <FormField
                    control={form.control}
                    name="features.priority_support"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Priority Support</FormLabel>
                          <FormDescription>
                            24/7 priority customer support
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

                  <FormField
                    control={form.control}
                    name="features.custom_branding"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Custom Branding</FormLabel>
                          <FormDescription>
                            White-label with custom logo and colors
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

                  <FormField
                    control={form.control}
                    name="features.sso"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Single Sign-On (SSO)</FormLabel>
                          <FormDescription>
                            SAML 2.0 / OAuth integration
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

                  <FormField
                    control={form.control}
                    name="features.audit_logs"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Audit Logs</FormLabel>
                          <FormDescription>
                            Complete activity tracking and compliance
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
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={updatePlan.isPending}>
                {updatePlan.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
