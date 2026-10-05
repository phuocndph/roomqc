import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Lock, CreditCard, Check, Building2 } from 'lucide-react';
import { useUser } from '@/hooks/useUser';
import { isAdminUser, isTenantOwner } from '@/lib/userAccess';
import {
  useHotelBankPaymentSettings,
  useCreateBankPaymentSettings,
  useUpdateBankPaymentSettings,
} from '@/hooks/useBankPaymentSettings';
import { VIETNAM_BANKS } from '@/lib/vietnam-banks';

interface HotelBankPaymentSettingsProps {
  hotelId: string;
}

export function HotelBankPaymentSettings({ hotelId }: HotelBankPaymentSettingsProps) {
  const { user, tenantId } = useUser();
  const isOwner = isTenantOwner(user) || isAdminUser(user);

  const { data: settings, isLoading } = useHotelBankPaymentSettings(hotelId);
  const createMutation = useCreateBankPaymentSettings();
  const updateMutation = useUpdateBankPaymentSettings();

  const [formData, setFormData] = useState({
    bank_code: '',
    bank_name: '',
    account_number: '',
    account_holder: '',
    payment_prefix: 'HD-',
    qr_template: 'compact',
  });

  const [hasChanges, setHasChanges] = useState(false);

  // Load existing settings into form
  useEffect(() => {
    if (settings) {
      setFormData({
        bank_code: settings.bank_code || '',
        bank_name: settings.bank_name || '',
        account_number: settings.account_number || '',
        account_holder: settings.account_holder || '',
        payment_prefix: settings.payment_prefix || 'HD-',
        qr_template: settings.qr_template || 'compact',
      });
      setHasChanges(false);
    }
  }, [settings]);

  const handleBankChange = (bankCode: string) => {
    const bank = VIETNAM_BANKS.find((b) => b.code === bankCode);
    setFormData((prev) => ({
      ...prev,
      bank_code: bankCode,
      bank_name: bank?.name || '',
    }));
    setHasChanges(true);
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!tenantId || !hotelId) return;

    if (!formData.bank_code || !formData.account_number || !formData.account_holder) {
      return;
    }

    if (settings?.id) {
      // Update existing
      await updateMutation.mutateAsync({
        id: settings.id,
        ...formData,
      });
    } else {
      // Create new
      await createMutation.mutateAsync({
        ...formData,
        hotel_id: hotelId,
        tenant_id: tenantId,
      });
    }

    setHasChanges(false);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const isValid = formData.bank_code && formData.account_number && formData.account_holder;

  // Show access denied for non-owners
  if (!isOwner) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Tài khoản nhận thanh toán
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="default">
            <Lock className="h-4 w-4" />
            <AlertDescription>
              Chỉ chủ khách sạn mới có quyền cài đặt tài khoản thanh toán
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Tài khoản nhận thanh toán
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CreditCard className="h-5 w-5" />
          Tài khoản nhận thanh toán
        </CardTitle>
        <CardDescription>
          Cấu hình tài khoản ngân hàng để nhận thanh toán từ khách
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Bank Selection */}
        <div className="space-y-2">
          <Label>Ngân hàng</Label>
          <Select value={formData.bank_code} onValueChange={handleBankChange}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn ngân hàng">
                {formData.bank_code && (
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    {VIETNAM_BANKS.find((b) => b.code === formData.bank_code)?.name || formData.bank_code}
                  </div>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {VIETNAM_BANKS.map((bank) => (
                <SelectItem key={bank.code} value={bank.code}>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{bank.code}</span>
                    <span>{bank.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Account Number */}
        <div className="space-y-2">
          <Label>Số tài khoản</Label>
          <Input
            placeholder="Nhập số tài khoản"
            value={formData.account_number}
            onChange={(e) => handleInputChange('account_number', e.target.value)}
            className="font-mono"
          />
        </div>

        {/* Account Holder */}
        <div className="space-y-2">
          <Label>Tên chủ tài khoản</Label>
          <Input
            placeholder="Nhập tên chủ tài khoản"
            value={formData.account_holder}
            onChange={(e) => handleInputChange('account_holder', e.target.value.toUpperCase())}
            className="uppercase"
          />
        </div>

        {/* Payment Prefix */}
        <div className="space-y-2">
          <Label>Tiền tố nội dung thanh toán</Label>
          <Input
            placeholder="VD: HD-"
            value={formData.payment_prefix}
            onChange={(e) => handleInputChange('payment_prefix', e.target.value)}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Nội dung chuyển khoản sẽ có dạng: {formData.payment_prefix || 'HD-'}ABC123
          </p>
        </div>

        {/* Status indicator */}
        {settings && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Check className="h-4 w-4" />
            <span>Đã cấu hình</span>
          </div>
        )}

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={!isValid || isSaving || !hasChanges}
          className="w-full"
        >
          {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {settings ? 'Cập nhật' : 'Lưu cấu hình'}
        </Button>
      </CardContent>
    </Card>
  );
}
