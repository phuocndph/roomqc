import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenantUsage } from "@/hooks/useTenantUsage";
import { useTenantSubscription } from "@/hooks/useSubscription";
import { Building2, Users, DoorOpen, Package, HardDrive } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export function UsageOverview() {
  const { data: usage, isLoading: loadingUsage } = useTenantUsage();
  const { data: subscription, isLoading: loadingSubscription } = useTenantSubscription();

  if (loadingUsage || loadingSubscription) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (!usage || !subscription) {
    return null;
  }

  const calculatePercentage = (current: number, limit: number | null) => {
    if (limit === null || limit === 0) return 0;
    return Math.round((current / limit) * 100);
  };

  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return "text-red-500";
    if (percentage >= 75) return "text-yellow-500";
    return "text-green-500";
  };

  const resources = [
    {
      title: "Khách sạn",
      icon: Building2,
      current: usage.current_hotels_count || 0,
      limit: subscription.subscription_plan?.max_hotels,
      percentage: calculatePercentage(
        usage.current_hotels_count || 0,
        subscription.subscription_plan?.max_hotels || null
      ),
    },
    {
      title: "Người dùng",
      icon: Users,
      current: usage.current_users_count || 0,
      limit: subscription.subscription_plan?.max_users,
      percentage: calculatePercentage(
        usage.current_users_count || 0,
        subscription.subscription_plan?.max_users || null
      ),
    },
    {
      title: "Phòng",
      icon: DoorOpen,
      current: usage.current_rooms_count || 0,
      limit: null, // Không giới hạn theo schema hiện tại
      percentage: 0,
    },
    {
      title: "Sản phẩm",
      icon: Package,
      current: usage.current_items_count || 0,
      limit: null, // Không giới hạn theo schema hiện tại
      percentage: 0,
    },
    {
      title: "Lưu trữ",
      icon: HardDrive,
      current: Number((usage.current_storage_bytes / (1024 ** 3)).toFixed(2)),
      limit: subscription.subscription_plan?.max_storage_gb,
      percentage: calculatePercentage(
        usage.current_storage_bytes / (1024 ** 3),
        subscription.subscription_plan?.max_storage_gb || null
      ),
      unit: "GB",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      {resources.map((resource) => {
        const Icon = resource.icon;
        const statusColor = getStatusColor(resource.percentage);

        return (
          <Card key={resource.title}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-muted-foreground" />
                {resource.percentage > 0 && (
                  <span className={`text-xs font-medium ${statusColor}`}>
                    {resource.percentage}%
                  </span>
                )}
              </div>
              <CardTitle className="text-sm font-medium">
                {resource.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {resource.current}
                {resource.unit && ` ${resource.unit}`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {resource.limit !== null && resource.limit !== undefined
                  ? `của ${resource.limit}${resource.unit ? ` ${resource.unit}` : ""}`
                  : "Không giới hạn"}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
