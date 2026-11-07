import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PrintReceiptDialog } from './PrintReceiptDialog'
import { formatCurrency } from '@/lib/utils'

const mocks = vi.hoisted(() => ({ invoice: null as Record<string, unknown> | null, error: null as unknown,
  filters: vi.fn(), update: vi.fn(), insert: vi.fn(), print: vi.fn(), success: vi.fn(), fail: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const query = { select: () => query, eq: (...args: unknown[]) => { mocks.filters(...args); return query },
    order: () => query, limit: () => query, abortSignal: () => query,
    maybeSingle: async () => ({ data: mocks.invoice, error: mocks.error }), update: mocks.update, insert: mocks.insert }
  return query
} } }))
vi.mock('./InvoicePDFTemplate', () => ({ printInvoice: (...args: unknown[]) => mocks.print(...args) }))
vi.mock('./VatRequestForm', () => ({ VatRequestForm: ({ subtotal }: { subtotal: number }) => <div data-testid="vat-total">{subtotal}</div> }))
vi.mock('sonner', () => ({ toast: { success: (...args: unknown[]) => mocks.success(...args), error: (...args: unknown[]) => mocks.fail(...args) } }))
const props = { open: true, onOpenChange: vi.fn(), bookingId: 'booking', tenantId: 'tenant', hotelId: 'hotel',
  subtotal: 999999, hotelInfo: { name: 'Owned hotel' } }
function fixture() {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={cache}><PrintReceiptDialog {...props} /></QueryClientProvider>)
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.error = null; mocks.print.mockResolvedValue(undefined)
  mocks.invoice = { id: 'invoice', booking_id: 'booking', tenant_id: 'tenant', hotel_id: 'hotel', invoice_type: 'receipt',
    guest_name: 'Owned guest', room_number: '101', subtotal: 180000, vat_rate: 8, vat_amount: 12000,
    service_fee_rate: 5, service_fee_amount: 7500, total_amount: 199500, line_items: [] }
})
afterEach(cleanup)
it('shows stored VAT, service fee and total rather than a caller quote', async () => {
  fixture(); await screen.findByText('VAT (8%)')
  const money = (amount: number) => (text: string) => text.replace(/\s/g, '') === formatCurrency(amount).replace(/\s/g, '')
  expect(screen.getByText(money(199500))).toBeInTheDocument()
  expect(screen.getByText(money(7500))).toBeInTheDocument()
  expect(screen.queryByText(money(999999))).not.toBeInTheDocument()
  expect(screen.queryByRole('switch')).not.toBeInTheDocument()
})
it('printing keeps all financial values unchanged and performs no database write', async () => {
  fixture(); await screen.findByText('VAT (8%)')
  fireEvent.click(screen.getByRole('button', { name: 'In phiếu thu' }))
  await waitFor(() => expect(mocks.print).toHaveBeenCalledOnce())
  expect(mocks.print.mock.calls[0][0]).toMatchObject({ subtotal: 180000, vat_amount: 12000, service_fee_amount: 7500, total_amount: 199500 })
  expect(mocks.update).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled()
})
it('only queries receipt invoices within all three scope filters', async () => {
  fixture(); await screen.findByText('VAT (8%)')
  for (const filter of [['booking_id', 'booking'], ['tenant_id', 'tenant'], ['hotel_id', 'hotel'], ['invoice_type', 'receipt']]) {
    expect(mocks.filters).toHaveBeenCalledWith(...filter)
  }
})
it('passes the stored total to the separate VAT request flow', async () => {
  fixture(); await screen.findByText('VAT (8%)')
  fireEvent.click(screen.getByRole('button', { name: 'Khách lấy HĐVAT' }))
  expect(screen.getByTestId('vat-total')).toHaveTextContent('199500')
})
it('does not print or create a missing receipt and offers a scoped recheck', async () => {
  mocks.invoice = null; fixture()
  await screen.findByText('Chưa có phiếu thu đã xác nhận. Không thực hiện trả phòng lại.')
  expect(screen.getByRole('button', { name: 'In phiếu thu' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Kiểm tra lại phiếu thu' })).toBeEnabled()
  expect(mocks.print).not.toHaveBeenCalled(); expect(mocks.insert).not.toHaveBeenCalled()
})
it('shows a safe error rather than waiting indefinitely or exposing a query error', async () => {
  mocks.invoice = null; mocks.error = new Error('private SQL details'); fixture()
  await screen.findByText('Chưa tải được phiếu thu.')
  expect(screen.queryByText('private SQL details')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'In phiếu thu' })).toBeDisabled()
})
