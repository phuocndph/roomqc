/**
 * Touch & Swipe Standards v1
 * Hằng số chung cho mọi tương tác chạm/vuốt trong dự án.
 *
 * Quy tắc sử dụng:
 * 1. KHÔNG lồng <PullToRefresh> bên trong scrollable container có <SwipeableCard> con.
 *    Luôn để PullToRefresh ở root, SwipeableCard là leaf.
 * 2. Trang nặng tương tác (Inventory dashboard, Room check) → KHÔNG bọc PullToRefresh.
 * 3. Mọi component vuốt phải dùng các hằng số dưới đây thay vì hard-code.
 */

/** Khoảng cách tối thiểu (px) để xác nhận một thao tác vuốt ngang. */
export const SWIPE_THRESHOLD_PX = 60

/** Tốc độ tối thiểu (px/ms) để xác nhận swipe — tránh kích hoạt khi vuốt vô tình. */
export const SWIPE_VELOCITY_MIN = 0.3

/**
 * Tỉ lệ góc vuốt: chỉ kích hoạt swipe ngang khi |deltaX| > |deltaY| * SWIPE_ANGLE_RATIO.
 * Giá trị 1.5 ≈ giới hạn 33° so với phương ngang → tránh nhầm với cuộn dọc.
 */
export const SWIPE_ANGLE_RATIO = 1.5

/** Khoảng "dead zone" cho pull-to-refresh — không hiển thị indicator khi kéo dưới mức này. */
export const PULL_DEAD_ZONE_PX = 20

/** Ngưỡng kích hoạt làm mới khi pull-to-refresh. */
export const PULL_THRESHOLD_PX = 80

/** Tỉ lệ hướng pull: chỉ pull-down khi deltaY > deltaX * PULL_DIRECTION_RATIO. */
export const PULL_DIRECTION_RATIO = 2
