import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  DollarSign, 
  FileText, 
  TrendingUp, 
  Calendar,
  Download,
  Eye,
  CreditCard,
  AlertCircle,
} from 'lucide-react';
import { 
  useTenantPayments, 
  useTenantInvoices, 
  useTenantPaymentStats 
} from '@/hooks/super-admin/useTenantBilling';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface TenantBillingDialogProps {
  tenant: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TenantBillingDialog({
  tenant,
  open,
  onOpenChange,
}: TenantBillingDialogProps) {
  const [activeTab, setActiveTab] = useState('overview');

  const { data: payments = [], isLoading: paymentsLoading } = useTenantPayments(tenant?.id);
  const { data: invoices = [], isLoading: invoicesLoading } = useTenantInvoices(tenant?.id);
  const { data: stats, isLoading: statsLoading } = useTenantPaymentStats(tenant?.id);

  if (!tenant) return null;

  const getPaymentStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      completed: { variant: 'default', label: 'Completed' },
      pending: { variant: 'secondary', label: 'Pending' },
      processing: { variant: 'secondary', label: 'Processing' },
      failed: { variant: 'destructive', label: 'Failed' },
      refunded: { variant: 'outline', label: 'Refunded' },
      cancelled: { variant: 'outline', label: 'Cancelled' },
    };
    const config = variants[status] || { variant: 'outline' as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getInvoiceStatusBadge = (status: string) => {
    const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
      paid: { variant: 'default', label: 'Paid' },
      sent: { variant: 'secondary', label: 'Sent' },
      draft: { variant: 'outline', label: 'Draft' },
      overdue: { variant: 'destructive', label: 'Overdue' },
      cancelled: { variant: 'outline', label: 'Cancelled' },
    };
    const config = variants[status] || { variant: 'outline' as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-2xl">Billing History - {tenant.name}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">
              <TrendingUp className="h-4 w-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="payments">
              <CreditCard className="h-4 w-4 mr-2" />
              Payments
            </TabsTrigger>
            <TabsTrigger value="invoices">
              <FileText className="h-4 w-4 mr-2" />
              Invoices
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="flex-1 overflow-auto">
            <ScrollArea className="h-full">
              <div className="space-y-4 pr-4">
                {statsLoading ? (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                      <Card key={i}>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-4 w-4 rounded-full" />
                        </CardHeader>
                        <CardContent>
                          <Skeleton className="h-8 w-24 mb-2" />
                          <Skeleton className="h-3 w-32" />
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Paid</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-green-600">
                          {formatCurrency(stats?.totalPaid || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Lifetime revenue
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Outstanding</CardTitle>
                        <AlertCircle className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-orange-600">
                          {formatCurrency(stats?.totalOutstanding || 0)}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Unpaid invoices
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Payments</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-foreground">
                          {stats?.paymentCount || 0}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Total transactions
                        </p>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Last Payment</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                      </CardHeader>
                      <CardContent>
                        <div className="text-2xl font-bold text-foreground">
                          {stats?.lastPaymentDate 
                            ? new Date(stats.lastPaymentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : 'Never'
                          }
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {stats?.lastPaymentDate 
                            ? new Date(stats.lastPaymentDate).toLocaleDateString()
                            : 'No payments yet'
                          }
                        </p>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Current Plan */}
                <Card>
                  <CardHeader>
                    <CardTitle>Current Subscription</CardTitle>
                    <CardDescription>Active plan details</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Plan</span>
                        <span className="font-medium text-foreground">
                          {tenant.subscription_plan?.name || 'No Plan'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Billing Cycle</span>
                        <span className="font-medium text-foreground">
                          {tenant.billing_cycle === 'monthly' ? 'Monthly' : 'Yearly'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Status</span>
                        {getPaymentStatusBadge(tenant.subscription_status)}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Next Billing</span>
                        <span className="font-medium text-foreground">
                          {tenant.next_billing_date 
                            ? new Date(tenant.next_billing_date).toLocaleDateString()
                            : 'N/A'
                          }
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Payments Tab */}
          <TabsContent value="payments" className="flex-1 overflow-auto">
            <ScrollArea className="h-full">
              <div className="pr-4">
                {paymentsLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : payments.length === 0 ? (
                  <div className="text-center py-12">
                    <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No payment transactions found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map((payment: any) => (
                          <TableRow key={payment.id}>
                            <TableCell>
                              {payment.payment_date 
                                ? new Date(payment.payment_date).toLocaleDateString()
                                : new Date(payment.created_at).toLocaleDateString()
                              }
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium text-foreground">
                                  {payment.description || `${payment.subscription_plan?.name || 'Subscription'} Payment`}
                                </div>
                                {payment.invoice_number && (
                                  <div className="text-xs text-muted-foreground">
                                    Invoice: {payment.invoice_number}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              {formatCurrency(payment.amount)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {payment.payment_method || 'N/A'}
                            </TableCell>
                            <TableCell>
                              {getPaymentStatusBadge(payment.payment_status)}
                            </TableCell>
                            <TableCell className="text-right">
                              {payment.receipt_url && (
                                <Button variant="ghost" size="sm">
                                  <Download className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="flex-1 overflow-auto">
            <ScrollArea className="h-full">
              <div className="pr-4">
                {invoicesLoading ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : invoices.length === 0 ? (
                  <div className="text-center py-12">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No invoices found</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Invoice #</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Due Date</TableHead>
                          <TableHead>Plan</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((invoice: any) => (
                          <TableRow key={invoice.id}>
                            <TableCell className="font-mono text-sm text-foreground">
                              {invoice.invoice_number}
                            </TableCell>
                            <TableCell>
                              {new Date(invoice.invoice_date).toLocaleDateString()}
                            </TableCell>
                            <TableCell>
                              {new Date(invoice.due_date).toLocaleDateString()}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {invoice.subscription_plan?.name || 'N/A'}
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              {formatCurrency(invoice.total_amount)}
                            </TableCell>
                            <TableCell>
                              {getInvoiceStatusBadge(invoice.status)}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-2">
                                <Button variant="ghost" size="sm">
                                  <Eye className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <Download className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
