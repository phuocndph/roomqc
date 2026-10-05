import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useTenantUsage } from "@/hooks/useTenantUsage";
import { useTenantSubscription } from "@/hooks/useSubscription";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, AlertTriangle } from "lucide-react";

export function UsageProgressBars() {
  const { data: usage } = useTenantUsage();
  const { data: subscription } = useTenantSubscription();

  if (!usage || !subscription) {
    return null;
  }

  const calculatePercentage = (current: number, limit: number | null) => {
    if (limit === null || limit === 0) return 0;
    return Math.round((current / limit) * 100);
  };

  const getStatusBadge = (percentage: number) => {
    if (percentage >= 90) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Gần đầy
        </Badge>
      );
    }
    if (percentage >= 75) {
      return (
        <Badge variant="secondary" className="gap-1 bg-yellow-500 text-white">
          <AlertTriangle className="h-3 w-3" />
          Cảnh báo
        </Badge>
      );
    }
    return (
      <Badge variant="default" className="gap-1 bg-green-500">
        <CheckCircle2 className="h-3 w-3" />
        Bình thường
      </Badge>
    );
  };

  const resources = [
    {
      name: "Khách sạn",
      current: usage.current_hotels_count || 0,
      limit: subscription.subscription_plan?.max_hotels,
      peak: usage.peak_hotels_count || 0,
    },
    {
      name: "Người dùng",
      current: usage.current_users_count || 0,
      limit: subscription.subscription_plan?.max_users,
      peak: usage.peak_users_count || 0,
    },
    {
      name: "Phòng",
      current: usage.current_rooms_count || 0,
      limit: null,
      peak: 0,
    },
    {
      name: "Sản phẩm",
      current: usage.current_items_count || 0,
      limit: null,
      peak: 0,
    },
    {
      name: "Lưu trữ",
      current: Number((usage.current_storage_bytes / (1024 ** 3)).toFixed(2)),
      limit: subscription.subscription_plan?.max_storage_gb,
      peak: Number(((usage.peak_storage_bytes || 0) / (1024 ** 3)).toFixed(2)),
      unit: "GB",
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chi tiết sử dụng</CardTitle>
        <CardDescription>
          Theo dõi mức sử dụng chi tiết cho từng loại tài nguyên
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {resources.map((resource) => {
          const percentage = calculatePercentage(resource.current, resource.limit);
          const hasLimit = resource.limit !== null && resource.limit !== undefined;

          return (
            <div key={resource.name} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{resource.name}</span>
                    {hasLimit && getStatusBadge(percentage)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {resource.current}
                    {resource.unit && ` ${resource.unit}`}
                    {hasLimit && (
                      <>
                        {" / "}
                        {resource.limit}
                        {resource.unit && ` ${resource.unit}`}
                      </>
                    )}
                    {!hasLimit && " (Không giới hạn)"}
                  </div>
                </div>
                <div className="text-right">
                  {hasLimit && (
                    <div className="text-2xl font-bold">{percentage}%</div>
                  )}
                  {resource.peak > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Đỉnh: {resource.peak}
                      {resource.unit && ` ${resource.unit}`}
                    </div>
                  )}
                </div>
              </div>
              {hasLimit ? (
                <Progress value={percentage} className="h-2" />
              ) : (
                <Progress value={0} className="h-2 opacity-30" />
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
