import { useState } from 'react';
import { Copy, Check, Download, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { formatVNCurrency } from '@/lib/pricing';
import { getBankName } from '@/lib/vietnam-banks';
interface BankQRCodeProps {
  bankCode: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  amount: number;
  paymentContent: string;
  qrTemplate?: string;
}
export function BankQRCode({
  bankCode,
  bankName,
  accountNumber,
  accountHolder,
  amount,
  paymentContent,
  qrTemplate = 'compact'
}: BankQRCodeProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Generate QR URL using SePay API
  const qrCodeUrl = `https://qr.sepay.vn/img?acc=${accountNumber}&bank=${bankCode}&amount=${amount}&des=${encodeURIComponent(paymentContent)}&template=${qrTemplate}`;
  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      toast.success('Đã sao chép');
      setTimeout(() => setCopiedField(null), 2000);
    } catch (error) {
      toast.error('Không thể sao chép');
    }
  };
  const downloadQR = () => {
    const link = document.createElement('a');
    link.href = qrCodeUrl;
    link.download = `QR-${paymentContent}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Đang tải QR code...');
  };
  return <div className="space-y-6">
      {/* QR Code */}
      <div className="flex flex-col items-center">
        <div className="bg-white p-4 rounded-xl shadow-lg">
          <img src={qrCodeUrl} alt="QR Code thanh toán" className="w-56 h-56 object-contain" onError={e => {
          (e.target as HTMLImageElement).style.display = 'none';
        }} />
        </div>
        <Button variant="ghost" size="sm" className="mt-2" onClick={downloadQR}>
          <Download className="h-4 w-4 mr-2" />
          Tải QR Code
        </Button>
      </div>

      {/* Payment Info */}
      <div className="space-y-3 bg-muted/50 rounded-lg p-4">
        {/* Bank Name */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Ngân hàng</span>
          <span className="font-medium">{getBankName(bankCode)}</span>
        </div>

        {/* Account Number */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Số tài khoản</span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-lg">{accountNumber}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(accountNumber, 'account')}>
              {copiedField === 'account' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Account Holder */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Chủ tài khoản</span>
          <span className="font-medium">{accountHolder}</span>
        </div>

        {/* Amount */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Số tiền</span>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-lg text-primary">
              {formatVNCurrency(amount)}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(amount.toString(), 'amount')}>
              {copiedField === 'amount' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Payment Content */}
        <div className="flex justify-between items-center">
          <span className="text-sm text-muted-foreground">Nội dung CK</span>
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-primary">{paymentContent}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(paymentContent, 'content')}>
              {copiedField === 'content' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
        <h4 className="font-medium text-amber-800 dark:text-amber-200 mb-2">
          Hướng dẫn thanh toán
        </h4>
        <ol className="text-sm text-amber-700 dark:text-amber-300 space-y-1 list-decimal list-inside">
          <li>Mở app ngân hàng và quét mã QR</li>
          <li>Kiểm tra thông tin và số tiền</li>
          <li>Nhập đúng nội dung chuyển khoản: <strong>{paymentContent}</strong></li>
          <li>Xác nhận và hoàn tất giao dịch</li>
        </ol>
      </div>

      {/* Auto-confirm notice */}
      
    </div>;
}