import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, TrendingUp, Tag, Users, DollarSign } from 'lucide-react';
import { PromoCodesTable } from './PromoCodesTable';
import { PromoCodeAnalytics } from './PromoCodeAnalytics';
import { PromoCodeForm } from './PromoCodeForm';
import { BulkPromoCodeGenerator } from './BulkPromoCodeGenerator';
import { usePromoCodes } from '@/hooks/super-admin/usePromoCodes';
import { PageHeader } from '../shared/PageHeader';
import { StatCard } from '../shared/StatCard';

export function AdvancedPromoCodesManagement() {
  const [formOpen, setFormOpen] = useState(false);
  const [bulkGenOpen, setBulkGenOpen] = useState(false);
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const { data: promoCodes = [] } = usePromoCodes();

  // Calculate stats
  const stats = {
    total: promoCodes.length,
    active: promoCodes.filter((p: any) => p.is_active).length,
    totalUsage: promoCodes.reduce((sum: number, p: any) => sum + (p.times_used || 0), 0),
    totalDiscount: promoCodes.reduce((sum: number, p: any) => {
      return sum + (p.times_used || 0) * (p.discount_type === 'percentage' ? 20 : p.discount_value);
    }, 0),
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <PageHeader
        title="Mã khuyến mãi"
        description="Tạo và quản lý mã giảm giá cho khách hàng"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setBulkGenOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Tạo hàng loạt
            </Button>
            <Button size="sm" onClick={() => setFormOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Tạo mã mới
            </Button>
          </>
        }
      />

      {/* Stats Cards */}
      <div className="grid gap-3 md:grid-cols-4">
        <StatCard
          title="Tổng số mã"
          value={stats.total}
          icon={Tag}
          description={`${stats.active} mã đang hoạt động`}
        />
        <StatCard
          title="Tổng lượt sử dụng"
          value={stats.totalUsage}
          icon={Users}
          description="Số lần mã được áp dụng"
        />
        <StatCard
          title="Tổng giảm giá đã áp dụng"
          value={`${stats.totalDiscount.toLocaleString('vi-VN')}đ`}
          icon={DollarSign}
          description="Giá trị ước tính"
        />
        <StatCard
          title="Tỷ lệ chuyển đổi"
          value={`${stats.total > 0 ? ((stats.totalUsage / stats.total) * 100).toFixed(1) : 0}%`}
          icon={TrendingUp}
          description="Mã đã dùng / mã tạo ra"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 pb-4 border-b">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px] h-8 text-sm">
            <SelectValue placeholder="Lọc theo loại" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả loại</SelectItem>
            <SelectItem value="percentage">Giảm theo %</SelectItem>
            <SelectItem value="fixed_amount">Giảm cố định</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[180px] h-8 text-sm">
            <SelectValue placeholder="Lọc theo trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="active">Hoạt động</SelectItem>
            <SelectItem value="expired">Hết hạn</SelectItem>
            <SelectItem value="used_up">Đã dùng hết</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="list" className="space-y-4">
        <TabsList>
          <TabsTrigger value="list">Tất cả mã</TabsTrigger>
          <TabsTrigger value="analytics">Phân tích</TabsTrigger>
          <TabsTrigger value="templates">Mẫu có sẵn</TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <PromoCodesTable />
        </TabsContent>

        <TabsContent value="analytics">
          <PromoCodeAnalytics />
        </TabsContent>

        <TabsContent value="templates">
          <PromoCodeTemplates />
        </TabsContent>
      </Tabs>

      {/* Dialogs */}
      <PromoCodeForm
        promoCode={null}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
      <BulkPromoCodeGenerator
        open={bulkGenOpen}
        onOpenChange={setBulkGenOpen}
      />
    </div>
  );
}

function PromoCodeTemplates() {
  const templates = [
    {
      name: 'Chào mừng khách mới',
      code: 'WELCOME20',
      discount: 'Giảm 20%',
      description: 'Ưu đãi chào mừng khách hàng mới đăng ký',
    },
    {
      name: 'Khuyến mãi mùa hè',
      code: 'SUMMER2024',
      discount: 'Giảm 500.000đ',
      description: 'Chương trình khuyến mãi mùa hè',
    },
    {
      name: 'Giới thiệu bạn bè',
      code: 'REFER30',
      discount: 'Giảm 30%',
      description: 'Ưu đãi chương trình giới thiệu',
    },
    {
      name: 'Dùng thử doanh nghiệp',
      code: 'ENTFREE',
      discount: 'Miễn phí 100%',
      description: 'Dùng thử miễn phí gói doanh nghiệp',
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {templates.map((template) => (
        <div key={template.code} className="p-4 border rounded-lg hover:border-primary/50 transition-colors">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h4 className="text-sm font-medium">{template.name}</h4>
              <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
            </div>
            <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">
              {template.discount}
            </span>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span className="font-mono text-sm font-semibold text-purple-600">
              {template.code}
            </span>
            <Button size="sm" variant="outline" className="h-7 text-xs">
              Sử dụng mẫu
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
