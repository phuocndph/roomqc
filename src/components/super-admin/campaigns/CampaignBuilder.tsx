import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCreateCampaign } from '@/hooks/super-admin/useMarketingCampaigns';
import { CampaignPreview } from './CampaignPreview';
import { Mail, Send } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const campaignSchema = z.object({
  name: z.string().min(3),
  target_audience: z.enum(['all', 'active', 'trial', 'cancelled', 'specific_plans']),
  email_subject: z.string().min(5).optional(),
  email_template: z.string().min(20).optional(),
  campaign_type: z.enum(['price_promotion', 'feature_launch', 'seasonal_offer', 'win_back', 'upgrade_incentive']),
  starts_at: z.string(),
});

type CampaignFormValues = z.infer<typeof campaignSchema>;


export function CampaignBuilder() {
  const [activeTab, setActiveTab] = useState('compose');
  const createCampaign = useCreateCampaign();
  const location = useLocation();
  const prefill = (location.state as { prefill?: { name?: string; email_subject?: string } } | null)?.prefill;

  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignSchema),
    defaultValues: {
      name: prefill?.name ?? '',
      target_audience: 'all',
      email_subject: prefill?.email_subject ?? '',
      email_template: '',
      campaign_type: 'price_promotion',
      starts_at: new Date().toISOString().split('T')[0],
    },
  });

  const onSubmit = async (data: CampaignFormValues) => {
    await createCampaign.mutateAsync({
      name: data.name,
      target_audience: data.target_audience,
      email_subject: data.email_subject,
      email_template: data.email_template,
      campaign_type: data.campaign_type,
      starts_at: data.starts_at,
      status: 'draft',
    });
    form.reset();
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Campaign Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Campaign Builder
          </CardTitle>
          <CardDescription>
            Create targeted email campaigns for your tenants
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="compose">Compose</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                </TabsList>

                <TabsContent value="compose" className="space-y-4 mt-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campaign Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Summer 2024 Promotion" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email_subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Subject</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="🎉 Special Offer: 20% Off Premium Plans"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email_template"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Body</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Hi {{tenant_name}},&#10;&#10;We're excited to offer you..."
                            rows={12}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Available variables: {'{'}{'{'} tenant_name {'}'}{'}'}, {'{'}{'{'} contact_name {'}'}{'}'}, {'{'}{'{'} plan_name {'}'}{'}'}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="settings" className="space-y-4 mt-4">
                  <FormField
                    control={form.control}
                    name="target_audience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Target Audience</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="all">All Tenants</SelectItem>
                            <SelectItem value="trial">Trial Users</SelectItem>
                            <SelectItem value="active">Active Subscribers</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                            <SelectItem value="specific_plans">Specific Plans</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="campaign_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Campaign Type</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="price_promotion">Price Promotion</SelectItem>
                            <SelectItem value="feature_launch">Feature Launch</SelectItem>
                            <SelectItem value="seasonal_offer">Seasonal Offer</SelectItem>
                            <SelectItem value="win_back">Win Back</SelectItem>
                            <SelectItem value="upgrade_incentive">Upgrade Incentive</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="starts_at"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Start Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>
              </Tabs>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={createCampaign.isPending}
                  className="flex-1"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Save Campaign
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* Live Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Email Preview</CardTitle>
          <CardDescription>
            See how your email will look to recipients
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CampaignPreview
            subject={form.watch('email_subject') || ''}
            body={form.watch('email_template') || ''}
          />
        </CardContent>
      </Card>
    </div>
  );
}
