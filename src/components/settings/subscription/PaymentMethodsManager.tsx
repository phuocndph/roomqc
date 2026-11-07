import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, CreditCard } from "lucide-react";

/**
 * How RoomQC subscription fees are paid. The platform account is shown per
 * order (with its own amount and transfer reference) on the payment page, so
 * this tab explains the steps instead of showing an account up front.
 */
export function PaymentMethodsManager() {
  const navigate = useNavigate();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle>Chuyển khoản ngân hàng (VietQR)</CardTitle>
              <CardDescription>Gói được kích hoạt tự động khi RoomQC nhận đủ tiền</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Vào tab <strong>Gói dịch vụ</strong>, chọn số phòng và thời hạn, bấm <strong>Xem báo giá</strong>.</li>
            <li>Bấm <strong>Tạo đơn thanh toán</strong> rồi <strong>Thanh toán ngay</strong>.</li>
            <li>Quét mã QR bằng ứng dụng ngân hàng. Giữ nguyên số tiền và nội dung chuyển khoản.</li>
            <li>Gói được kích hoạt trong vài phút; tài khoản đang chỉ đọc sẽ mở lại đầy đủ chức năng.</li>
          </ol>
          <p className="text-sm text-muted-foreground">
            Đơn chưa thanh toán nằm trong tab <strong>Đang chờ</strong>; bạn có thể mở lại mã QR hoặc hủy đơn ở đó.
          </p>
          <Button onClick={() => navigate('/settings/subscription?tab=plans')}>Gia hạn ngay</Button>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <CreditCard className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-muted-foreground">Phương thức khác</CardTitle>
                <CardDescription>Thẻ tín dụng, Ví điện tử</CardDescription>
              </div>
            </div>
            <Badge variant="secondary">Sắp ra mắt</Badge>
          </div>
        </CardHeader>
      </Card>
    </div>
  );
}
