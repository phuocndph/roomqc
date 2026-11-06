import type { RoomOperationResult } from './room-operation-command'

/** Adjustment text is sent with the core command, never written after commit. */
export function bookingAdjustmentNotes(operation: 'checkin' | 'checkout', chargeNote?: string, damageNote?: string) {
  const notes: string[] = []
  if (chargeNote?.trim()) notes.push(operation === 'checkin'
    ? `[Điều chỉnh phụ thu check-in sớm: ${chargeNote}]` : `[Điều chỉnh phụ thu checkout: ${chargeNote}]`)
  if (operation === 'checkout' && damageNote?.trim()) notes.push(`[Điều chỉnh phí đền bù: ${damageNote}]`)
  return notes.length ? notes.join('\n') : undefined
}

/** A durable source suppresses legacy browser sends, including during recovery. */
export async function runBookingOperationFollowUps(
  result: RoomOperationResult,
  isCurrent: () => boolean,
  tasks: Array<() => PromiseLike<unknown>>,
) {
  const members = result.operation === 'group_checkout' && Array.isArray(result.results) ? result.results : [result]
  const notificationQueued = members.length > 0 && members.every(value => value && typeof value === 'object'
    && typeof value.notification_event_id === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.notification_event_id)
    && value.notification_state === 'queued')
  if (notificationQueued) return { replayed: result.replayed, needsReview: false, notificationQueued: true }
  if (result.replayed) return { replayed: true, needsReview: true }
  let needsReview = false
  const expired = Symbol('follow-up deadline')
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<typeof expired>(resolve => { timer = setTimeout(() => resolve(expired), 10000) })
  try {
    for (const task of tasks) {
      if (!isCurrent()) return { replayed: false, needsReview: true }
      try {
        const value = await Promise.race([Promise.resolve().then(task), deadline])
        if (value === expired) return { replayed: false, needsReview: true }
        if (value && typeof value === 'object' && 'error' in value && value.error) needsReview = true
      } catch {
        // The core receipt remains successful even if a separate task fails.
        needsReview = true
      }
    }
  } finally { clearTimeout(timer) }
  return { replayed: false, needsReview }
}

export function bookingOperationDescription(
  followUps: { replayed: boolean; needsReview: boolean; notificationQueued?: boolean },
  checkout = false,
) {
  if (followUps.notificationQueued) return (followUps.replayed ? 'Đã xác nhận giao dịch trước đó. ' : 'Giao dịch đã lưu. ')
    + 'Thông báo đã xếp hàng, chưa xác nhận gửi thành công.' + (checkout ? ' Hóa đơn có kết quả riêng; vui lòng kiểm tra trước khi in.' : '')
  if (followUps.replayed) return 'Đã xác nhận giao dịch trước đó. Kiểm tra riêng ghi chú, hóa đơn và thông báo; không thực hiện lại giao dịch.'
  if (followUps.needsReview) return 'Giao dịch đã lưu. Một số tác vụ liên quan chưa xác nhận hoàn tất; cần kiểm tra riêng, không thực hiện lại giao dịch.'
  return checkout ? 'Giao dịch đã lưu. Hóa đơn và thông báo có kết quả riêng; vui lòng kiểm tra trước khi in.' : undefined
}
