import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type DateRange = '7d' | '30d' | '90d';

interface DateRangePickerProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const { t } = useTranslation('superAdmin');

  const options: { value: DateRange; label: string }[] = [
    { value: '7d', label: t('analytics.dateRange.7d') },
    { value: '30d', label: t('analytics.dateRange.30d') },
    { value: '90d', label: t('analytics.dateRange.90d') },
  ];

  return (
    <div className="flex gap-1 border rounded-lg p-1">
      {options.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          variant={value === opt.value ? 'default' : 'ghost'}
          size="sm"
          className={cn(
            'h-7 px-3 text-xs',
            value === opt.value && 'pointer-events-none'
          )}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
