import { CampaignBuilder } from '@/components/super-admin/campaigns/CampaignBuilder';
import { PageHeader } from '@/components/super-admin/shared/PageHeader';

export function NewCampaignPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Tạo chiến dịch mới"
        description="Soạn nội dung và cấu hình chiến dịch email"
      />
      <CampaignBuilder />
    </div>
  );
}

export default NewCampaignPage;
