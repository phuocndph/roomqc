/**
 * Pure helpers cho realtime session takeover detection ở Room Check Lean.
 * Tách khỏi component để test dễ và tái sử dụng giữa Overview / Inspection.
 */

export interface SessionLike {
  user_id: string
  user_name?: string | null
}

/**
 * Trả về true nếu session hiện tại đang được giữ bởi user khác user hiện tại.
 * - null session => không có ai giữ => false
 * - không có currentUserId => false (chưa biết là ai)
 */
export function isSessionTakenOver(
  session: SessionLike | null | undefined,
  currentUserId: string | null | undefined,
): boolean {
  if (!session) return false
  if (!currentUserId) return false
  return session.user_id !== currentUserId
}

/**
 * Lấy tên người tiếp quản (nếu có), fallback null.
 */
export function getTakenOverByName(
  session: SessionLike | null | undefined,
  currentUserId: string | null | undefined,
): string | null {
  if (!isSessionTakenOver(session, currentUserId)) return null
  return session?.user_name ?? null
}
