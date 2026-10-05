import { useMemo, useState } from 'react';
import { Sparkles, ArrowUpCircle, Wrench, Trash2, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChangelogList } from '@/hooks/useChangelogList';
import { APP_VERSION } from '@/lib/app-version';
import {
  CHANGE_TYPE_LABEL,
  type ChangeType,
  type ChangelogChange,
} from '@/types/changelog';

const TYPE_META: Record<ChangeType, { Icon: typeof Sparkles; color: string }> = {
  new: { Icon: Sparkles, color: 'text-green-600' },
  improved: { Icon: ArrowUpCircle, color: 'text-primary' },
  fixed: { Icon: Wrench, color: 'text-amber-600' },
  removed: { Icon: Trash2, color: 'text-red-600' },
};

const FILTERS: Array<{ value: ChangeType | 'all'; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'new', label: 'Mới' },
  { value: 'improved', label: 'Cải tiến' },
  { value: 'fixed', label: 'Sửa lỗi' },
];

function formatDate(iso?: string) {
  if (!iso) return '';
  try {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function WhatsNewPage() {
  const { data, isLoading } = useChangelogList();
  const [filter, setFilter] = useState<ChangeType | 'all'>('all');

  const versions = useMemo(() => {
    const list = data?.versions ?? [];
    return [...list].sort((a, b) => (a.releaseDate < b.releaseDate ? 1 : -1));
  }, [data]);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <PageHeader
        title="Lịch sử phiên bản"
        description={`Phiên bản hệ thống hiện tại: v${APP_VERSION}`}
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            type="button"
            size="sm"
            variant={filter === f.value ? 'default' : 'outline'}
            className="h-8"
            onClick={() => setFilter(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span className="text-sm">Đang tải...</span>
        </div>
      ) : versions.length === 0 ? (
        <div className="border rounded-lg p-8 text-center text-sm text-muted-foreground">
          Chưa có lịch sử phiên bản.
        </div>
      ) : (
        <div className="space-y-3">
          {versions.map((v, idx) => {
            const changes: ChangelogChange[] =
              filter === 'all' ? v.changes : v.changes.filter((c) => c.type === filter);
            if (changes.length === 0 && filter !== 'all') return null;
            const isLatest = idx === 0 || v.version === data?.current;
            return (
              <div key={v.version} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">v{v.version}</span>
                    {isLatest && (
                      <span className="text-[11px] font-medium text-green-600 border border-green-600/30 rounded px-1.5 py-0.5">
                        Mới nhất
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">{formatDate(v.releaseDate)}</span>
                </div>
                {v.title && <div className="text-sm font-medium">{v.title}</div>}
                <ul className="space-y-2">
                  {changes.map((c, i) => {
                    const meta = TYPE_META[c.type] ?? TYPE_META.improved;
                    const Icon = meta.Icon;
                    return (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', meta.color)} />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs text-muted-foreground mr-2">
                            {CHANGE_TYPE_LABEL[c.type]}
                          </span>
                          <span>{c.text}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
