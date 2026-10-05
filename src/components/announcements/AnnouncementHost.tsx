import { useEffect, useState } from 'react';
import { useActiveAnnouncements } from '@/hooks/announcements/useActiveAnnouncements';
import { AnnouncementPopup } from './AnnouncementPopup';
import { AnnouncementBanner } from './AnnouncementBanner';
import { APP_VERSION, compareAppVersions } from '@/lib/app-version';

const VERSION_SEEN_KEY = 'announcement_version_seen_v1';

export function AnnouncementHost({ slot }: { slot: 'top' | 'bottom' | 'popup' }) {
  const { data = [] } = useActiveAnnouncements();
  const [popupShown, setPopupShown] = useState<string | null>(null);

  // Find next popup announcement to show
  const popupCandidate = data.find((a) => {
    if (a.placement !== 'popup_center') return false;
    if (a.kind === 'version_update') {
      // Only show version popup if user hasn't seen this version yet
      if (!a.version) return true;
      const seen = localStorage.getItem(VERSION_SEEN_KEY);
      if (seen === a.version) return false;
      // Don't show update popup for older/equal version than current
      // (avoid stale announcements after upgrade)
      return compareAppVersions(a.version, APP_VERSION) >= 0;
    }
    return true;
  });

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
        announcement={popupCandidate}
        open={popupShown === popupCandidate.id}
        onOpenChange={(open) => {
          if (!open) {
            setPopupShown(null);
            if (popupCandidate.kind === 'version_update' && popupCandidate.version) {
              localStorage.setItem(VERSION_SEEN_KEY, popupCandidate.version);
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
