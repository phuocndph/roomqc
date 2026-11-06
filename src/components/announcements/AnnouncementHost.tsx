import { useEffect, useState } from 'react';
import { useActiveAnnouncements, useDismissAnnouncement } from '@/hooks/announcements/useActiveAnnouncements';
import { AnnouncementPopup } from './AnnouncementPopup';
import { AnnouncementBanner } from './AnnouncementBanner';
import { APP_VERSION, compareAppVersions } from '@/lib/app-version';
import { useUser } from '@/hooks/useUser';
import { announcementScope, isAnnouncementDismissed, pausePromos, promoPaused } from '@/lib/announcement-state';

const VERSION_SEEN_KEY = 'announcement_version_seen_v1';

export function AnnouncementHost({ slot }: { slot: 'top' | 'bottom' | 'popup' }) {
  const { user } = useUser();
  const scope = user ? announcementScope(user.id, user.tenant_id) : null;
  return <ScopedAnnouncementHost key={scope ?? 'anonymous'} slot={slot} scope={scope} />;
}

function ScopedAnnouncementHost({ slot, scope }: { slot: 'top' | 'bottom' | 'popup'; scope: string | null }) {
  const { data = [], isSuccess } = useActiveAnnouncements();
  const dismiss = useDismissAnnouncement();
  const [popupShown, setPopupShown] = useState<string | null>(null);
  const [closedPopups, setClosedPopups] = useState<Set<string>>(() => new Set());
  const [promosClosed, setPromosClosed] = useState(() => !!scope && promoPaused(scope));

  // Find next popup announcement to show
  const popupCandidate = scope && isSuccess ? data.find((a) => {
    if (a.placement !== 'popup_center' || closedPopups.has(a.id)) return false;
    if (isAnnouncementDismissed(scope, a.id)) return false;
    if (a.kind === 'promo_popup' && (promosClosed || promoPaused(scope))) return false;
    if (a.kind === 'version_update') {
      // Only show version popup if user hasn't seen this version yet
      if (!a.version) return true;
      let seen: string | null = null;
      try { seen = localStorage.getItem(`${VERSION_SEEN_KEY}:${scope}`) } catch { /* Allow the notice when storage is unavailable. */ }
      if (seen === a.version) return false;
      // Don't show update popup for older/equal version than current
      // (avoid stale announcements after upgrade)
      return compareAppVersions(a.version, APP_VERSION) >= 0;
    }
    return true;
  }) : undefined;

  useEffect(() => {
    if (slot === 'popup' && popupCandidate && popupShown !== popupCandidate.id) {
      const t = setTimeout(() => setPopupShown(popupCandidate.id), 800);
      return () => clearTimeout(t);
    }
  }, [popupCandidate, popupShown, slot]);

  if (slot === 'popup') {
    if (!popupCandidate) return null;
    return (
      <AnnouncementPopup
        key={popupCandidate.id}
        announcement={popupCandidate}
        open={popupShown === popupCandidate.id}
        onOpenChange={(open) => {
          if (!open) {
            setClosedPopups(previous => new Set(previous).add(popupCandidate.id));
            setPopupShown(null);
            if (popupCandidate.kind === 'promo_popup' && scope) {
              pausePromos(scope);
              setPromosClosed(true);
              dismiss.mutate(popupCandidate.id);
            }
            if (popupCandidate.kind === 'version_update' && popupCandidate.version) {
              try { localStorage.setItem(`${VERSION_SEEN_KEY}:${scope}`, popupCandidate.version) } catch { /* closedPopups still prevents a loop. */ }
            }
          }
        }}
      />
    );
  }

  const placement = slot === 'top' ? 'top_banner' : 'bottom_strip';
  const banners = data.filter((a) => a.placement === placement);
  if (!banners.length) return null;
  return (
    <>
      {banners.map((a) => (
        <AnnouncementBanner key={a.id} announcement={a} position={slot === 'top' ? 'top' : 'bottom'} />
      ))}
    </>
  );
}
