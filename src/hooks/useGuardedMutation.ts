import type { UseMutationResult } from '@tanstack/react-query'
import { useRequireShift } from '@/contexts/RequireShiftContext'

/**
 * Bọc một mutation hiện hữu bằng shift-gate.
 * - Nếu user không cần gác hoặc đã vào ca: chạy mutate/mutateAsync như cũ.
 * - Nếu chưa vào ca: mở dialog "Vào ca ngay", sau khi vào ca chạy lại action.
 *
 * Dùng chỉ cho các mutation thao tác vận hành (status transition, nhập/xuất kho,
 * hoàn thành task, v.v.). Không bọc các mutation đọc/cấu hình.
 */
export function useShiftGuardedMutation<TData, TError, TVars, TCtx>(
  mutation: UseMutationResult<TData, TError, TVars, TCtx>
): UseMutationResult<TData, TError, TVars, TCtx> {
  const { guard } = useRequireShift()
  const originalMutate = mutation.mutate
  const originalMutateAsync = mutation.mutateAsync

  const mutate: typeof originalMutate = ((vars: TVars, opts?: any) => {
    guard(() => originalMutate(vars, opts))
  }) as typeof originalMutate

  const mutateAsync: typeof originalMutateAsync = ((vars: TVars, opts?: any) => {
    return new Promise<TData>((resolve, reject) => {
      guard(() => {
        originalMutateAsync(vars, opts).then(resolve, reject as any)
      })
    })
  }) as typeof originalMutateAsync

  return { ...mutation, mutate, mutateAsync }
}
