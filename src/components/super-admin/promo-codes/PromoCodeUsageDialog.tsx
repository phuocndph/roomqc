import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePromoCodeUsage } from '@/hooks/super-admin/usePromoCodes';
import type { PromotionalCode } from '@/types/super-admin.types';

interface PromoCodeUsageDialogProps {
  promoCode: PromotionalCode | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PromoCodeUsageDialog({
  promoCode,
  open,
  onOpenChange,
}: PromoCodeUsageDialogProps) {
  const { data: usage, isLoading } = usePromoCodeUsage(
    open ? promoCode?.id || null : null
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Usage History: <span className="font-mono">{promoCode?.code}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg bg-blue-50 p-4">
              <p className="text-sm text-blue-600">Total Uses</p>
              <p className="text-2xl font-bold">{promoCode?.current_uses || 0}</p>
            </div>
            <div className="rounded-lg bg-green-50 p-4">
              <p className="text-sm text-green-600">Discount Type</p>
              <p className="text-2xl font-bold">
                {promoCode?.discount_type === 'percentage' 
                  ? `${promoCode.discount_value}%` 
                  : `$${promoCode?.discount_value}`}
              </p>
            </div>
            <div className="rounded-lg bg-purple-50 p-4">
              <p className="text-sm text-purple-600">Status</p>
              <p className="text-2xl font-bold">
                {promoCode?.is_active ? (
                  <Badge>Active</Badge>
                ) : (
                  <Badge variant="outline">Inactive</Badge>
                )}
              </p>
            </div>
          </div>

          {/* Usage Table */}
          <div className="rounded-md border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Used At</TableHead>
                    <TableHead>Original Amount</TableHead>
                    <TableHead>Discount Applied</TableHead>
                    <TableHead>Final Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <>
                      {[...Array(3)].map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        </TableRow>
                      ))}
                    </>
                  ) : usage && usage.length > 0 ? (
                    usage.map((record: any) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <div className="font-medium">{record.tenant?.name || 'N/A'}</div>
                        </TableCell>
                        <TableCell>
                          {new Date(record.used_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          ${record.original_amount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold text-green-600">
                            -${record.discount_applied.toFixed(2)}
                          </span>
                        </TableCell>
                        <TableCell className="font-medium">
                          ${record.final_amount.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                        No usage history yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
