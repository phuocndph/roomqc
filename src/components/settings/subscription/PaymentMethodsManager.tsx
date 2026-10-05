import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Building2, 
  CreditCard, 
  Copy, 
  Check, 
  QrCode,
  Info,
  ExternalLink
} from "lucide-react";
import { useBankPaymentSettings } from "@/hooks/useBankPaymentSettings";
import { useState } from "react";
import { toast } from "sonner";

export function PaymentMethodsManager() {
  const { data: bankSettings, isLoading } = useBankPaymentSettings();
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success('Đã sao chép');
    setTimeout(() => setCopiedField(null), 2000);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-[200px] w-full" />
        <Skeleton className="h-[100px] w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Bank Transfer Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <CardTitle>Chuyển khoản ngân hàng</CardTitle>
                <CardDescription>
                  Thanh toán qua VietQR - Tự động xác nhận
                </CardDescription>
              </div>
            </div>
            {bankSettings && (
              <Badge variant="default" className="bg-green-600">
                <Check className="h-3 w-3 mr-1" />
                Đã kích hoạt
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {!bankSettings ? (
            <div className="text-center py-8">
              <QrCode className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
              <p className="text-muted-foreground mb-2">
                Chưa có thông tin thanh toán ngân hàng
              </p>
              <p className="text-sm text-muted-foreground">
                Liên hệ quản trị viên để cấu hình phương thức thanh toán
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Bank Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Ngân hàng</span>
                    <p className="font-semibold text-lg">{bankSettings.bank_name}</p>
                    <p className="text-sm text-muted-foreground">Mã: {bankSettings.bank_code}</p>
                  </div>
                </div>
                
                <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Chủ tài khoản</span>
                    <p className="font-semibold text-lg">{bankSettings.account_holder}</p>
                  </div>
                </div>
              </div>

              {/* Account Number with Copy */}
              <div className="p-4 rounded-lg border-2 border-dashed border-primary/30 bg-primary/5">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider">Số tài khoản</span>
                    <p className="font-mono text-2xl font-bold text-primary tracking-wider">
                      {bankSettings.account_number}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(bankSettings.account_number, 'account')}
                  >
                    {copiedField === 'account' ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Payment Prefix */}
              {bankSettings.payment_prefix && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">Tiền tố nội dung CK</span>
                      <p className="font-mono font-semibold">{bankSettings.payment_prefix}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Info Alert */}
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Khi thanh toán, hệ thống sẽ tự động tạo mã QR với nội dung chuyển khoản. 
                  Giao dịch được xác nhận tự động trong vài giây sau khi chuyển khoản thành công.
                </AlertDescription>
              </Alert>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Other Payment Methods - Coming Soon */}
      <Card className="border-dashed opacity-60">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-secondary">
                <CreditCard className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <CardTitle className="text-muted-foreground">Phương thức khác</CardTitle>
                <CardDescription>
                  Thẻ tín dụng, Ví điện tử
                </CardDescription>
              </div>
            </div>
            <Badge variant="secondary">Sắp ra mắt</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
            <CreditCard className="h-5 w-5 text-muted-foreground shrink-0" />
            <p className="text-sm text-muted-foreground">
              Stripe, VNPay và các phương thức khác sẽ sớm được tích hợp.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
