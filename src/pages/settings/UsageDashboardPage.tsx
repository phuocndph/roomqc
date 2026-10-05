import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { UsageOverview } from "@/components/settings/usage/UsageOverview";
import { UsageProgressBars } from "@/components/settings/usage/UsageProgressBars";
import { UsageTrendCharts } from "@/components/settings/usage/UsageTrendCharts";
import { UpgradePrompt } from "@/components/settings/usage/UpgradePrompt";
import { BarChart3 } from "lucide-react";

export default function UsageDashboardPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Mức sử dụng tài nguyên"
        description="Theo dõi và quản lý mức sử dụng tài nguyên của bạn"
      />

      {/* Upgrade Prompt - Shows when near limits */}
      <UpgradePrompt />

      {/* Usage Overview Cards */}
      <UsageOverview />

      {/* Progress Bars for each resource */}
      <UsageProgressBars />

      {/* Historical Trend Charts */}
      <UsageTrendCharts />
    </div>
  );
}
