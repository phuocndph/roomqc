import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Announcement, AnnouncementVariant } from '@/types/announcement.types';
import { useDismissAnnouncement } from '@/hooks/announcements/useActiveAnnouncements';

const variantClass: Record<AnnouncementVariant, string> = {
  info: 'bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/40 dark:text-blue-100 dark:border-blue-900',
  success:
    'bg-green-50 text-green-900 border-green-200 dark:bg-green-950/40 dark:text-green-100 dark:border-green-900',
  warning:
    'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-900',
  promo:
    'bg-primary/10 text-foreground border-primary/30',
};

interface Props {
  announcement: Announcement;
  position?: 'top' | 'bottom';
}

export function AnnouncementBanner({ announcement: a, position = 'top' }: Props) {
  const dismiss = useDismissAnnouncement();

  const handleCta = (e: React.MouseEvent) => {
    if (!a.cta_url) return;
    if (a.cta_url.startsWith('http')) {
      e.preventDefault();
      window.open(a.cta_url, '_blank', 'noopener');
    }
  };

  return (
    <div
      className={cn(
        'border-b px-3 py-2 text-sm flex items-center gap-3',
        position === 'bottom' && 'border-b-0 border-t',
        variantClass[a.variant],
      )}
      role="status"
    >
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium truncate">{a.title}</span>
        {a.body && <span className="text-xs opacity-80 truncate">{a.body}</span>}
        {a.cta_url && a.cta_label && (
          <a
            href={a.cta_url}
            onClick={handleCta}
            className="text-xs underline font-medium hover:opacity-80 shrink-0"
          >
            {a.cta_label} →
          </a>
        )}
      </div>
      {a.is_dismissible && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0"
          onClick={() => dismiss.mutate(a.id)}
          aria-label="Đóng thông báo"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}
