/**
 * ESLint rule: no-direct-room-status-update
 *
 * Cấm cập nhật trực tiếp `status` của các bảng có state machine v2:
 *   - rooms
 *   - room_bookings
 *   - housekeeping_tasks
 *
 * Phải đi qua RPC chuyển trạng thái:
 *   - transition_room_status
 *   - transition_booking_status
 *   - transition_task_status
 *
 * Lý do: bypass mất audit log + bỏ qua validate transition + có thể gây xung đột
 * với khách đang ở phòng. Xem finding F-FSM-01/02 trong docs/architecture/09-refactor/findings.md.
 *
 * Pattern bị bắt:
 *   supabase.from('rooms').update({ status: '...' })
 *   supabase.from('room_bookings').update({ status: '...' })
 *   supabase.from('housekeeping_tasks').update({ status: '...' })
 */

const FORBIDDEN_TABLES = new Set(['rooms', 'room_bookings', 'housekeeping_tasks'])
const RPC_HINT = {
  rooms: 'transition_room_status',
  room_bookings: 'transition_booking_status',
  housekeeping_tasks: 'transition_task_status',
}

/** Tìm chuỗi từ `.from('X').update(...)` trong cùng 1 method chain. */
function findFromTableUpThePropertyChain(node) {
  // node là CallExpression của .update(...)
  let cur = node.callee
  // cur = MemberExpression (foo.update)
  while (cur && cur.type === 'MemberExpression') {
    const obj = cur.object
    if (obj && obj.type === 'CallExpression' && obj.callee && obj.callee.type === 'MemberExpression') {
      const calleeProp = obj.callee.property
      if (calleeProp && calleeProp.name === 'from' && obj.arguments.length > 0) {
        const arg = obj.arguments[0]
        if (arg.type === 'Literal' && typeof arg.value === 'string') {
          return arg.value
        }
      }
      cur = obj.callee
      continue
    }
    cur = obj
  }
  return null
}

function objectHasStatusKey(arg) {
  if (!arg || arg.type !== 'ObjectExpression') return false
  return arg.properties.some(
    (p) =>
      p.type === 'Property' &&
      ((p.key.type === 'Identifier' && p.key.name === 'status') ||
        (p.key.type === 'Literal' && p.key.value === 'status')),
  )
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Cấm update trực tiếp `status` của bảng có state machine — phải qua RPC transition_*',
    },
    messages: {
      forbidden:
        '[FSM] Không cập nhật trực tiếp `{{table}}.status`. Hãy gọi RPC `{{rpc}}` (hoặc hook tương ứng như useRoomTransition) để giữ audit log + validate transition. Xem F-FSM-01/02.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type !== 'MemberExpression' ||
          node.callee.property.type !== 'Identifier' ||
          node.callee.property.name !== 'update'
        ) {
          return
        }
        if (node.arguments.length === 0) return
        if (!objectHasStatusKey(node.arguments[0])) return
        const table = findFromTableUpThePropertyChain(node)
        if (!table || !FORBIDDEN_TABLES.has(table)) return
        context.report({
          node,
          messageId: 'forbidden',
          data: { table, rpc: RPC_HINT[table] },
        })
      },
    }
  },
}
