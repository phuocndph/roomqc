import { useState } from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  MoreHorizontal, 
  Search, 
  ArrowUpDown, 
  Plus, 
  Copy,
  Eye,
  Edit,
  Trash2,
} from 'lucide-react';
import { 
  usePromoCodes, 
  useDeletePromoCode,
  useUpdatePromoCode,
} from '@/hooks/super-admin/usePromoCodes';
import { PromoCodeForm } from './PromoCodeForm';
import { PromoCodeUsageDialog } from './PromoCodeUsageDialog';
import type { PromotionalCode } from '@/types/super-admin.types';
import { useToast } from '@/hooks/use-toast';

export function PromoCodesTable() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [selectedCode, setSelectedCode] = useState<PromotionalCode | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const { data: promoCodes = [], isLoading } = usePromoCodes();
  const deletePromoCode = useDeletePromoCode();
  const updatePromoCode = useUpdatePromoCode();
  const { toast } = useToast();

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast({
      title: 'Copied!',
      description: `Code "${code}" copied to clipboard`,
    });
  };

  const toggleActive = async (promoCode: PromotionalCode) => {
    await updatePromoCode.mutateAsync({
      id: promoCode.id,
      updates: { is_active: !promoCode.is_active },
    });
  };

  const columns: ColumnDef<PromotionalCode>[] = [
    {
      accessorKey: 'code',
      header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Code
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        );
      },
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold">{row.original.code}</span>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => copyToClipboard(row.original.code)}
          >
            <Copy className="h-3 w-3" />
          </Button>
        </div>
      ),
    },
    {
      accessorKey: 'discount_type',
      header: 'Discount',
      cell: ({ row }) => {
        const type = row.original.discount_type;
        const value = row.original.discount_value;
        return (
          <div>
            <span className="font-semibold text-green-600">
              {type === 'percentage' ? `${value}%` : `$${value}`}
            </span>
            <div className="text-xs text-muted-foreground">
              {type === 'percentage' ? 'Percentage' : 'Fixed Amount'}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'is_active',
      header: 'Status',
      cell: ({ row }) => {
        const isActive = row.original.is_active;
        const now = new Date();
        const validFrom = new Date(row.original.valid_from);
        const validUntil = row.original.valid_until 
          ? new Date(row.original.valid_until) 
          : null;
        
        let status = 'inactive';
        let variant: 'default' | 'secondary' | 'destructive' | 'outline' = 'outline';
        
        if (isActive) {
          if (now < validFrom) {
            status = 'scheduled';
            variant = 'secondary';
          } else if (validUntil && now > validUntil) {
            status = 'expired';
            variant = 'destructive';
          } else {
            status = 'active';
            variant = 'default';
          }
        }
        
        return <Badge variant={variant}>{status.toUpperCase()}</Badge>;
      },
    },
    {
      accessorKey: 'usage',
      header: 'Usage',
      cell: ({ row }) => {
        const used = row.original.current_uses || 0;
        const max = row.original.max_uses;
        
        return (
          <div>
            <div className="font-medium">{used} used</div>
            <div className="text-xs text-muted-foreground">
              {max ? `of ${max} max` : 'Unlimited'}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'valid_until',
      header: 'Valid Until',
      cell: ({ row }) => {
        const date = row.original.valid_until;
        if (!date) return <span className="text-muted-foreground">No expiry</span>;
        
        const validUntil = new Date(date);
        const daysLeft = Math.ceil(
          (validUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
        );
        
        return (
          <div>
            <div>{validUntil.toLocaleDateString()}</div>
            {daysLeft > 0 && daysLeft <= 7 && (
              <div className="text-xs text-orange-600">{daysLeft} days left</div>
            )}
            {daysLeft < 0 && (
              <div className="text-xs text-red-600">Expired</div>
            )}
          </div>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const promoCode = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Thêm tùy chọn">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Actions</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedCode(promoCode);
                  setUsageDialogOpen(true);
                }}
              >
                <Eye className="h-4 w-4 mr-2" />
                View Usage
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedCode(promoCode);
                  setFormOpen(true);
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => copyToClipboard(promoCode.code)}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Code
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => toggleActive(promoCode)}>
                {promoCode.is_active ? 'Deactivate' : 'Activate'}
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => setDeleteTarget(promoCode.id)}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: promoCodes,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
    },
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Promotional Codes</CardTitle>
            <Button
              onClick={() => {
                setSelectedCode(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Create Promo Code
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search codes..."
                value={(table.getColumn('code')?.getFilterValue() as string) ?? ''}
                onChange={(e) =>
                  table.getColumn('code')?.setFilterValue(e.target.value)
                }
                className="pl-9"
              />
            </div>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : table.getRowModel().rows?.length ? (
                    table.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={columns.length} className="h-24 text-center">
                        No promo codes found.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              {table.getFilteredRowModel().rows.length} promo code(s) total
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dialogs */}
      <PromoCodeForm
        promoCode={selectedCode}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
      <PromoCodeUsageDialog
        promoCode={selectedCode}
        open={usageDialogOpen}
        onOpenChange={setUsageDialogOpen}
      />
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa mã khuyến mãi?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này không thể hoàn tác. Mã đang dùng trong chiến dịch sẽ bị vô hiệu hóa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deleteTarget) {
                  deletePromoCode.mutate(deleteTarget);
                }
                setDeleteTarget(null);
              }}
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
