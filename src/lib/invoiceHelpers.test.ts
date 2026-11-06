import { beforeEach, expect, it, vi } from 'vitest'
import { createInvoiceAfterCheckout } from './invoiceHelpers'

const mocks = vi.hoisted(() => ({ result: { data: { id: 'invoice' } as { id: string } | null, error: null as unknown },
  from: vi.fn(), eq: vi.fn(), insert: vi.fn(), rpc: vi.fn() }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (...args: unknown[]) => mocks.from(...args), rpc: mocks.rpc,
} }))
beforeEach(() => {
  vi.clearAllMocks(); mocks.result = { data: { id: 'invoice' }, error: null }
  const query = { select: () => query, eq: (...args: unknown[]) => { mocks.eq(...args); return query },
    limit: () => query, maybeSingle: async () => mocks.result, insert: mocks.insert }
  mocks.from.mockReturnValue(query)
})
const args = { bookingId: 'booking', tenantId: 'tenant', hotelId: 'hotel' }
it('only reads the server receipt in the requested booking/tenant/hotel scope', async () => {
  await expect(createInvoiceAfterCheckout(args)).resolves.toBeUndefined()
  expect(mocks.eq.mock.calls).toEqual([['booking_id', 'booking'], ['tenant_id', 'tenant'], ['hotel_id', 'hotel'], ['invoice_type', 'receipt']])
  expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.rpc).not.toHaveBeenCalled()
})
it('does not fabricate an invoice if the core has no confirmed receipt', async () => {
  mocks.result.data = null
  await expect(createInvoiceAfterCheckout(args)).rejects.toThrow('không thực hiện trả phòng lại')
  expect(mocks.insert).not.toHaveBeenCalled()
})
it('does not swallow database failure or expose its raw message', async () => {
  mocks.result.error = new Error('private SQL details')
  await expect(createInvoiceAfterCheckout(args)).rejects.toThrow('Chưa xác nhận được phiếu thu')
})
it('does not create a separate VAT request through the retired helper', async () => {
  await expect(createInvoiceAfterCheckout({ ...args, invoice_type: 'vat_request' })).rejects.toThrow('chức năng riêng')
  expect(mocks.from).not.toHaveBeenCalled()
})
