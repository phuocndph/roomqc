# Design System

## Triết lý
Enterprise SaaS Minimalist. Không icon/emoji trong tab. Màu chữ semantic thay vì badge nền.

## Tokens (HSL only)
File `src/index.css`:
```css
:root {
  --background: ...;
  --foreground: ...;
  --primary: ...;
  --secondary: ...;
  --muted: ...;
  --accent: ...;
  --destructive: ...;
  --border: ...;
  --ring: ...;
}
```

`tailwind.config.ts` map các token → class `bg-background`, `text-foreground`...

## Quy tắc semantic màu
| Trạng thái | Class |
|---|---|
| OK / Đủ / Hoàn thành | `text-green-600` |
| Lỗi / Thiếu / Thất bại | `text-red-600` |
| Cảnh báo / Chờ | `text-amber-600` |

## Spacing & sizing
- Padding compact: `p-2`, `p-3`, `p-4`
- Input/Button height: `h-8` hoặc `h-9`
- Font: `text-xs` label, `text-sm` content, `font-mono text-xs` cho mã code
- Currency format: `1.700.000 ₫` (chấm thousands)

## Component conventions
- Thay `Card` bằng `div` với `border rounded-lg` hoặc `border-b`
- Mọi nút trong form: `type="button"` (trừ submit chính)
- Filter dùng `Select` thay button group
- Touch target ≥ 44px ở mobile

## Mobile-first
- Portrait priority
- Bottom sheet thay dialog ở mobile
- Sticky footer cho CTA chính

## Sidebar
Memory `sidebar-navigation-architecture`: nhãn UPPERCASE, `tracking-wide`, `text-xs`.

## Memory liên quan
- `enterprise-saas-and-localization-standards-spec`
- `minimalist-ui-icon-reduction-spec`
- `housekeeping-and-inventory-ui-spec`
- `checkout-ui-ux-standards`
- `room-check-mobile-ui-standards-v2`
- `housekeeping-staff-dashboard-v1`
- `reception-mobile-experience-v1`
