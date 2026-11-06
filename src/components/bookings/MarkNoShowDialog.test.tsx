import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MarkNoShowDialog } from './MarkNoShowDialog'
const f = vi.hoisted(() => ({ mutateAsync: vi.fn(), isCurrent: vi.fn(), toast: vi.fn() }))
vi.mock('@/hooks/useMarkBookingNoShow', () => ({ useMarkBookingNoShow: () => ({ ...f, isPending: false }) }))
vi.mock('sonner', () => ({ toast: { success: f.toast } }))
beforeEach(() => { vi.clearAllMocks(); f.mutateAsync.mockResolvedValue({}); f.isCurrent.mockReturnValue(true) })
function setup() {
  const onOpenChange = vi.fn(), onSuccess = vi.fn()
  render(<MarkNoShowDialog open onOpenChange={onOpenChange} onSuccess={onSuccess} bookingId="owned-booking" guestName="Khách thử"
    roomNumber="101" depositAmount={100000} hoursOverdue={2} />)
  fireEvent.change(screen.getByPlaceholderText(/VD: Khách/), { target: { value: 'Khách không đến' } })
  return { onOpenChange, onSuccess }
}
it('closes once after a confirmed command and does not duplicate the hook toast', async () => {
  const v = setup(); fireEvent.click(screen.getByRole('button', { name: 'Xác nhận No-Show' }))
  await waitFor(() => expect(v.onSuccess).toHaveBeenCalledTimes(1))
  expect(v.onOpenChange).toHaveBeenCalledWith(false); expect(f.toast).not.toHaveBeenCalled()
  expect(screen.getByText('Đánh dấu cần hoàn cọc')).toBeInTheDocument()
})
it('keeps the dialog available on an uncertain result without an unhandled rejection', async () => {
  f.mutateAsync.mockRejectedValue(new Error('Uncertain result'))
  const v = setup(); fireEvent.click(screen.getByRole('button', { name: 'Xác nhận No-Show' }))
  await waitFor(() => expect(f.mutateAsync).toHaveBeenCalledTimes(1))
  expect(v.onOpenChange).not.toHaveBeenCalled(); expect(v.onSuccess).not.toHaveBeenCalled()
})
