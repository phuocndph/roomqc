import { PricingPlansTable } from '@/components/super-admin/pricing/PricingPlansTable';
import { Shield } from 'lucide-react';

export function PricingPlansPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-lg bg-primary/10">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Gói dịch vụ</h1>
          <p className="text-muted-foreground">
            Quản lý gói đăng ký và giá cả
          </p>
        </div>
      </div>

      <PricingPlansTable />
    </div>
  );
}
