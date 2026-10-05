import { z } from 'zod'

/**
 * Shared Zod schema cho form Phòng — dùng chung giữa
 * `RoomFormPage` (desktop) và `MobileRoomFormPage` (mobile wizard).
 *
 * Lý do tách riêng:
 * - Trước đây 2 schema gần như giống hệt nhau bị lệch nhỏ
 *   (mobile thiếu validation min/max, desktop có i18n, dễ drift).
 * - Bắt buộc cùng nguồn để mọi thay đổi (thêm field, đổi rule)
 *   phản ánh đồng bộ cả 2 luồng.
 *
 * Desktop có thể i18n message qua `createRoomSchema(t)`;
 * Mobile dùng message tiếng Việt cố định qua `roomFormSchema`.
 */
export const buildRoomFormSchema = (
  msg: (key: RoomFormMessageKey) => string,
) =>
  z.object({
    room_number: z.string().min(1, msg('roomNumberRequired')),
    room_type: z.string().min(1, msg('roomTypeRequired')),
    floor: z.number().min(1, msg('floorMin')),
    area_sqm: z.number().min(0, msg('areaMin')).optional(),
    max_guests: z.number().min(1, msg('maxGuestsMin')),
    base_price: z.number().min(0, msg('basePriceMin')),
    bed_type: z.string().optional(),
    view_type: z.string().optional(),
    has_window: z.boolean(),
    has_balcony: z.boolean(),
    smoking_allowed: z.boolean(),
    notes: z.string().optional(),
  })

export type RoomFormMessageKey =
  | 'roomNumberRequired'
  | 'roomTypeRequired'
  | 'floorMin'
  | 'areaMin'
  | 'maxGuestsMin'
  | 'basePriceMin'

const VI_MESSAGES: Record<RoomFormMessageKey, string> = {
  roomNumberRequired: 'Số phòng là bắt buộc',
  roomTypeRequired: 'Loại phòng là bắt buộc',
  floorMin: 'Tầng phải >= 1',
  areaMin: 'Diện tích phải >= 0',
  maxGuestsMin: 'Số khách tối đa phải >= 1',
  basePriceMin: 'Giá cơ bản phải >= 0',
}

/** Schema mặc định tiếng Việt — dùng cho MobileRoomFormPage hoặc nơi không cần i18n. */
export const roomFormSchema = buildRoomFormSchema((k) => VI_MESSAGES[k])

export type RoomFormData = z.infer<typeof roomFormSchema>
