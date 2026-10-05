import noDirectRoomStatusUpdate from './no-direct-room-status-update.js'

/**
 * ESLint plugin nội bộ — chứa các rule cứng hoá quy ước kiến trúc.
 * Đăng ký trong eslint.config.js qua `plugins: { 'lovable-internal': lovableInternal }`.
 */
export default {
  rules: {
    'no-direct-room-status-update': noDirectRoomStatusUpdate,
  },
}
