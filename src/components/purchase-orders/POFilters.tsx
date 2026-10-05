import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { POFilters as POFiltersType } from '@/types/purchase-order.types';
import { Search } from 'lucide-react';
import { DatePicker } from '@/components/shared/DatePicker';

interface POFiltersProps {
  filters: POFiltersType;
  onChange: (filters: Partial<POFiltersType>) => void;
}

const POFilters: React.FC<POFiltersProps> = ({ filters, onChange }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div className="space-y-2">
        <Label>Tìm kiếm</Label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Mã đơn, NCC..."
            value={filters.search || ''}
            onChange={(e) => onChange({ search: e.target.value })}
            className="pl-9"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Từ ngày</Label>
        <DatePicker
          value={filters.date_from}
          onChange={(date) => onChange({ date_from: date })}
        />
      </div>

      <div className="space-y-2">
        <Label>Đến ngày</Label>
        <DatePicker
          value={filters.date_to}
          onChange={(date) => onChange({ date_to: date })}
        />
      </div>

      <div className="space-y-2">
        <Label>Sắp xếp</Label>
        <Select
          value={filters.sort_by || 'date'}
          onValueChange={(value) => onChange({ sort_by: value as any })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">Ngày tạo</SelectItem>
            <SelectItem value="amount">Giá trị</SelectItem>
            <SelectItem value="delivery">Ngày giao</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};

export default POFilters;
