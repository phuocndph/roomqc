import { useCreateOutboundTransaction } from '@/hooks/useInventoryTransactions'
import { useCreateLaundryBatch } from '@/hooks/useLaundryBatches'
import { useCreateDistributionOrder } from '@/hooks/useDistributionOrders'
import { useRequireShift } from '@/contexts/RequireShiftContext'
import type {
  OutboundSubmitPayload,
  OutboundSubmitExtras,
  OutboundSubmitKind,
} from './types'

interface SubmitCallbacks {
  onSuccess?: (kind: OutboundSubmitKind) => void
  onError?: (error: unknown) => void
}

/**
 * Shared dispatcher that routes outbound submissions to the correct
 * server hook based on `transaction_category` + extras. Fixes the bug
 * where QuickOutboundDialog called `createOutbound` for every category
 * (including room_assign + laundry) instead of the specialized flows.
 *
 * Gắn require-shift gate: staff/department_manager phải vào ca mới gửi.
 */
export function useOutboundSubmit() {
  const { mutate: createOutbound, isPending: pOut } = useCreateOutboundTransaction()
  const { mutate: createLaundryBatch, isPending: pLau } = useCreateLaundryBatch()
  const { mutate: createDistribution, isPending: pDist } = useCreateDistributionOrder()
  const { guard } = useRequireShift()

  const isPending = pOut || pLau || pDist

  const submit = (
    payload: OutboundSubmitPayload,
    extras: OutboundSubmitExtras = {},
    cb: SubmitCallbacks = {},
  ) => guard(() => {
    const { transaction_category: category, items, notes } = payload
    const { selectedRoomIds, laundryData, selectedMaintenanceRequest } = extras

    // Room assignment → Distribution order
    if (category === 'room_assign' && selectedRoomIds && selectedRoomIds.length > 0) {
      const rooms = selectedRoomIds.map(room_id => ({
        room_id,
        items: items.map(i => ({ item_id: i.item_id, quantity: i.quantity })),
      }))
      createDistribution(
        { rooms, notes },
        {
          onSuccess: () => cb.onSuccess?.('distribution'),
          onError: cb.onError,
        },
      )
      return
    }

    // Laundry → Laundry batch
    if (category === 'laundry' && laundryData) {
      createLaundryBatch(
        {
          step1: {
            vendor_id: laundryData.vendor_id,
            delivery_date: laundryData.delivery_date,
            expected_return_date: laundryData.expected_return_date,
            delivery_staff_id: laundryData.delivery_staff_id,
            receiver_name: laundryData.receiver_name,
            notes: laundryData.notes,
          },
          step2: {
            items: items.map(i => ({
              item_id: i.item_id,
              quantity: i.quantity,
              weight_kg: i.weight_kg || 0,
              condition_note: i.notes,
            })),
          },
          step3: { confirmed: true },
        },
        {
          onSuccess: () => cb.onSuccess?.('laundry'),
          onError: cb.onError,
        },
      )
      return
    }

    // Maintenance / disposal / other / unspecified → Standard outbound
    const to_location =
      category === 'maintenance' && selectedMaintenanceRequest
        ? `Bảo trì: ${selectedMaintenanceRequest.title}${
            selectedMaintenanceRequest.room_number
              ? ` (Phòng ${selectedMaintenanceRequest.room_number})`
              : ''
          }`
        : payload.to_location || ''

    createOutbound(
      {
        ...payload,
        to_location,
        from_location: '',
        related_type: selectedMaintenanceRequest ? 'maintenance_request' : undefined,
        related_id: selectedMaintenanceRequest?.id,
      } as any,
      {
        onSuccess: () => cb.onSuccess?.('outbound'),
        onError: cb.onError,
      },
    )
  })

  return { submit, isPending }
}
