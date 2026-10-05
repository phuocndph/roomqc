export type AnnouncementKind = 'promo_popup' | 'version_update' | 'ad_banner' | 'system_notice';
export type AnnouncementPlacement = 'popup_center' | 'top_banner' | 'bottom_strip' | 'inline_card';
export type AnnouncementVariant = 'info' | 'success' | 'warning' | 'promo';
export type AnnouncementAudience =
  | 'all'
  | 'tenant_owner'
  | 'manager'
  | 'staff'
  | 'trial_only'
  | 'expired_only';

export type AnnouncementHighlightColor = 'green' | 'primary' | 'amber' | 'red';

export interface AnnouncementHighlight {
  icon?: string;
  color?: AnnouncementHighlightColor;
  title: string;
  subtitle?: string;
}

export interface AnnouncementContact {
  type: 'phone' | 'email';
  value: string;
}

export interface AnnouncementContent {
  highlights?: AnnouncementHighlight[];
  contacts?: AnnouncementContact[];
  contact_label?: string;
}

export interface Announcement {
  id: string;
  kind: AnnouncementKind;
  placement: AnnouncementPlacement;
  variant: AnnouncementVariant;
  title: string;
  body: string | null;
  cta_label: string | null;
  cta_url: string | null;
  image_url: string | null;
  icon: string | null;
  audience: AnnouncementAudience;
  is_active: boolean;
  is_dismissible: boolean;
  starts_at: string | null;
  ends_at: string | null;
  version: string | null;
  priority: number;
  content: AnnouncementContent | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AnnouncementInput = Omit<
  Announcement,
  'id' | 'created_at' | 'updated_at' | 'created_by' | 'content'
> & { content?: AnnouncementContent | null };

export const HIGHLIGHT_ICON_OPTIONS = [
  'CheckCircle2',
  'Calendar',
  'Gift',
  'Sparkles',
  'Star',
  'Clock',
  'Zap',
  'Bell',
] as const;

export const HIGHLIGHT_COLOR_OPTIONS: AnnouncementHighlightColor[] = [
  'green',
  'primary',
  'amber',
  'red',
];

export const ANNOUNCEMENT_KIND_LABEL: Record<AnnouncementKind, string> = {
  promo_popup: 'Popup chương trình',
  version_update: 'Cập nhật phiên bản',
  ad_banner: 'Banner quảng cáo',
  system_notice: 'Thông báo hệ thống',
};

export const ANNOUNCEMENT_PLACEMENT_LABEL: Record<AnnouncementPlacement, string> = {
  popup_center: 'Popup giữa màn hình',
  top_banner: 'Banner trên cùng',
  bottom_strip: 'Dải dưới cùng',
  inline_card: 'Thẻ trong Dashboard',
};

export const ANNOUNCEMENT_VARIANT_LABEL: Record<AnnouncementVariant, string> = {
  info: 'Thông tin',
  success: 'Thành công',
  warning: 'Cảnh báo',
  promo: 'Khuyến mãi',
};

export const ANNOUNCEMENT_AUDIENCE_LABEL: Record<AnnouncementAudience, string> = {
  all: 'Tất cả người dùng',
  tenant_owner: 'Chủ khách sạn',
  manager: 'Quản lý',
  staff: 'Nhân viên',
  trial_only: 'Đang dùng thử',
  expired_only: 'Đã hết hạn',
};
