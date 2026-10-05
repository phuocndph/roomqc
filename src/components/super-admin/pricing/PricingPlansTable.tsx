import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Calculator, 
  Building2, 
  Calendar, 
  DollarSign, 
  Check,
  Infinity as InfinityIcon,
  Edit2,
  Save
} from 'lucide-react';
import { usePlansWithTenantCounts, useUpdatePlan } from '@/hooks/super-admin/usePricingManagement';
import { toast } from 'sonner';
import { PageHeader } from '../shared/PageHeader';

const DURATION_OPTIONS = [
  { months: 1, days: 30, label: '1 tháng', discount: 0 },
  { months: 3, days: 90, label: '3 tháng', discount: 5 },
  { months: 6, days: 180, label: '6 tháng', discount: 10 },
  { months: 12, days: 365, label: '1 năm', discount: 15 },
];

const UNLIMITED_FEATURES = [
  'Không giới hạn số khách sạn',
  'Không giới hạn người dùng',
  'Không giới hạn dung lượng',
  'Báo cáo nâng cao',
  'Truy cập API',
  'Hỗ trợ ưu tiên 24/7',
  'Thương hiệu riêng',
  'Nhật ký hoạt động',
];

export function PricingPlansTable() {
  const { data: plans = [], isLoading } = usePlansWithTenantCounts();
  const updatePlan = useUpdatePlan();
  
  // Get the single active plan
  const activePlan = plans.find((p: any) => p.is_active) || plans[0];
  const pricePerRoomDaily = (activePlan as any)?.price_per_room_daily || 1000;

  const [rooms, setRooms] = useState(50);
  const [selectedDuration, setSelectedDuration] = useState(DURATION_OPTIONS[0]);
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [newPrice, setNewPrice] = useState(pricePerRoomDaily);

  const calculatePrice = (days: number, discount: number) => {
    const basePrice = rooms * pricePerRoomDaily * days;
    return Math.round(basePrice * (1 - discount / 100));
  };

  const handleSavePrice = async () => {
    if (!activePlan) return;
    
    try {
      await updatePlan.mutateAsync({
        id: activePlan.id,
        updates: {
          price_per_room_daily: newPrice,
          // Update monthly/yearly for compatibility
          price_monthly: 50 * newPrice * 30,
          price_yearly: 50 * newPrice * 365 * 0.85,
        }
      });
      setIsEditingPrice(false);
      toast.success('Đã cập nhật giá');
    } catch (error) {
      toast.error('Lỗi cập nhật giá');
    }
  };

  if (isLoading) {
    return <div className="text-center py-8 text-sm text-muted-foreground">Đang tải...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Pricing Model Header */}
      <div className="p-4 border rounded-lg bg-primary/5">
        <div className="flex items-center gap-2 mb-2">
          <DollarSign className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">Mô hình giá đơn giản</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Một gói duy nhất - Đầy đủ tính năng - Giá theo số phòng và thời gian
        </p>
        
        <div className="flex items-center gap-3 p-3 rounded-md bg-background">
          <Building2 className="h-8 w-8 text-primary" />
          <div>
            {isEditingPrice ? (
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0}
                  value={newPrice}
                  onChange={(e) => setNewPrice(Number(e.target.value))}
                  className="w-28 h-8 text-lg font-bold"
                />
                <span className="text-sm text-muted-foreground">đ/phòng/ngày</span>
                <Button size="sm" className="h-7" onClick={handleSavePrice} disabled={updatePlan.isPending}>
                  <Save className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => setIsEditingPrice(false)}>
                  Hủy
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-primary">
                  {pricePerRoomDaily.toLocaleString('vi-VN')}đ
                </span>
                <span className="text-sm text-muted-foreground">/phòng/ngày</span>
                <Button size="sm" variant="ghost" className="h-7" onClick={() => {
                  setNewPrice(pricePerRoomDaily);
                  setIsEditingPrice(true);
                }}>
                  <Edit2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Unlimited Features */}
      <div className="p-4 border rounded-lg">
        <div className="flex items-center gap-2 mb-3">
          <InfinityIcon className="h-4 w-4 text-green-600" />
          <h3 className="text-sm font-medium">Tính năng không giới hạn</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {UNLIMITED_FEATURES.map((feature) => (
            <div key={feature} className="flex items-center gap-2 text-xs">
              <Check className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
              <span>{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Price Calculator */}
      <div className="p-4 border rounded-lg">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="h-4 w-4" />
          <h3 className="text-sm font-medium">Tính giá đăng ký</h3>
        </div>
        
        <div className="space-y-4">
          {/* Room Input */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2 text-xs">
              <Building2 className="h-3.5 w-3.5" />
              Số phòng của bạn
            </Label>
            <Input
              type="number"
              min={1}
              value={rooms}
              onChange={(e) => setRooms(Math.max(1, parseInt(e.target.value) || 1))}
              className="text-sm font-medium max-w-[200px] h-8"
            />
          </div>

          {/* Duration Options */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-xs">
              <Calendar className="h-3.5 w-3.5" />
              Chọn thời gian đăng ký
            </Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {DURATION_OPTIONS.map((option) => {
                const price = calculatePrice(option.days, option.discount);
                const isSelected = selectedDuration.months === option.months;
                
                return (
                  <div
                    key={option.months}
                    className={`cursor-pointer p-3 border rounded-lg transition-all ${
                      isSelected 
                        ? 'ring-2 ring-primary border-primary bg-primary/5' 
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedDuration(option)}
                  >
                    <div className="text-sm font-medium text-center">{option.label}</div>
                    {option.discount > 0 && (
                      <div className="text-center mt-1">
                        <span className="text-xs font-medium text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                          Giảm {option.discount}%
                        </span>
                      </div>
                    )}
                    <div className="mt-2 text-lg font-bold text-primary text-center">
                      {price.toLocaleString('vi-VN')}đ
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 text-center">
                      {rooms} phòng × {option.days} ngày
                    </div>
                    {option.discount > 0 && (
                      <div className="text-xs text-muted-foreground line-through text-center">
                        {calculatePrice(option.days, 0).toLocaleString('vi-VN')}đ
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Summary */}
          <div className="p-3 rounded-md bg-primary/5 border border-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Tổng thanh toán cho {selectedDuration.label}</div>
                <div className="text-2xl font-bold text-primary">
                  {calculatePrice(selectedDuration.days, selectedDuration.discount).toLocaleString('vi-VN')}đ
                </div>
                <div className="text-xs text-muted-foreground">
                  {rooms} phòng × {pricePerRoomDaily.toLocaleString()}đ × {selectedDuration.days} ngày
                  {selectedDuration.discount > 0 && ` - ${selectedDuration.discount}% giảm giá`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Trung bình/tháng</div>
                <div className="text-lg font-semibold">
                  {Math.round(calculatePrice(selectedDuration.days, selectedDuration.discount) / selectedDuration.months).toLocaleString('vi-VN')}đ
                </div>
              </div>
            </div>
          </div>

          {/* Quick Reference Table */}
          <div>
            <Label className="mb-2 block text-xs">Bảng giá tham khảo theo số phòng</Label>
            <div className="rounded-md border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left font-medium">Số phòng</th>
                    {DURATION_OPTIONS.map((opt) => (
                      <th key={opt.months} className="p-2 text-right font-medium">
                        {opt.label}
                        {opt.discount > 0 && (
                          <span className="text-green-600 ml-1">(-{opt.discount}%)</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[10, 20, 30, 50, 100, 200].map((r) => (
                    <tr key={r} className={`border-t ${r === rooms ? 'bg-primary/5' : ''}`}>
                      <td className="p-2 font-medium">{r} phòng</td>
                      {DURATION_OPTIONS.map((opt) => {
                        const price = Math.round(r * pricePerRoomDaily * opt.days * (1 - opt.discount / 100));
                        return (
                          <td key={opt.months} className="p-2 text-right">
                            {price.toLocaleString('vi-VN')}đ
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Active Tenants */}
      {activePlan && (
        <div className="p-4 border rounded-lg">
          <h3 className="text-sm font-medium mb-3">Thống kê</h3>
          <div className="p-3 rounded-md bg-muted/50 inline-block">
            <div className="text-2xl font-bold">{(activePlan as any).activeTenantCount || 0}</div>
            <div className="text-xs text-muted-foreground">Khách hàng đang sử dụng</div>
          </div>
        </div>
      )}
    </div>
  );
}
