import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  MoreHorizontal, 
  Plus, 
  Play, 
  Pause, 
  BarChart3,
  Trash2,
} from 'lucide-react';
import {
  useMarketingCampaigns,
  useLaunchCampaign,
  usePauseCampaign,
} from '@/hooks/super-admin/useMarketingCampaigns';
import { CampaignStats } from './CampaignStats';
import type { MarketingCampaign } from '@/types/super-admin.types';
import { cn } from '@/lib/utils';

export function CampaignsTable() {
  const { t } = useTranslation('superAdmin');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<MarketingCampaign | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);

  const { data: campaigns = [], isLoading } = useMarketingCampaigns();
  const launchCampaign = useLaunchCampaign();
  const pauseCampaign = usePauseCampaign();

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-600';
      case 'paused': return 'text-red-600';
      case 'draft': return 'text-muted-foreground';
      case 'scheduled': return 'text-blue-600';
      case 'completed': return 'text-muted-foreground';
      default: return 'text-muted-foreground';
    }
  };

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      draft: t('campaigns.status.draft', 'Nháp'),
      scheduled: t('campaigns.status.scheduled', 'Đã lên lịch'),
      active: t('campaigns.status.active', 'Đang chạy'),
      paused: t('campaigns.status.paused', 'Tạm dừng'),
      completed: t('campaigns.status.completed', 'Hoàn thành'),
    };
    return labels[status] || status;
  };

  const columns: ColumnDef<MarketingCampaign>[] = [
    {
      accessorKey: 'name',
      header: t('campaigns.table.name', 'Tên chiến dịch'),
      cell: ({ row }) => (
        <div>
          <div className="text-sm font-medium">{row.original.name}</div>
          <div className="text-xs text-muted-foreground capitalize">
            {row.original.campaign_type.replace(/_/g, ' ')}
          </div>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: t('campaigns.table.status', 'Trạng thái'),
      cell: ({ row }) => (
        <span className={cn('text-sm font-medium', getStatusColor(row.original.status))}>
          {getStatusLabel(row.original.status)}
        </span>
      ),
    },
    {
      accessorKey: 'target_audience',
      header: t('campaigns.table.audience', 'Đối tượng'),
      cell: ({ row }) => (
        <span className="text-sm capitalize">
          {row.original.target_audience.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      accessorKey: 'performance',
      header: t('campaigns.table.performance', 'Hiệu suất'),
      cell: ({ row }) => {
        const sent = row.original.sent_count || 0;
        const opened = row.original.opened_count || 0;
        const clicked = row.original.clicked_count || 0;
        const openRate = sent > 0 ? ((opened / sent) * 100).toFixed(1) : '0';
        
        return (
          <div className="text-sm">
            <div>{sent} {t('campaigns.table.sent', 'đã gửi')}</div>
            <div className="text-xs text-muted-foreground">
              {openRate}% {t('campaigns.table.openRate', 'mở')} • {clicked} {t('campaigns.table.clicks', 'clicks')}
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'starts_at',
      header: t('campaigns.table.startDate', 'Ngày bắt đầu'),
      cell: ({ row }) => {
        const date = row.original.starts_at;
        return <span className="text-sm">{new Date(date).toLocaleDateString('vi-VN')}</span>;
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const campaign = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Thêm tùy chọn">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('campaigns.table.actions', 'Thao tác')}</DropdownMenuLabel>
              <DropdownMenuItem
                onClick={() => {
                  setSelectedCampaign(campaign);
                  setStatsOpen(true);
                }}
              >
                <BarChart3 className="h-4 w-4 mr-2" />
                {t('campaigns.table.viewStats', 'Xem thống kê')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {campaign.status === 'draft' && (
                <DropdownMenuItem
                  onClick={() => launchCampaign.mutate(campaign.id)}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {t('campaigns.table.launch', 'Khởi chạy')}
                </DropdownMenuItem>
              )}
              {campaign.status === 'active' && (
                <DropdownMenuItem
                  onClick={() => pauseCampaign.mutate(campaign.id)}
                >
                  <Pause className="h-4 w-4 mr-2" />
                  {t('campaigns.table.pause', 'Tạm dừng')}
                </DropdownMenuItem>
              )}
              {campaign.status === 'paused' && (
                <DropdownMenuItem
                  onClick={() => launchCampaign.mutate(campaign.id)}
                >
                  <Play className="h-4 w-4 mr-2" />
                  {t('campaigns.table.resume', 'Tiếp tục')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="text-red-600">
                <Trash2 className="h-4 w-4 mr-2" />
                {t('campaigns.table.delete', 'Xóa')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  const table = useReactTable({
    data: campaigns,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  return (
    <div className="space-y-4">
      <div className="border rounded-lg">
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <h3 className="text-sm font-medium">{t('campaigns.title', 'Chiến dịch Marketing')}</h3>
          <Button size="sm" className="h-8">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            {t('campaigns.create', 'Tạo chiến dịch')}
          </Button>
        </div>
        <div className="p-3">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="text-xs">
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
                    <TableCell colSpan={columns.length} className="h-24 text-center text-sm">
                      {t('campaigns.table.loading', 'Đang tải...')}
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
                      {t('campaigns.table.noCampaigns', 'Không có chiến dịch nào.')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <div className="text-xs text-muted-foreground">
              {table.getFilteredRowModel().rows.length} {t('campaigns.table.total', 'chiến dịch')}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
              >
                {t('tenants.table.previous')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
              >
                {t('tenants.table.next')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Dialog */}
      <CampaignStats
        campaign={selectedCampaign}
        open={statsOpen}
        onOpenChange={setStatsOpen}
      />
    </div>
  );
}
