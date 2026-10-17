import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { MobilePOListPage } from './MobilePOListPage'

const state = vi.hoisted(() => ({ isError: false, refetch: vi.fn() }))
vi.mock('@/hooks/usePurchaseOrders', () => ({ usePurchaseOrders: () => ({ data: [
  { id: 'one', po_code: 'PO-001', status: 'submitted', order_date: '2026-10-15', expected_delivery_date: '2026-10-18', total_amount: 100_000, vendor: { name: 'An Thủy' } },
  { id: 'two', po_code: 'PO-002', status: 'received', order_date: '2026-10-16', expected_delivery_date: '2026-10-18', total_amount: 200_000, vendor: { name: 'Bình Minh' } },
], isLoading: false, isError: state.isError, refetch: state.refetch }) }))
vi.mock('@/components/auth/PermissionGate', () => ({ PermissionGate: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('@/components/layout/MobileDetailHeader', () => ({ MobileDetailHeader: () => <h1>Đơn đặt hàng</h1> }))
vi.mock('@/components/mobile/PullToRefresh', () => ({ PullToRefresh: ({ children }: { children: ReactNode }) => <>{children}</> }))

describe('mobile purchase order list', () => {
  beforeEach(() => { state.isError = false; state.refetch.mockReset() })
  it('displays PO codes and filters by the actual submitted/received workflow states', () => {
    render(<MemoryRouter><MobilePOListPage /></MemoryRouter>)
    expect(screen.getByText('PO-001')).toBeVisible()
    expect(screen.getByText('PO-002')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Chờ duyệt' }))
    expect(screen.getByText('PO-001')).toBeVisible()
    expect(screen.queryByText('PO-002')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Đã nhận đủ' }))
    expect(screen.queryByText('PO-001')).not.toBeInTheDocument()
    expect(screen.getByText('PO-002')).toBeVisible()
  })
  it('combines text search with the selected state', () => {
    render(<MemoryRouter><MobilePOListPage /></MemoryRouter>)
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm đơn đặt hàng' }), { target: { value: 'An Thủy' } })
    expect(screen.getByText('PO-001')).toBeVisible()
    expect(screen.queryByText('PO-002')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Đã nhận đủ' }))
    expect(screen.getByText('Không có đơn phù hợp')).toBeVisible()
  })
  it('offers a retry when the request fails', () => {
    state.isError = true
    render(<MemoryRouter><MobilePOListPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(state.refetch).toHaveBeenCalledOnce()
  })
})
