import { useState } from 'react';
import { RefreshCw, Sparkles, Zap, Wrench, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { usePWAUpdate } from '@/hooks/usePWAUpdate';
import { useChangelog } from '@/hooks/useChangelog';
import type { ChangeType } from '@/types/changelog';

const LAST_SEEN_VERSION_KEY = 'lastSeenVersion';

const TYPE_META: Record<ChangeType, { Icon: typeof Sparkles; color: string; label: string }> = {
  new: { Icon: Sparkles, color: 'text-green-600 dark:text-green-500', label: 'Mới' },
  improved: { Icon: Zap, color: 'text-blue-600 dark:text-blue-500', label: 'Cải tiến' },
  fixed: { Icon: Wrench, color: 'text-amber-600 dark:text-amber-500', label: 'Sửa lỗi' },
  removed: { Icon: Trash2, color: 'text-red-600 dark:text-red-500', label: 'Gỡ bỏ' },
};

export function PWAUpdatePrompt() {
  const { needRefresh, update, dismiss } = usePWAUpdate();
  const { changelog, loading } = useChangelog(needRefresh);
  const [isUpdating, setIsUpdating] = useState(false);

  if (!needRefresh) return null;

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      // Save version BEFORE reload so we can show success toast after
      if (changelog?.version) {
        try {
          localStorage.setItem(LAST_SEEN_VERSION_KEY, changelog.version);
          localStorage.setItem('pendingUpdateVersion', changelog.version);
        } catch {
          // ignore storage errors
        }
      }
      await update();
      // App will reload automatically via controllerchange listener
    } catch (error) {
      console.error('[PWA] Update failed:', error);
      setIsUpdating(false);
    }
  };

  const handleDismiss = () => {
    // Do NOT save lastSeenVersion — user will see prompt again next time
    dismiss();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-background/60 backdrop-blur-sm sm:items-center"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-update-title"
    >
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl sm:mx-4 animate-in slide-in-from-bottom-4 sm:slide-in-from-bottom-0 sm:fade-in duration-300 flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="flex flex-col items-center text-center px-6 pt-6 pb-4 shrink-0">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <h3 id="pwa-update-title" className="text-lg font-semibold text-foreground">
              Có bản cập nhật mới
            </h3>
            {changelog?.version && (
              <Badge variant="secondary" className="font-mono text-xs">
                v{changelog.version}
              </Badge>
            )}
          </div>
          {changelog?.title ? (
            <p className="mt-1 text-sm font-medium text-foreground/80">{changelog.title}</p>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">
            Phiên bản mới đã sẵn sàng. Cập nhật để trải nghiệm các tính năng mới nhất.
          </p>
        </div>

        {/* Changelog list */}
        <div className="px-6 pb-2 flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-3/4" />
            </div>
          ) : changelog && changelog.changes.length > 0 ? (
            <ul className="space-y-2">
              {changelog.changes.map((change, idx) => {
                const meta = TYPE_META[change.type] ?? TYPE_META.improved;
                const { Icon, color } = meta;
                return (
                  <li
                    key={idx}
                    className="flex items-start gap-3 rounded-md border border-border/50 bg-muted/30 p-2.5"
                  >
                    <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} aria-hidden />
                    <span className="text-sm text-foreground/90 leading-snug">{change.text}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-2 sm:flex-row px-6 pt-4 pb-6 shrink-0 border-t border-border/50 mt-2">
          <Button
            variant="outline"
            onClick={handleDismiss}
            disabled={isUpdating}
            className="flex-1"
          >
            Để sau
          </Button>
          <Button onClick={handleUpdate} disabled={isUpdating} className="flex-1">
            {isUpdating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                Đang cập nhật...
              </>
            ) : (
              'Cập nhật ngay'
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
