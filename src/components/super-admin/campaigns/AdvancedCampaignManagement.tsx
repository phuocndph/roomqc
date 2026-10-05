import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Plus, BarChart3, Mail, TrendingUp, Users } from 'lucide-react';
import { CampaignsTable } from './CampaignsTable';
import { EmailTemplateLibrary } from './EmailTemplateLibrary';
import { ABTestingManager } from './ABTestingManager';
import { CampaignAnalytics } from './CampaignAnalytics';
import { useMarketingCampaigns } from '@/hooks/super-admin/useMarketingCampaigns';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../shared/PageHeader';
import { StatCard } from '../shared/StatCard';

export function AdvancedCampaignManagement() {
  const navigate = useNavigate();
  const { data: campaigns = [] } = useMarketingCampaigns();

  const handleSelectTemplate = (template: { name: string; subject: string }) => {
    navigate('/super-admin/campaigns/new', {
      state: {
        prefill: {
          name: `Campaign: ${template.name}`,
          email_subject: template.subject,
        },
      },
    });
  };

  // Calculate stats
  const stats = {
    total: campaigns.length,
    active: campaigns.filter((c: any) => c.status === 'active').length,
    totalSent: campaigns.reduce((sum: number, c: any) => sum + (c.sent_count || 0), 0),
    avgOpenRate: campaigns.length > 0
      ? (campaigns.reduce((sum: number, c: any) => {
          const sent = c.sent_count || 0;
          const opened = c.opened_count || 0;
          return sum + (sent > 0 ? (opened / sent) * 100 : 0);
        }, 0) / campaigns.length).toFixed(1)
      : '0',
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title="Chiến dịch Marketing"
        description="Tạo, quản lý và theo dõi các chiến dịch email"
        actions={
          <Button size="sm" onClick={() => navigate('/super-admin/campaigns/new')}>
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Tạo chiến dịch mới
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard
          title="Tổng chiến dịch"
          value={stats.total}
          icon={Mail}
          description={`${stats.active} đang hoạt động`}
        />
        <StatCard
          title="Tổng đã gửi"
          value={stats.totalSent}
          icon={Users}
          description="Email đã gửi thành công"
        />
        <StatCard
          title="Tỷ lệ mở TB"
          value={`${stats.avgOpenRate}%`}
          icon={TrendingUp}
          description="Trên tất cả chiến dịch"
        />
        <StatCard
          title="Hiệu suất"
          value={parseFloat(stats.avgOpenRate) > 20 ? 'Tốt' : 'Trung bình'}
          icon={BarChart3}
          description={parseFloat(stats.avgOpenRate) > 20 ? 'Trên mức trung bình' : 'Cần cải thiện'}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="campaigns" className="space-y-4">
        <TabsList>
          <TabsTrigger value="campaigns">Tất cả chiến dịch</TabsTrigger>
          <TabsTrigger value="templates">Mẫu email</TabsTrigger>
          <TabsTrigger value="ab-testing">A/B Testing</TabsTrigger>
          <TabsTrigger value="analytics">Phân tích</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns">
          <CampaignsTable />
        </TabsContent>

        <TabsContent value="templates">
          <EmailTemplateLibrary onSelectTemplate={handleSelectTemplate} />
        </TabsContent>

        <TabsContent value="ab-testing">
          <ABTestingManager />
        </TabsContent>

        <TabsContent value="analytics">
          <CampaignAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
