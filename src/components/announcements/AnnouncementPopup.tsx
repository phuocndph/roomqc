import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import * as Icons from 'lucide-react';
import { Phone, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Announcement, AnnouncementHighlightColor } from '@/types/announcement.types';
import { useDismissAnnouncement } from '@/hooks/announcements/useActiveAnnouncements';

interface Props {
  announcement: Announcement;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const colorClass: Record<AnnouncementHighlightColor, string> = {
  green: 'text-green-600',
  primary: 'text-primary',
  amber: 'text-amber-600',
  red: 'text-red-600',
};

function HighlightIcon({ name, color }: { name?: string; color?: AnnouncementHighlightColor }) {
  const Icon =
    (name && (Icons as unknown as Record<string, Icons.LucideIcon>)[name]) || Icons.CheckCircle2;
  return <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', colorClass[color || 'green'])} />;
}

export function AnnouncementPopup({ announcement: a, open, onOpenChange }: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const dismiss = useDismissAnnouncement();

  const HeaderIcon =
    (a.icon && (Icons as unknown as Record<string, Icons.LucideIcon>)[a.icon]) || Icons.Megaphone;

  const handleClose = () => {
    if (dontShowAgain && a.is_dismissible) {
      dismiss.mutate(a.id);
    }
    onOpenChange(false);
  };

  const handleCta = () => {
    if (a.cta_url) {
      if (a.cta_url.startsWith('http')) {
        window.open(a.cta_url, '_blank', 'noopener');
      } else {
        window.location.href = a.cta_url;
      }
    }
    handleClose();
  };

  const highlights = a.content?.highlights ?? [];
  const contacts = a.content?.contacts ?? [];
  const hasRichContent = highlights.length > 0 || contacts.length > 0;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <AlertDialogContent className="max-w-md w-[calc(100vw-2rem)] max-h-[90dvh] overflow-y-auto p-5 sm:p-6">
        <AlertDialogHeader className="space-y-3">
          <div className="flex items-center justify-center">
            <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
              <HeaderIcon className="h-7 w-7 text-primary" />
            </div>
          </div>
          <AlertDialogTitle className="text-center text-lg sm:text-xl leading-tight">
            {a.title}
          </AlertDialogTitle>
          {a.body && (
            <AlertDialogDescription className="text-center text-sm text-muted-foreground whitespace-pre-line">
              {a.body}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        {a.image_url && (
          <img
            src={a.image_url}
            alt={a.title}
            className="w-full rounded-md border max-h-60 object-cover"
          />
        )}

        {hasRichContent && (
          <div className="space-y-4">
            {highlights.length > 0 && (
              <div className="space-y-3 bg-muted/50 rounded-lg p-3 sm:p-4">
                {highlights.map((h, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <HighlightIcon name={h.icon} color={h.color} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-sm text-foreground leading-snug">
                        {h.title}
                      </p>
                      {h.subtitle && (
                        <p className="text-muted-foreground text-xs mt-0.5 leading-snug">
                          {h.subtitle}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {contacts.length > 0 && (
              <div className="border-t pt-3 space-y-2">
                {a.content?.contact_label && (
                  <p className="text-xs text-muted-foreground font-medium">
                    {a.content.contact_label}
                  </p>
                )}
                {contacts.map((c, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 text-xs text-muted-foreground"
                  >
                    {c.type === 'phone' ? (
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                    )}
                    <span className="break-all">{c.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 mt-2">
          {a.is_dismissible && (
            <div className="flex items-center gap-2">
              <Checkbox
                id={`dont-show-${a.id}`}
                checked={dontShowAgain}
                onCheckedChange={(v) => setDontShowAgain(v === true)}
              />
              <label
                htmlFor={`dont-show-${a.id}`}
                className="text-xs text-muted-foreground cursor-pointer leading-none"
              >
                Không hiển thị lại
              </label>
            </div>
          )}
          {a.cta_url ? (
            <>
              <AlertDialogAction onClick={handleCta} className="w-full">
                {a.cta_label || 'Xem chi tiết'}
              </AlertDialogAction>
              <AlertDialogCancel onClick={handleClose} className="w-full mt-0">
                Để sau
              </AlertDialogCancel>
            </>
          ) : (
            <Button onClick={handleClose} className="w-full">
              {a.cta_label || 'Đã hiểu'}
            </Button>
          )}
          {a.kind === 'version_update' && (
            <a
              href="/whats-new"
              className="text-xs text-muted-foreground hover:text-primary text-center underline-offset-2 hover:underline"
              onClick={() => handleClose()}
            >
              Xem tất cả thay đổi →
            </a>
          )}
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
