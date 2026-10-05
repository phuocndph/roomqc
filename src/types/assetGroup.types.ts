/**
 * Asset Group — 9 nhóm nghiệp vụ (Decision v1.2 §5)
 * Đồng bộ với enum `public.asset_group` ở DB (Đợt A migration).
 */
export type AssetGroup =
  | 'linen'
  | 'consumable_free'
  | 'minibar'
  | 'stationery'
  | 'equipment_large'
  | 'electronic_accessory'
  | 'furniture'
  | 'glassware'
  | 'bathroom_hardware'

export const ASSET_GROUP_LABELS: Record<AssetGroup, string> = {
  linen: 'Khăn / linen',
  consumable_free: 'Đồ tiêu hao miễn phí',
  minibar: 'Minibar',
  stationery: 'Văn phòng phẩm',
  equipment_large: 'Thiết bị lớn',
  electronic_accessory: 'Phụ kiện điện tử',
  furniture: 'Nội thất',
  glassware: 'Đồ thuỷ tinh / sứ',
  bathroom_hardware: 'Thiết bị phòng tắm',
}

/** Bucket trong jsonb của room_checks */
export type IssueBucket =
  | 'items_missing'
  | 'items_damaged'
  | 'items_lost'
  | 'items_consumed'
  | 'items_replaced'
  | 'items_sent_to_laundry'

/** UI action key dạng `<group>.<action>` — dùng để map sang bucket */
export type UiActionKey = string
