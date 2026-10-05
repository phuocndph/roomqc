import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Calculator, Building2, Calendar, DollarSign } from 'lucide-react';

interface RoomPriceCalculatorProps {
  pricePerRoomDaily: number;
  minDays: number;
}

export function RoomPriceCalculator({ pricePerRoomDaily, minDays }: RoomPriceCalculatorProps) {
  const [rooms, setRooms] = useState(50);
  const [days, setDays] = useState(minDays);

  const effectiveDays = Math.max(days, minDays);
  const totalPrice = rooms * pricePerRoomDaily * effectiveDays;
  const pricePerMonth = (rooms * pricePerRoomDaily * 30);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Tính giá ước tính
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Rooms Input */}
          <div className="space-y-2">
            <Label htmlFor="rooms" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Số phòng
            </Label>
            <Input
              id="rooms"
              type="number"
              min={1}
              value={rooms}
              onChange={(e) => setRooms(Math.max(1, parseInt(e.target.value) || 1))}
              className="text-lg font-medium"
            />
          </div>

          {/* Days Input */}
          <div className="space-y-2">
            <Label htmlFor="days" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Số ngày đăng ký
            </Label>
            <Input
              id="days"
              type="number"
              min={minDays}
              value={days}
              onChange={(e) => setDays(Math.max(minDays, parseInt(e.target.value) || minDays))}
              className="text-lg font-medium"
            />
            {days < minDays && (
              <p className="text-xs text-orange-600">Tối thiểu {minDays} ngày</p>
            )}
          </div>

          {/* Price Per Month */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-muted-foreground">
              Giá/tháng (ước tính)
            </Label>
            <div className="p-3 rounded-lg bg-muted">
              <div className="text-lg font-bold">
                {pricePerMonth.toLocaleString('vi-VN')}đ
              </div>
              <div className="text-xs text-muted-foreground">
                {rooms} × {pricePerRoomDaily.toLocaleString()}đ × 30 ngày
              </div>
            </div>
          </div>

          {/* Total Price */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              Tổng tiền thanh toán
            </Label>
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="text-2xl font-bold text-primary">
                {totalPrice.toLocaleString('vi-VN')}đ
              </div>
              <div className="text-xs text-muted-foreground">
                {rooms} phòng × {pricePerRoomDaily.toLocaleString()}đ × {effectiveDays} ngày
              </div>
            </div>
          </div>
        </div>

        {/* Quick reference table */}
        <div className="mt-4 pt-4 border-t">
          <p className="text-sm text-muted-foreground mb-2">Bảng giá tham khảo (30 ngày):</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 text-sm">
            {[10, 20, 30, 50, 100, 200].map((r) => (
              <div 
                key={r} 
                className={`p-2 rounded text-center ${r === rooms ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
              >
                <div className="font-medium">{r} phòng</div>
                <div className="text-xs opacity-80">
                  {(r * pricePerRoomDaily * 30).toLocaleString('vi-VN')}đ
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}