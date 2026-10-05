import { useState } from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { CreditCard, Building2, Wallet } from 'lucide-react';
import { useBankPaymentSettings } from '@/hooks/useBankPaymentSettings';

export type PaymentMethod = 'bank_transfer' | 'credit_card' | 'e_wallet';

interface PaymentMethodSelectorProps {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
  disabled?: boolean;
}

export function PaymentMethodSelector({
  value,
  onChange,
  disabled = false,
}: PaymentMethodSelectorProps) {
  const { data: bankSettings } = useBankPaymentSettings();

  const methods = [
    {
      id: 'bank_transfer' as PaymentMethod,
      label: 'Chuyển khoản ngân hàng',
      description: bankSettings ? `QR Code - ${bankSettings.bank_name}` : 'QR Code VietQR',
      icon: Building2,
      available: !!bankSettings,
    },
    {
      id: 'credit_card' as PaymentMethod,
      label: 'Thẻ tín dụng / Ghi nợ',
      description: 'Visa, Mastercard, JCB',
      icon: CreditCard,
      available: false, // TODO: Integrate with payment gateway
    },
    {
      id: 'e_wallet' as PaymentMethod,
      label: 'Ví điện tử',
      description: 'MoMo, ZaloPay, VNPay',
      icon: Wallet,
      available: false, // TODO: Integrate with e-wallet
    },
  ];

  return (
    <RadioGroup
      value={value}
      onValueChange={(v) => onChange(v as PaymentMethod)}
      disabled={disabled}
      className="space-y-3"
    >
      {methods.map((method) => (
        <div key={method.id} className="relative">
          <div
            className={`flex items-center space-x-4 rounded-lg border p-4 cursor-pointer transition-colors ${
              value === method.id
                ? 'border-primary bg-primary/5'
                : 'border-border hover:bg-muted/50'
            } ${!method.available || disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => {
              if (method.available && !disabled) {
                onChange(method.id);
              }
            }}
          >
            <RadioGroupItem
              value={method.id}
              id={method.id}
              disabled={!method.available || disabled}
              className="sr-only"
            />
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                value === method.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <method.icon className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <Label
                htmlFor={method.id}
                className={`font-medium cursor-pointer ${
                  !method.available ? 'cursor-not-allowed' : ''
                }`}
              >
                {method.label}
              </Label>
              <p className="text-sm text-muted-foreground">{method.description}</p>
            </div>
            {!method.available && (
              <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded">
                Sắp có
              </span>
            )}
          </div>
        </div>
      ))}
    </RadioGroup>
  );
}
