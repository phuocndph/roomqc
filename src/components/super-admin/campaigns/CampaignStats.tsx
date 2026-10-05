import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useCampaignStats } from '@/hooks/super-admin/useMarketingCampaigns';
import type { MarketingCampaign } from '@/types/super-admin.types';
import { Mail, MousePointerClick, Eye, TrendingUp } from 'lucide-react';

interface CampaignStatsProps {
  campaign: MarketingCampaign | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CampaignStats({ campaign, open, onOpenChange }: CampaignStatsProps) {
  const { data: stats, isLoading } = useCampaignStats(
    open ? campaign?.id || null : null
  );

  if (!campaign) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span>{campaign.name}</span>
            <Badge>{campaign.status}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Overview Cards */}
          <div className="grid grid-cols-4 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Emails Sent</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoading ? '...' : stats?.totalSent || campaign.sent_count || 0}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Open Rate</CardTitle>
                <Eye className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoading ? '...' : `${stats?.openRate || 0}%`}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.totalOpened || campaign.opened_count || 0} opened
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Click Rate</CardTitle>
                <MousePointerClick className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoading ? '...' : `${stats?.clickRate || 0}%`}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.totalClicked || campaign.clicked_count || 0} clicks
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conversions</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {isLoading ? '...' : stats?.totalConverted || campaign.converted_count || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stats?.conversionRate || 0}% conversion rate
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Campaign Details */}
          <Card>
            <CardHeader>
              <CardTitle>Campaign Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Campaign Type</p>
                  <p className="text-base capitalize">
                    {campaign.campaign_type.replace(/_/g, ' ')}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Target Audience</p>
                  <p className="text-base capitalize">
                    {campaign.target_audience.replace(/_/g, ' ')}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Start Date</p>
                  <p className="text-base">
                    {new Date(campaign.starts_at).toLocaleString()}
                  </p>
                </div>
                {campaign.ends_at && (
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">End Date</p>
                    <p className="text-base">
                      {new Date(campaign.ends_at).toLocaleString()}
                    </p>
                  </div>
                )}
              </div>

              {campaign.description && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Description</p>
                  <p className="text-base">{campaign.description}</p>
                </div>
              )}

              {campaign.email_subject && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-1">Email Subject</p>
                  <p className="text-base font-medium">{campaign.email_subject}</p>
                </div>
              )}

              {campaign.cta_text && (
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-1">Call to Action</p>
                    <p className="text-base font-medium">{campaign.cta_text}</p>
                  </div>
                  {campaign.cta_link && (
                    <div>
                      <p className="text-sm font-medium text-muted-foreground mb-1">Link</p>
                      <a 
                        href={campaign.cta_link} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-base text-primary hover:underline"
                      >
                        {campaign.cta_link}
                      </a>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
