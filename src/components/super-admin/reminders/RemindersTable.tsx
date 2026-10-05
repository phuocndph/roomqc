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
} from '@tanstack/react-table';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MoreHorizontal, ArrowUpDown, Send } from 'lucide-react';
import {
  useRenewalReminders, useSendReminder,
} from '@/hooks/super-admin/useRenewalReminders';
import type { RenewalReminder } from '@/types/super-admin.types';

const statusLabels: Record<string, string> = {
  pending: 'Chờ gửi',
  sent: 'Đã gửi',
  failed: 'Thất bại',
  cancelled: 'Đã hủy',
};

const typeLabels: Record<string, string> = {
  '7_days': '7 ngày trước',
  '3_days': '3 ngày trước',
  '1_day': '1 ngày trước',
  expired: 'Đã hết hạn',
  grace_period_ending: 'Hết gia hạn',
};

export function RemindersTable() {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: reminders = [], isLoading } = useRenewalReminders(
    statusFilter !== 'all' ? { status: statusFilter as any } : undefined
  );
  const sendReminder = useSendReminder();

  const columns: ColumnDef<RenewalReminder>[] = [
    {
      accessorKey: 'tenant',
      header: 'Tenant',
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.tenants?.name || 'N/A'}</p>
          <p className="text-xs text-muted-foreground">
            {row.original.tenants?.email || '-'}
          </p>
        </div>
      ),
    },
    {
      accessorKey: 'reminder_type',
      header: 'Loại',
      cell: ({ row }) => (
        <span className="text-sm">
          {typeLabels[row.original.reminder_type] || row.original.reminder_type}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Trạng thái',
      cell: ({ row }) => {
        const s = row.original.status;
        const colorClass = s === 'sent' ? 'text-green-600' : s === 'failed' ? 'text-red-600' : s === 'pending' ? 'text-amber-600' : 'text-muted-foreground';
        return <span className={`text-sm font-medium ${colorClass}`}>{statusLabels[s] || s}</span>;
      },
    },
    {
      accessorKey: 'scheduled_for',
      header: ({ column }) => (
        <Button variant="ghost" size="sm" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          Lịch gửi <ArrowUpDown className="ml-1 h-3 w-3" />
        </Button>
      ),
      cell: ({ row }) => (
        <div>
          <p className="text-sm">{new Date(row.original.scheduled_for).toLocaleDateString('vi-VN')}</p>
          <p className="text-xs text-muted-foreground">{new Date(row.original.scheduled_for).toLocaleTimeString('vi-VN')}</p>
        </div>
      ),
    },
    {
      accessorKey: 'sent_at',
      header: 'Đã gửi lúc',
      cell: ({ row }) =>
        row.original.sent_at ? (
          <p className="text-sm">{new Date(row.original.sent_at).toLocaleDateString('vi-VN')}</p>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const reminder = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Thêm tùy chọn">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Thao tác</DropdownMenuLabel>
              {reminder.status === 'pending' && (
                <DropdownMenuItem onClick={() => sendReminder.mutate(reminder.id)}>
                  <Send className="h-4 w-4 mr-2" />
                  Gửi ngay
                </DropdownMenuItem>
              )}
              {reminder.status === 'failed' && (
                <DropdownMenuItem onClick={() => sendReminder.mutate(reminder.id)}>
                  Thử lại
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: reminders,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <div className="space-y-3">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px] h-8">
            <SelectValue placeholder="Lọc trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="pending">Chờ gửi</SelectItem>
            <SelectItem value="sent">Đã gửi</SelectItem>
            <SelectItem value="failed">Thất bại</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                    Đang tải...
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
                  <TableCell colSpan={columns.length} className="h-24 text-center text-sm text-muted-foreground">
                    Không có nhắc nhở nào
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {table.getFilteredRowModel().rows.length} nhắc nhở
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            Trước
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            Sau
          </Button>
        </div>
      </div>
    </div>
  );
}
