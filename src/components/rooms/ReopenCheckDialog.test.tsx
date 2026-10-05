import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ReopenCheckDialog } from './ReopenCheckDialog'

// Mock RPC hook
const mutateAsync = vi.fn()
vi.mock('@/hooks/useRoomCheckLean', () => ({
  useReopenRoomCheck: () => ({
    mutateAsync,
    isPending: false,
  }),
}))

describe('ReopenCheckDialog', () => {
  beforeEach(() => {
    mutateAsync.mockReset().mockResolvedValue({ success: true })
  })

  it('hiển thị tên người kiểm trong description', () => {
    render(
      <ReopenCheckDialog
        checkId="c1"
        checkedByName="Nguyễn Văn A"
        open
        onOpenChange={() => {}}
      />,
    )
    expect(
      screen.getByText(/Nguyễn Văn A/),
    ).toBeInTheDocument()
  })

  it('disable nút xác nhận khi lý do dưới 5 ký tự', () => {
    render(
      <ReopenCheckDialog checkId="c1" open onOpenChange={() => {}} />,
    )
    const btn = screen.getByRole('button', { name: /Xác nhận mở lại/i })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Lý do mở lại/), {
      target: { value: 'abc' },
    })
    expect(btn).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/Lý do mở lại/), {
      target: { value: 'thiếu ảnh' },
    })
    expect(btn).not.toBeDisabled()
  })

  it('gọi mutateAsync với reason trimmed và đóng dialog', async () => {
    const onOpenChange = vi.fn()
    const onReopened = vi.fn()
    render(
      <ReopenCheckDialog
        checkId="check-123"
        open
        onOpenChange={onOpenChange}
        onReopened={onReopened}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Lý do mở lại/), {
      target: { value: '   thiếu ảnh bằng chứng   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Xác nhận mở lại/i }))

    await waitFor(() => {
      expect(mutateAsync).toHaveBeenCalledWith({
        checkId: 'check-123',
        reason: 'thiếu ảnh bằng chứng',
      })
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onReopened).toHaveBeenCalled()
  })

  it('không gọi mutateAsync khi bấm Hủy', () => {
    const onOpenChange = vi.fn()
    render(
      <ReopenCheckDialog checkId="c1" open onOpenChange={onOpenChange} />,
    )
    fireEvent.click(screen.getByRole('button', { name: /Hủy/i }))
    expect(mutateAsync).not.toHaveBeenCalled()
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
