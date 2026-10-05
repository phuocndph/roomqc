import { VendorStats } from '@/types/vendor.types';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, Users, Star, ShoppingCart } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface StatsCardsProps {
  stats?: VendorStats;
}

export function StatsCards({ stats }: StatsCardsProps) {
  if (!stats) return null;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Tổng NCC</p>
              <p className="text-2xl font-bold">{stats.total_vendors}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {stats.active_vendors} hoạt động
              </p>
            </div>
            <Users className="w-8 h-8 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Đánh giá TB</p>
              <div className="flex items-center gap-1 mt-1">
                <Star className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                <p className="text-2xl font-bold">{stats.average_rating.toFixed(1)}</p>
              </div>
              <p className="text-xs text-muted-foreground mt-1">/5.0</p>
            </div>
            <Star className="w-8 h-8 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Đơn hàng (30d)</p>
              <p className="text-2xl font-bold">{stats.total_orders_30d}</p>
              <p className="text-xs text-muted-foreground mt-1">
                +{stats.new_this_month} NCC mới
              </p>
            </div>
            <ShoppingCart className="w-8 h-8 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Giá trị (30d)</p>
              <p className="text-2xl font-bold">
                {formatCurrency(stats.total_value_30d)}
              </p>
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                +12% vs tháng trước
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
