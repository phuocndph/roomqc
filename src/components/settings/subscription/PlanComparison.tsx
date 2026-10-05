import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useTenantSubscription } from '@/hooks/useSubscription';
import { Check, Package, Calculator, Sparkles, Calendar, Building2, RefreshCw, Plus, CheckCircle2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { PlanChangeDialog } from './PlanChangeDialog';
import { AddRoomsDialog } from './AddRoomsDialog';
import {
  PRICE_PER_ROOM_DAILY,
  MIN_SUBSCRIPTION_DAYS,
  DURATION_OPTIONS,
  calculateSubscriptionPrice,
  formatVNCurrency,
} from '@/lib/pricing';
import { format, differenceInDays } from 'date-fns';
import { vi } from 'date-fns/locale';

const UNLIMITED_FEATURES = [
  'Không giới hạn khách sạn',
  'Không giới hạn người dùng',
  'Không giới hạn phòng',
  'Không giới hạn sản phẩm',
  'Không giới hạn lưu trữ',
  'Đầy đủ báo cáo',
  'Hỗ trợ 24/7',
];

interface ActiveSubscriptionCardProps {
  subscription: {
    registered_rooms: number;
    subscription_end_date: string;
    subscription_status: string;
  };
  onExtend: () => void;
  onAddRooms: () => void;
}

function ActiveSubscriptionCard({ subscription, onExtend, onAddRooms }: ActiveSubscriptionCardProps) {
  const endDate = new Date(subscription.subscription_end_date);
  const remainingDays = differenceInDays(endDate, new Date());

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto p-3 rounded-full bg-green-100 dark:bg-green-900/30 mb-3">
          <CheckCircle2 className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
        <CardTitle className="text-2xl">Bạn đã đăng ký gói dịch vụ</CardTitle>
        <CardDescription>Gói Tiêu Chuẩn - Đầy đủ tính năng</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Subscription Info */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-muted/50 text-center">
            <Building2 className="h-5 w-5 mx-auto mb-2 text-primary" />
            <div className="text-2xl font-bold text-primary">{subscription.registered_rooms}</div>
            <div className="text-sm text-muted-foreground">Số phòng đăng ký</div>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 text-center">
            <Calendar className="h-5 w-5 mx-auto mb-2 text-primary" />
            <div className="text-lg font-bold">{format(endDate, 'dd/MM/yyyy', { locale: vi })}</div>
            <div className="text-sm text-muted-foreground">Ngày hết hạn</div>
          </div>
          <div className="p-4 rounded-lg bg-muted/50 text-center">
            <div className={`text-2xl font-bold ${remainingDays <= 30 ? 'text-orange-500' : 'text-green-600'}`}>
              {remainingDays}
            </div>
            <div className="text-sm text-muted-foreground">Ngày còn lại</div>
            {remainingDays <= 30 && (
              <Badge variant="outline" className="mt-1 text-orange-500 border-orange-500">
                Sắp hết hạn
              </Badge>
            )}
          </div>
        </div>

        {/* Status Badge */}
        <div className="flex justify-center">
          <Badge variant="default" className="bg-green-600 text-white px-4 py-1">
            <Check className="h-3 w-3 mr-1" />
            Đang hoạt động
          </Badge>
        </div>

        {/* Action Buttons */}
        <div className="border-t pt-6">
          <p className="text-center text-muted-foreground mb-4">
            Bạn muốn gia hạn gói dịch vụ hay mua thêm phòng?
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button 
              variant="outline" 
              size="lg" 
              className="w-full"
              onClick={onExtend}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Gia hạn gói
            </Button>
            <Button 
              size="lg" 
              className="w-full"
              onClick={onAddRooms}
            >
              <Plus className="h-4 w-4 mr-2" />
              Mua thêm phòng
            </Button>
          </div>
        </div>

        {/* Features reminder */}
        <div className="border-t pt-4">
          <div className="flex items-center gap-2 text-sm font-medium mb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Tính năng đang sử dụng</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {UNLIMITED_FEATURES.slice(0, 4).map((feature, index) => (
              <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SubscriptionForm({ 
  onOpenDialog 
}: { 
  onOpenDialog: (rooms: number, duration: number) => void;
}) {
  const { data: currentSubscription } = useTenantSubscription();
  const [rooms, setRooms] = useState(50);
  const [selectedDuration, setSelectedDuration] = useState(365);

  const pricing = useMemo(
    () => calculateSubscriptionPrice(rooms, selectedDuration),
    [rooms, selectedDuration]
  );

  const currentRooms = currentSubscription?.registered_rooms || 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Pricing Card */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Package className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-2xl">Gói Tiêu Chuẩn</CardTitle>
              <CardDescription>Đầy đủ tính năng, không giới hạn</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Price Info */}
          <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold text-primary">
                {formatVNCurrency(PRICE_PER_ROOM_DAILY)}
              </span>
              <span className="text-muted-foreground">/phòng/ngày</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Đăng ký tối thiểu: {MIN_SUBSCRIPTION_DAYS} ngày
            </p>
          </div>

          {/* Room Input */}
          <div className="space-y-2">
            <Label htmlFor="rooms">Số phòng đăng ký</Label>
            <div className="flex items-center gap-2">
              <Input
                id="rooms"
                type="number"
                min={1}
                value={rooms}
                onChange={(e) => setRooms(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-32"
              />
              <span className="text-muted-foreground">phòng</span>
              {currentRooms > 0 && (
                <Badge variant="outline" className="ml-auto">
                  Hiện tại: {currentRooms} phòng
                </Badge>
              )}
            </div>
          </div>

          {/* Duration Selection */}
          <div className="space-y-3">
            <Label>Chọn thời hạn đăng ký</Label>
            <RadioGroup
              value={selectedDuration.toString()}
              onValueChange={(v) => setSelectedDuration(parseInt(v))}
              className="grid grid-cols-2 gap-3"
            >
              {DURATION_OPTIONS.map((option) => (
                <div key={option.days} className="relative">
                  <RadioGroupItem
                    value={option.days.toString()}
                    id={`duration-${option.days}`}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`duration-${option.days}`}
                    className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-colors"
                  >
                    <span className="font-semibold">{option.label}</span>
                    {option.discount > 0 && (
                      <Badge variant="secondary" className="mt-1">
                        Giảm {option.discount}%
                      </Badge>
                    )}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Features */}
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Tính năng không giới hạn</span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {UNLIMITED_FEATURES.map((feature, index) => (
                <div key={index} className="flex items-center gap-2 text-sm">
                  <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                  <span>{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Price Calculator */}
      <Card className="lg:col-span-1">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-secondary">
              <Calculator className="h-6 w-6" />
            </div>
            <div>
              <CardTitle>Chi tiết thanh toán</CardTitle>
              <CardDescription>Ước tính chi phí đăng ký</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Calculation Breakdown */}
          <div className="space-y-3 p-4 rounded-lg bg-muted/50">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Giá gốc</span>
              <span>
                {rooms} × {formatVNCurrency(PRICE_PER_ROOM_DAILY)} × {pricing.days} ngày
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Tổng giá gốc</span>
              <span>{formatVNCurrency(pricing.basePrice)}</span>
            </div>
            {pricing.discountPercent > 0 && (
              <div className="flex justify-between text-sm text-green-600">
                <span>Giảm giá ({pricing.discountPercent}%)</span>
                <span>- {formatVNCurrency(pricing.discount)}</span>
              </div>
            )}
            <div className="border-t pt-3">
              <div className="flex justify-between font-semibold text-lg">
                <span>Tổng thanh toán</span>
                <span className="text-primary">{formatVNCurrency(pricing.finalPrice)}</span>
              </div>
            </div>
          </div>

          {/* Monthly Equivalent */}
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <div className="text-sm text-muted-foreground">Tương đương</div>
            <div className="font-semibold text-primary">
              ≈ {formatVNCurrency(pricing.pricePerMonth)}/tháng
            </div>
          </div>

          {/* Quick Reference Table */}
          <div className="space-y-2">
            <div className="text-sm font-medium">Bảng giá tham khảo</div>
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Phòng</th>
                    <th className="px-3 py-2 text-right font-medium">1 tháng</th>
                    <th className="px-3 py-2 text-right font-medium">1 năm</th>
                  </tr>
                </thead>
                <tbody>
                  {[20, 50, 100, 200].map((r) => {
                    const monthly = calculateSubscriptionPrice(r, 30);
                    const yearly = calculateSubscriptionPrice(r, 365);
                    return (
                      <tr key={r} className="border-t">
                        <td className="px-3 py-2">{r} phòng</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">
                          {formatVNCurrency(monthly.finalPrice)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {formatVNCurrency(yearly.finalPrice)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* CTA Button */}
          <Button 
            className="w-full mt-4" 
            size="lg" 
            onClick={() => onOpenDialog(rooms, selectedDuration)}
          >
            Đăng ký ngay
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function PlanComparison() {
  const { data: currentSubscription, isLoading } = useTenantSubscription();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [addRoomsDialogOpen, setAddRoomsDialogOpen] = useState(false);
  const [dialogParams, setDialogParams] = useState({ rooms: 50, duration: 365 });

  if (isLoading) {
    return <Skeleton className="h-[600px] w-full" />;
  }

  // Check if user is subscribed
  const isSubscribed = 
    currentSubscription?.subscription_status === 'active' &&
    currentSubscription?.subscription_end_date &&
    new Date(currentSubscription.subscription_end_date) > new Date() &&
    (currentSubscription?.registered_rooms || 0) > 0;

  const handleOpenDialog = (rooms: number, duration: number) => {
    setDialogParams({ rooms, duration });
    setDialogOpen(true);
  };

  if (isSubscribed && currentSubscription) {
    return (
      <>
        <ActiveSubscriptionCard
          subscription={{
            registered_rooms: currentSubscription.registered_rooms || 0,
            subscription_end_date: currentSubscription.subscription_end_date!,
            subscription_status: currentSubscription.subscription_status || 'active',
          }}
          onExtend={() => setDialogOpen(true)}
          onAddRooms={() => setAddRoomsDialogOpen(true)}
        />

        <PlanChangeDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          initialRooms={currentSubscription.registered_rooms || 50}
          initialDuration={365}
        />

        <AddRoomsDialog
          open={addRoomsDialogOpen}
          onOpenChange={setAddRoomsDialogOpen}
        />
      </>
    );
  }

  return (
    <>
      <SubscriptionForm onOpenDialog={handleOpenDialog} />

      <PlanChangeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialRooms={dialogParams.rooms}
        initialDuration={dialogParams.duration}
      />
    </>
  );
}
