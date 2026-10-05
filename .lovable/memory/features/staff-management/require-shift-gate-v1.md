---
name: Require Shift Gate v1
description: Staff & Department Manager bắt buộc vào ca trước khi thao tác nghiệp vụ; gate qua RequireShiftContext + dialog tại chỗ
type: feature
---

## Mục tiêu
Chặn thao tác vận hành khi nhân viên chưa vào ca. Gate áp dụng cho `primaryRole ∈ { staff, department_manager }`. Owner / Hotel Manager / Super Admin pass-through.

## Kiến trúc

- `src/contexts/RequireShiftContext.tsx` — `RequireShiftProvider` đọc `useMyStaffStatus` + `isCurrentlyOnShift` (đã loại ca treo >16h), expose `{ isOnShift, requiresShift, guard(fn), openDialog() }`.
- `src/components/staff/RequireShiftDialog.tsx` — AlertDialog "Bạn cần vào ca để tiếp tục" với nút **Vào ca ngay** gọi `useShiftCheckIn`; thành công → re-run `pendingAction`.
- `src/components/staff/RequireShiftRouteGate.tsx` — wrapper route: chưa vào ca thì redirect `/` + tự openDialog. Áp dụng cho `/rooms/:id/check*` và các check-lean sub-routes.
- Provider mount trong `MainLayout` (trong `HotelProvider`, ngoài `ChatPopupProvider`).

## Điểm wiring

| Tầng | File | Cách wrap |
|---|---|---|
| Route | `src/App.tsx` (rooms/:id/check, /check-lean, /check-lean/inspection, /review, /success) | `<RequireShiftRouteGate>` |
| Mutation | `src/hooks/useTaskTransition.ts` | wrap `mutate`/`mutateAsync` qua `guard()` |
| Mutation | `src/hooks/useBookingActions.ts` | wrap `handleCheckIn`/`handleCheckOut` thành `guardedCheckIn/Out` |
| Mutation | `src/components/inventory/outbound/shared/useOutboundSubmit.ts` | bọc body `submit()` trong `guard(() => { ... })` |
| Helper | `src/hooks/useGuardedMutation.ts` — `useShiftGuardedMutation(mutation)` wrap bất kỳ `UseMutationResult` nào |
| Laundry | `useReceiveLaundryBatch`, `useUpdateBatchStatus`, `useStockInFromLaundry` | qua `useShiftGuardedMutation` |
| Maintenance | `useAcceptRequest`, `useStartRequest`, `useCompleteRequest`, `useCancelRequest` | qua `useShiftGuardedMutation` |
| Distribution | `useConfirmWarehouseDelivery` | qua `useShiftGuardedMutation` |

Các mutation thuần cấu hình / quản lý (tạo lô giặt từ chủ buồng, update cost, cancel order...) **không** wrap để admin/owner thao tác không bị chặn.

## Rules

- `useRequireShift` có fallback an toàn (`isOnShift=true, guard=fn=>fn()`) nếu component mount ngoài provider — không gãy test.
- Ca treo >16h: coi như chưa vào ca (theo `staffPresence.ts`).
- Heartbeat offline vẫn cho thao tác (chỉ cần shift đang mở).
- Tất cả mutation hooks dùng guard PHẢI được gọi trong tree có `RequireShiftProvider` (tức là dưới `MainLayout`).

## Rollback
Gỡ `<RequireShiftProvider>` khỏi `MainLayout`. Vì `useRequireShift` có fallback, tất cả `guard()` trở thành pass-through và route gate luôn cho qua.
