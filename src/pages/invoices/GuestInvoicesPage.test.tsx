import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import GuestInvoicesPage from './GuestInvoicesPage'

const state = vi.hoisted(() => ({
  receipt: { data: [], isLoading: false, isError: false, isFetching: false, refetch: vi.fn() },
  vat: { data: [], isLoading: false, isError: false, isFetching: false, refetch: vi.fn() },
  allHotels: false, role: 'owner',
  excel: vi.fn(), workbook: vi.fn(),
}))
vi.mock('@/hooks/useGuestInvoices', () => ({
  useGuestInvoices: ({ invoice_type }: { invoice_type: string }) => invoice_type === 'receipt' ? state.receipt : state.vat,
  useUpdateGuestInvoice: () => ({ mutate: vi.fn() }),
  useCreateGuestInvoice: () => ({ mutateAsync: vi.fn() }),
}))
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ tenant: { id: 'tenant' } }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: { id: 'user' }, role: state.role }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: 'hotel', name: 'Demo' }, isAllHotelsMode: state.allHotels }) }))
vi.mock('@/hooks/useVatClaimToken', () => ({ useEnsureVatClaimToken: () => vi.fn() }))
vi.mock('@/components/invoices/InvoicePDFTemplate', () => ({ generateInvoicePDF: vi.fn(), printInvoice: vi.fn(), buildVatClaimUrl: vi.fn() }))
vi.mock('@/utils/exportUtils', () => ({ exportToExcel: state.excel }))
vi.mock('@/lib/excelUtils', () => ({ downloadWorkbook: state.workbook, objectRecordsToRows: vi.fn() }))
vi.mock('@/components/invoices/CreateInvoiceDialog', () => ({ default: () => null }))
vi.mock('@/components/invoices/InvoicePreviewDialog', () => ({ default: () => null }))
vi.mock('@/components/invoices/EditInvoiceDialog', () => ({ default: () => null }))
vi.mock('@/components/invoices/SendInvoiceEmailDialog', () => ({ default: () => null }))
vi.mock('@/components/invoices/VatRequestDetailDialog', () => ({ default: () => null }))
vi.mock('@/components/shared/DateRangePicker', () => ({ DateRangePicker: () => <button>Khoảng ngày</button> }))

describe('guest invoices load states', () => {
  beforeEach(() => {
    state.receipt.data = []; state.vat.data = []
    state.receipt.isLoading = state.receipt.isError = state.receipt.isFetching = false
    state.vat.isLoading = state.vat.isError = state.vat.isFetching = false
    state.receipt.refetch.mockReset(); state.vat.refetch.mockReset()
    state.excel.mockReset(); state.workbook.mockReset()
    state.allHotels = false; state.role = 'owner'
  })
  it('shows receipt retry, hides misleading zero totals, and disables Excel', () => {
    state.receipt.isError = true
    render(<GuestInvoicesPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được phiếu thu')
    expect(screen.queryByText('Tổng tiền')).not.toBeInTheDocument()
    expect(screen.queryByText('Chưa có phiếu thu nào')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Excel' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(state.receipt.refetch).toHaveBeenCalledOnce()
    expect(state.vat.refetch).not.toHaveBeenCalled()
  })
  it('keeps the VAT error independent of successful receipt data and retries that query', () => {
    state.vat.isError = true
    render(<GuestInvoicesPage />)
    expect(screen.getByText('Chưa có phiếu thu nào')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Yêu cầu HĐVAT' }), { button: 0, ctrlKey: false })
    expect(screen.getByRole('alert')).toHaveTextContent('Không tải được yêu cầu HĐVAT')
    expect(screen.queryByText('Tổng yêu cầu')).not.toBeInTheDocument()
    expect(screen.queryByText('Chưa có yêu cầu xuất HĐVAT nào')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Xuất Excel' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(state.vat.refetch).toHaveBeenCalledOnce()
  })
  it('distinguishes a genuinely empty result from a failure', () => {
    render(<GuestInvoicesPage />)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Tổng tiền')).toBeInTheDocument()
    expect(screen.getByText('Phiếu nháp')).toBeInTheDocument()
    expect(screen.getByText('Đã xuất')).toBeInTheDocument()
    expect(screen.queryByText('Còn nợ (nháp)')).not.toBeInTheDocument()
    expect(screen.queryByText('Đã in')).not.toBeInTheDocument()
    expect(screen.getByText('Chưa có phiếu thu nào')).toBeInTheDocument()
  })
  it('prevents duplicate retry clicks and preserves VAT export permissions', () => {
    state.vat.isError = state.vat.isFetching = true
    state.role = 'staff'
    render(<GuestInvoicesPage />)
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Yêu cầu HĐVAT' }), { button: 0, ctrlKey: false })
    expect(screen.getByRole('button', { name: 'Đang tải lại…' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Xuất Excel' })).not.toBeInTheDocument()
    expect(state.workbook).not.toHaveBeenCalled()
  })
  it('still asks for a specific hotel in all-hotels mode', () => {
    state.allHotels = true
    render(<GuestInvoicesPage />)
    expect(screen.getByText('Vui lòng chọn một khách sạn cụ thể để quản lý hóa đơn khách.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tạo phiếu thu' })).not.toBeInTheDocument()
  })
})
