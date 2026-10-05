// Centralized presentation helpers for Distribution Orders (UI v2)
// Maps 5/6 raw statuses → 3 visible buckets + computes "Việc cần làm" per role.

import type { DistributionOrderStatus } from '@/types/distribution.types'
import type { RouteStatus } from '@/types/route-batch.types'

export type AnyOrderStatus = DistributionOrderStatus | RouteStatus

export type DisplayStatus = 'preparing' | 'delivering' | 'done' | 'cancelled'

export interface DisplayStatusInfo {
  display: DisplayStatus
  label: string
  textClass: string
  dotClass: string
  subLabel?: string
}

export function getDisplayStatus(
  status: AnyOrderStatus,
  opts?: { completed?: number; total?: number; assignedToName?: string | null }
): DisplayStatusInfo {
  const completed = opts?.completed ?? 0
  const total = opts?.total ?? 0

  switch (status) {
    case 'pending':
      return {
        display: 'preparing',
        label: 'Chờ xuất kho',
        textClass: 'text-amber-600 dark:text-amber-400',
        dotClass: 'bg-amber-500',
        subLabel: opts?.assignedToName ? `Cho ${opts.assignedToName}` : 'Chưa phân công',
      }
    case 'released':
      return {
        display: 'preparing',
        label: 'Đã xuất kho — chờ NV nhận',
        textClass: 'text-amber-600 dark:text-amber-400',
        dotClass: 'bg-amber-500',
        subLabel: opts?.assignedToName ? `Chờ ${opts.assignedToName} xác nhận` : 'Chờ nhân viên xác nhận',
      }
    case 'in_progress':
      return {
        display: 'delivering',
        label: 'Đang giao hàng',
        textClass: 'text-blue-600 dark:text-blue-400',
        dotClass: 'bg-blue-500',
        subLabel: total > 0 ? `${completed}/${total} phòng` : undefined,
      }
    case 'completed':
      return {
        display: 'done',
        label: 'Hoàn thành',
        textClass: 'text-green-600 dark:text-green-400',
        dotClass: 'bg-green-500',
        subLabel: 'Chờ đóng phiếu',
      }
    case 'closed':
      return {
        display: 'done',
        label: 'Hoàn thành',
        textClass: 'text-green-600 dark:text-green-400',
        dotClass: 'bg-green-500',
        subLabel: 'Đã đóng phiếu',
      }
    case 'cancelled':
      return {
        display: 'cancelled',
        label: 'Đã huỷ',
        textClass: 'text-muted-foreground',
        dotClass: 'bg-muted-foreground',
      }
    default:
      return {
        display: 'preparing',
        label: 'Không rõ',
        textClass: 'text-muted-foreground',
        dotClass: 'bg-muted-foreground',
      }
  }
}

// "Việc cần làm" — short imperative per row, role-aware
export interface PendingTaskInput {
  status: AnyOrderStatus
  hasAssignee: boolean
  assignedToName?: string | null
  isCurrentUserAssignee?: boolean
  isCurrentUserStorekeeper?: boolean
  isCurrentUserCreator?: boolean
  totalRooms?: number
  completedRooms?: number
}

export interface PendingTaskInfo {
  text: string
  textClass: string
  // For sorting "Cần làm ngay" tab
  priority: number // 0 = none, 1+ = needs action; higher = more urgent
}

export function getPendingTask(input: PendingTaskInput): PendingTaskInfo {
  const {
    status,
    hasAssignee,
    assignedToName,
    isCurrentUserAssignee = false,
    isCurrentUserStorekeeper = false,
    completedRooms = 0,
    totalRooms = 0,
  } = input

  const muted = 'text-muted-foreground'
  const amber = 'text-amber-600 dark:text-amber-400'
  const blue = 'text-blue-600 dark:text-blue-400'
  const green = 'text-green-600 dark:text-green-400'

  if (status === 'cancelled') return { text: 'Đã huỷ', textClass: muted, priority: 0 }
  if (status === 'closed') return { text: 'Đã đóng', textClass: muted, priority: 0 }

  if (status === 'pending') {
    if (!hasAssignee) {
      return {
        text: 'Chờ phân công',
        textClass: amber,
        priority: isCurrentUserStorekeeper ? 5 : 1,
      }
    }
    if (isCurrentUserStorekeeper) {
      return { text: 'Bạn cần xuất kho', textClass: amber, priority: 6 }
    }
    if (isCurrentUserAssignee) {
      return { text: 'Chờ kho xuất hàng', textClass: muted, priority: 2 }
    }
    return { text: `Chờ xuất kho cho ${assignedToName ?? 'NV'}`, textClass: amber, priority: 1 }
  }

  if (status === 'released') {
    if (isCurrentUserAssignee) {
      return { text: 'Bạn cần xác nhận nhận hàng', textClass: amber, priority: 7 }
    }
    return {
      text: `Chờ ${assignedToName ?? 'NV'} nhận hàng`,
      textClass: muted,
      priority: isCurrentUserStorekeeper ? 1 : 0,
    }
  }

  if (status === 'in_progress') {
    const remain = Math.max(0, totalRooms - completedRooms)
    if (isCurrentUserAssignee && remain > 0) {
      return { text: `Còn ${remain} phòng cần giao`, textClass: blue, priority: 8 }
    }
    return {
      text: `Đang giao ${completedRooms}/${totalRooms}`,
      textClass: blue,
      priority: isCurrentUserStorekeeper ? 2 : 0,
    }
  }

  if (status === 'completed') {
    if (isCurrentUserStorekeeper) {
      return { text: 'Chờ bạn đóng phiếu', textClass: green, priority: 4 }
    }
    if (input.isCurrentUserCreator) {
      return { text: 'Chờ đóng phiếu', textClass: green, priority: 3 }
    }
    return { text: 'Đã giao xong', textClass: green, priority: 0 }
  }

  return { text: '—', textClass: muted, priority: 0 }
}
