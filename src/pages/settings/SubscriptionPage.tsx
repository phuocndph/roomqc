import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubscriptionOverview } from "@/components/settings/subscription/SubscriptionOverview";
import { PlanComparison } from "@/components/settings/subscription/PlanComparison";
import { BillingHistory } from "@/components/settings/subscription/BillingHistory";
import { PaymentMethodsManager } from "@/components/settings/subscription/PaymentMethodsManager";
import { PendingPayments } from "@/components/settings/subscription/PendingPayments";
import { PageHeader } from "@/components/shared/PageHeader";
import { CreditCard, History, Package, Wallet, Clock } from "lucide-react";
import { usePendingPaymentsCount } from "@/hooks/usePendingPayments";
import { Badge } from "@/components/ui/badge";

const VALID_TABS = ["overview", "plans", "pending", "payment", "history"];

export default function SubscriptionPage() {
  const { data: pendingCount = 0 } = usePendingPaymentsCount();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab");
  const activeTab = VALID_TABS.includes(tabFromUrl || "") ? tabFromUrl! : "overview";

  const handleTabChange = (value: string) => {
    setSearchParams(value === "overview" ? {} : { tab: value }, { replace: true });
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Quản lý Đăng ký"
        description="Quản lý gói đăng ký, thanh toán và lịch sử giao dịch"
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Tổng quan
          </TabsTrigger>
          <TabsTrigger value="plans" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            Gói dịch vụ
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Đang chờ
            {pendingCount > 0 && (
              <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1">
                {pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="payment" className="flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Thanh toán
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            Lịch sử
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <SubscriptionOverview />
        </TabsContent>

        <TabsContent value="plans" className="space-y-6" id="plan-comparison">
          <PlanComparison />
        </TabsContent>

        <TabsContent value="pending" className="space-y-6">
          <PendingPayments />
        </TabsContent>

        <TabsContent value="payment" className="space-y-6">
          <PaymentMethodsManager />
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <BillingHistory />
        </TabsContent>
      </Tabs>
    </div>
  );
}
