import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ReceiveBatchPage } from './ReceiveBatchPage'

const state = vi.hoisted(() => ({
  query: {
    data: undefined as any,
    isLoading: true,
    isError: false,
    refetch: vi.fn(),
  },
  mutate: vi.fn(),
}))
vi.mock('@/hooks/useLaundryBatches', () => ({
  useLaundryBatch: () => state.query,
  useReceiveLaundryBatch: () => ({ mutate: state.mutate, isPending: false }),
}))
vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title, children }: { title: string; children: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {children}
    </div>
  ),
}))
vi.mock('@/components/shared/ImageUpload', () => ({ ImageUpload: () => null }))
vi.mock('@/components/shared/StarRating', () => ({ StarRating: () => null }))
vi.mock('@/hooks/useWindowSize', () => ({
  useWindowSize: () => ({ width: 1000, height: 700 }),
}))
vi.mock('react-confetti', () => ({ default: () => null }))

const app = () => (
  <MemoryRouter initialEntries={['/laundry/batches/batch-1/receive']}>
    <Routes>
      <Route
        path="/laundry/batches/:id/receive"
        element={<ReceiveBatchPage />}
      />
    </Routes>
  </MemoryRouter>
)
const data = {
  batch: {
    id: 'batch-1',
    batch_code: 'LG-01',
    status: 'ready',
    delivery_date: '2026-10-15',
    estimated_cost: 150_000,
  },
  items: [
    {
      id: 'line-1',
      item_id: 'towel',
      item_name: 'Khăn tắm',
      quantity_delivered: 10,
      item: { name: 'Khăn tắm', unit_price: 20_000 },
    },
  ],
}

describe('receiving a batch loaded asynchronously', () => {
  beforeEach(() => {
    state.query = {
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    }
    state.mutate.mockReset()
  })
  it('fills received pieces and cost after loading, and preserves staff edits on refetch', async () => {
    const view = render(app())
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải')
    state.query = { ...state.query, data, isLoading: false }
    view.rerender(app())
    await waitFor(() =>
      expect(
        screen.getByRole('spinbutton', { name: 'Số nhận Khăn tắm' }),
      ).toHaveValue(10),
    )
    expect(
      screen.getByRole('spinbutton', { name: 'Chi phí thực tế *' }),
    ).toHaveValue(150_000)
    fireEvent.change(
      screen.getByRole('spinbutton', { name: 'Số mất Khăn tắm' }),
      { target: { value: '2' } },
    )
    expect(
      screen.getByRole('spinbutton', { name: 'Số nhận Khăn tắm' }),
    ).toHaveValue(8)
    state.query = { ...state.query, data: { ...data } }
    view.rerender(app())
    expect(
      screen.getByRole('spinbutton', { name: 'Số mất Khăn tắm' }),
    ).toHaveValue(2)
    fireEvent.click(screen.getByRole('button', { name: 'Tất cả nhận đủ' }))
    expect(
      screen.getByRole('spinbutton', { name: 'Số nhận Khăn tắm' }),
    ).toHaveValue(10)
    expect(
      screen.getByRole('spinbutton', { name: 'Số mất Khăn tắm' }),
    ).toHaveValue(0)
    expect(state.mutate).not.toHaveBeenCalled()
  })
  it('shows retry for a failed load', () => {
    state.query = { ...state.query, isLoading: false, isError: true }
    render(app())
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(state.query.refetch).toHaveBeenCalledOnce()
    expect(state.mutate).not.toHaveBeenCalled()
  })
})
