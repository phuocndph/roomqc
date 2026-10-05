import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { useMarketingCampaigns } from '@/hooks/super-admin/useMarketingCampaigns';
import { Skeleton } from '@/components/ui/skeleton';

export function CampaignAnalytics() {
  const { data: campaigns = [], isLoading } = useMarketingCampaigns();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // Process data for charts
  const performanceData = campaigns.map((campaign: any) => ({
    name: campaign.name?.substring(0, 20) || 'Campaign',
    sent: campaign.sent_count || 0,
    opened: campaign.opened_count || 0,
    clicked: campaign.clicked_count || 0,
    converted: campaign.converted_count || 0,
  }));

  const conversionData = campaigns.map((campaign: any) => {
    const sent = campaign.sent_count || 0;
    return {
      name: campaign.name?.substring(0, 20) || 'Campaign',
      openRate: sent > 0 ? ((campaign.opened_count || 0) / sent * 100).toFixed(1) : 0,
      clickRate: sent > 0 ? ((campaign.clicked_count || 0) / sent * 100).toFixed(1) : 0,
      conversionRate: sent > 0 ? ((campaign.converted_count || 0) / sent * 100).toFixed(1) : 0,
    };
  });

  return (
    <div className="space-y-6">
      {/* Campaign Performance */}
      <Card>
        <CardHeader>
          <CardTitle>Campaign Performance</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="sent" fill="hsl(217 91% 60%)" name="Sent" />
              <Bar dataKey="opened" fill="hsl(142 76% 36%)" name="Opened" />
              <Bar dataKey="clicked" fill="hsl(262 83% 58%)" name="Clicked" />
              <Bar dataKey="converted" fill="hsl(25 95% 53%)" name="Converted" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Conversion Rates */}
      <Card>
        <CardHeader>
          <CardTitle>Conversion Rates (%)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={conversionData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="openRate"
                stroke="hsl(217 91% 60%)"
                strokeWidth={2}
                name="Open Rate"
              />
              <Line
                type="monotone"
                dataKey="clickRate"
                stroke="hsl(142 76% 36%)"
                strokeWidth={2}
                name="Click Rate"
              />
              <Line
                type="monotone"
                dataKey="conversionRate"
                stroke="hsl(25 95% 53%)"
                strokeWidth={2}
                name="Conversion Rate"
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Top Campaigns */}
      <Card>
        <CardHeader>
          <CardTitle>Top Performing Campaigns</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {campaigns
              .slice()
              .sort((a: any, b: any) => (b.opened_count || 0) - (a.opened_count || 0))
              .slice(0, 5)
              .map((campaign: any, index: number) => {
                const sent = campaign.sent_count || 0;
                const opened = campaign.opened_count || 0;
                const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0';

                return (
                  <div key={campaign.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="font-medium">{campaign.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {sent} sent • {opened} opened
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-600">{openRate}%</p>
                      <p className="text-xs text-muted-foreground">Open Rate</p>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
