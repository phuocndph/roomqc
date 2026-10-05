import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useTenantUsage } from "@/hooks/useTenantUsage";
import { useTenantSubscription } from "@/hooks/useSubscription";
import { AlertTriangle, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function UpgradePrompt() {
  const { data: usage } = useTenantUsage();
  const { data: subscription } = useTenantSubscription();
  const navigate = useNavigate();

  if (!usage || !subscription) {
    return null;
  }

  const checkResourceWarning = () => {
    const warnings: string[] = [];

    // Check hotels
    if (subscription.subscription_plan?.max_hotels) {
      const hotelPercentage = ((usage.current_hotels_count || 0) / subscription.subscription_plan.max_hotels) * 100;
      if (hotelPercentage >= 90) {
        warnings.push(`Khách sạn (${hotelPercentage.toFixed(0)}%)`);
      }
    }

    // Check users
    if (subscription.subscription_plan?.max_users) {
      const userPercentage = ((usage.current_users_count || 0) / subscription.subscription_plan.max_users) * 100;
      if (userPercentage >= 90) {
        warnings.push(`Người dùng (${userPercentage.toFixed(0)}%)`);
      }
    }

    // Check storage
    if (subscription.subscription_plan?.max_storage_gb) {
      const storageGB = usage.current_storage_bytes / (1024 ** 3);
      const storagePercentage = (storageGB / subscription.subscription_plan.max_storage_gb) * 100;
      if (storagePercentage >= 90) {
        warnings.push(`Lưu trữ (${storagePercentage.toFixed(0)}%)`);
      }
    }

    return warnings;
  };

  const warnings = checkResourceWarning();

  if (warnings.length === 0) {
    return null;
  }

  return (
    <Alert variant="destructive" className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
      <AlertTitle className="text-yellow-800 dark:text-yellow-300">
        Cảnh báo: Sắp đạt giới hạn
      </AlertTitle>
      <AlertDescription className="text-yellow-700 dark:text-yellow-400">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="mb-2">
              Các tài nguyên sau đang gần đạt giới hạn:
            </p>
            <ul className="list-disc list-inside space-y-1">
              {warnings.map((warning, index) => (
                <li key={index}>{warning}</li>
              ))}
            </ul>
            <p className="mt-2">
              Nâng cấp gói để tiếp tục sử dụng các tính năng mà không bị gián đoạn.
            </p>
          </div>
          <Button
            onClick={() => navigate("/settings/subscription")}
            className="bg-yellow-600 hover:bg-yellow-700 text-white gap-2 whitespace-nowrap"
          >
            <Sparkles className="h-4 w-4" />
            Nâng cấp ngay
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
