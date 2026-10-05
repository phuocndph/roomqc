import * as Icons from 'lucide-react';
import { X, Phone, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  AnnouncementContent,
  AnnouncementHighlightColor,
  AnnouncementPlacement,
  AnnouncementVariant,
} from '@/types/announcement.types';

interface PreviewProps {
  title: string;
  body?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  imageUrl?: string;
  icon?: string;
  variant: AnnouncementVariant;
  placement: AnnouncementPlacement;
  isDismissible: boolean;
  content?: AnnouncementContent | null;
}

const colorClass: Record<AnnouncementHighlightColor, string> = {
  green: 'text-green-600',
  primary: 'text-primary',
  amber: 'text-amber-600',
  red: 'text-red-600',
};

const variantClass: Record<AnnouncementVariant, string> = {
  info: 'bg-blue-50 text-blue-900 border-blue-200 dark:bg-blue-950/40 dark:text-blue-100 dark:border-blue-900',
  success:
    'bg-green-50 text-green-900 border-green-200 dark:bg-green-950/40 dark:text-green-100 dark:border-green-900',
  warning:
    'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:border-amber-900',
  promo: 'bg-primary/10 text-foreground border-primary/30',
};

function PopupPreview({
  title,
  body,
  ctaLabel,
  ctaUrl,
  imageUrl,
  icon,
  isDismissible,
  content,
}: PreviewProps) {
  const Icon =
    (icon && (Icons as unknown as Record<string, Icons.LucideIcon>)[icon]) ||
    Icons.Megaphone;
  const highlights = content?.highlights ?? [];
  const contacts = content?.contacts ?? [];
  return (
    <div className="relative bg-background border rounded-lg shadow-lg p-5 max-w-sm mx-auto">
      <div className="flex items-center justify-center mb-3">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
      <h3 className="text-center text-base font-semibold leading-tight mb-1">
        {title || 'Tiêu đề thông báo'}
      </h3>
      {body && (
        <p className="text-center text-xs text-muted-foreground whitespace-pre-line mb-3">
          {body}
        </p>
      )}
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className="w-full rounded-md border max-h-32 object-cover mb-3"
        />
      )}
      {highlights.length > 0 && (
        <div className="bg-muted/50 rounded-lg p-3 space-y-2 mb-3">
          {highlights.map((h, idx) => {
            const HIcon =
              (h.icon && (Icons as unknown as Record<string, Icons.LucideIcon>)[h.icon]) ||
              Icons.CheckCircle2;
            return (
              <div key={idx} className="flex items-start gap-2">
                <HIcon className={cn('h-4 w-4 mt-0.5 shrink-0', colorClass[h.color || 'green'])} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium leading-snug">{h.title || 'Điểm nổi bật'}</p>
                  {h.subtitle && (
                    <p className="text-[11px] text-muted-foreground leading-snug">{h.subtitle}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {contacts.length > 0 && (
        <div className="border-t pt-2 space-y-1 mb-3">
          {content?.contact_label && (
            <p className="text-[11px] text-muted-foreground font-medium">{content.contact_label}</p>
          )}
          {contacts.map((c, idx) => (
            <div key={idx} className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {c.type === 'phone' ? <Phone className="h-3 w-3" /> : <Mail className="h-3 w-3" />}
              <span className="break-all">{c.value}</span>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2 mt-3">
        {isDismissible && (
          <p className="text-xs text-muted-foreground">☐ Không hiển thị lại</p>
        )}
        {ctaUrl ? (
          <>
            <button
              type="button"
              className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium"
              disabled
            >
              {ctaLabel || 'Xem chi tiết'}
            </button>
            <button
              type="button"
              className="w-full border rounded-md py-2 text-sm"
              disabled
            >
              Để sau
            </button>
          </>
        ) : (
          <button
            type="button"
            className="w-full bg-primary text-primary-foreground rounded-md py-2 text-sm font-medium"
            disabled
          >
            {ctaLabel || 'Đã hiểu'}
          </button>
        )}
      </div>
    </div>
  );
}

function BannerPreview({
  title,
  body,
  ctaLabel,
  ctaUrl,
  variant,
  isDismissible,
  position,
}: PreviewProps & { position: 'top' | 'bottom' }) {
  return (
    <div
      className={cn(
        'border-b px-3 py-2 text-sm flex items-center gap-3 rounded-md',
        position === 'bottom' && 'border-b-0 border-t',
        variantClass[variant],
      )}
    >
      <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium truncate">{title || 'Tiêu đề banner'}</span>
        {body && <span className="text-xs opacity-80 truncate">{body}</span>}
        {ctaUrl && ctaLabel && (
          <span className="text-xs underline font-medium shrink-0">
            {ctaLabel} →
          </span>
        )}
      </div>
      {isDismissible && (
        <button aria-label="Đóng"
          type="button"
          className="h-6 w-6 shrink-0 inline-flex items-center justify-center opacity-60"
          disabled
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

function InlineCardPreview({
  title,
  body,
  ctaLabel,
  imageUrl,
  icon,
  variant,
}: PreviewProps) {
  const Icon =
    (icon && (Icons as unknown as Record<string, Icons.LucideIcon>)[icon]) ||
    Icons.Megaphone;
  return (
    <div className={cn('border rounded-lg p-4 space-y-2', variantClass[variant])}>
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5" />
        <h4 className="font-semibold text-sm">{title || 'Tiêu đề thẻ'}</h4>
      </div>
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          className="w-full rounded-md max-h-32 object-cover"
        />
      )}
      {body && (
        <p className="text-xs whitespace-pre-line opacity-80">{body}</p>
      )}
      {ctaLabel && (
        <p className="text-xs underline font-medium">{ctaLabel} →</p>
      )}
    </div>
  );
}

export function AnnouncementLivePreview(props: PreviewProps) {
  const wrapper =
    'bg-muted/40 border rounded-lg p-4 min-h-[200px] flex items-center justify-center';

  if (props.placement === 'popup_center') {
    return (
      <div className={wrapper}>
        <PopupPreview {...props} />
      </div>
    );
  }
  if (props.placement === 'top_banner') {
    return (
      <div className={wrapper}>
        <div className="w-full">
          <BannerPreview {...props} position="top" />
          <div className="mt-2 text-center text-[10px] text-muted-foreground uppercase tracking-wide">
            (Hiển thị trên cùng trang, dưới Header)
          </div>
        </div>
      </div>
    );
  }
  if (props.placement === 'bottom_strip') {
    return (
      <div className={wrapper}>
        <div className="w-full">
          <BannerPreview {...props} position="bottom" />
          <div className="mt-2 text-center text-[10px] text-muted-foreground uppercase tracking-wide">
            (Hiển thị dưới cùng trang, trên Bottom Nav)
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className={wrapper}>
      <div className="w-full max-w-sm">
        <InlineCardPreview {...props} />
      </div>
    </div>
  );
}
