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
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { usePlanPriceHistory } from '@/hooks/super-admin/usePricingManagement';
import type { SubscriptionPlan } from '@/types/subscription.types';

interface PriceHistoryDialogProps {
  plan: SubscriptionPlan | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PriceHistoryDialog({
  plan,
  open,
  onOpenChange,
}: PriceHistoryDialogProps) {
  const { data: history, isLoading } = usePlanPriceHistory(
    open ? plan?.id || null : null
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Price History: {plan?.name}</DialogTitle>
        </DialogHeader>

        <div className="rounded-md border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date Changed</TableHead>
                  <TableHead>Old Monthly</TableHead>
                  <TableHead>New Monthly</TableHead>
                  <TableHead>Old Yearly</TableHead>
                  <TableHead>New Yearly</TableHead>
                  <TableHead>Changed By</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <>
                    {[...Array(3)].map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      </TableRow>
                    ))}
                  </>
                ) : history && history.length > 0 ? (
                  history.map((record: any) => {
                    const monthlyChange = record.new_price_monthly - record.old_price_monthly;
                    const yearlyChange = record.new_price_yearly - record.old_price_yearly;
                    
                    return (
                      <TableRow key={record.id}>
                        <TableCell>
                          {new Date(record.changed_at).toLocaleDateString()}
                        </TableCell>
                        <TableCell>${record.old_price_monthly}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            ${record.new_price_monthly}
                            {monthlyChange > 0 ? (
                              <TrendingUp className="h-3 w-3 text-red-600" />
                            ) : monthlyChange < 0 ? (
                              <TrendingDown className="h-3 w-3 text-green-600" />
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>${record.old_price_yearly}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            ${record.new_price_yearly}
                            {yearlyChange > 0 ? (
                              <TrendingUp className="h-3 w-3 text-red-600" />
                            ) : yearlyChange < 0 ? (
                              <TrendingDown className="h-3 w-3 text-green-600" />
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{record.changed_by_admin?.full_name || 'System'}</div>
                            <div className="text-xs text-muted-foreground">{record.changed_by_admin?.email}</div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="text-sm">{record.reason || 'No reason provided'}</p>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                      No price changes recorded
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
