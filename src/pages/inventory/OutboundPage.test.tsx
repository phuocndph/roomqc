import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OutboundPage } from './OutboundPage'

const state = vi.hoisted(() => ({ navigate: vi.fn(), back: vi.fn(), reset: vi.fn(), create: vi.fn() }))
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }))
vi.mock('@/lib/navigation', () => ({ navigateBack: (...args: unknown[]) => state.back(...args) }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('@/lib/breakpoints', () => ({ useBreakpoint: () => ({ isMobile: false }) }))
vi.mock('@/components/shared/PageHeader', () => ({ PageHeader: ({ title, children }: PropsWithChildren<{ title: string }>) => <header><h1>{title}</h1>{children}</header> }))
vi.mock('@/hooks/useInventoryTransactions', () => ({ useCreateOutboundTransaction: () => ({ mutate: state.create, isPending: false }) }))
vi.mock('@/hooks/useDistributionOrders', () => ({ useCreateDistributionOrder: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/useLaundryBatches', () => ({ useCreateLaundryBatch: () => ({ mutate: vi.fn(), isPending: false }) }))
vi.mock('@/hooks/useLaundryVendors', () => ({ useLaundryVendors: () => ({ data: [] }) }))
vi.mock('@/hooks/useUsers', () => ({ useUsers: () => ({ users: [] }) }))
vi.mock('@/hooks/useItems', () => ({ useItems: () => ({ data: { items: [] } }) }))
vi.mock('@/components/distribution/hooks/useDistributionForm', () => ({ useDistributionForm: () => ({ allocations: [] }) }))
vi.mock('@/components/distribution/forms/DistributionForm', () => ({ DistributionForm: () => null }))
vi.mock('@/components/inventory/MobileOutboundForm', () => ({ MobileOutboundForm: () => null }))
vi.mock('@/components/inventory/outbound/LaundryBatchFields', () => ({ LaundryBatchFields: () => null }))
vi.mock('@/components/inventory/outbound/StandardItemsFields', () => ({ StandardItemsFields: () => null }))
vi.mock('@/components/warehouse/WarehouseSelect', () => ({ WarehouseSelect: () => null }))
vi.mock('@/components/shared/LaundryVendorSelect', () => ({ LaundryVendorSelect: () => null }))
vi.mock('@/components/shared/MaintenanceRequestSelect', () => ({ MaintenanceRequestSelect: () => null }))
vi.mock('@/components/ui/form', () => ({
  Form: ({ children }: PropsWithChildren) => <>{children}</>,
  FormField: () => null, FormControl: () => null, FormItem: () => null, FormLabel: () => null, FormMessage: () => null,
}))
vi.mock('react-hook-form', () => ({
  useForm: () => ({
    watch: (key: string) => key === 'transaction_category' ? 'disposal' : key === 'items' ? [{ item_id: 'item-A', quantity: 1, available_quantity: 2 }] : [],
    reset: state.reset,
    handleSubmit: (submit: (data: unknown) => void) => (event: { preventDefault: () => void }) => {
      event.preventDefault()
      submit({ transaction_category: 'disposal', items: [{ item_id: 'item-A', quantity: 1 }] })
    },
  }),
}))
beforeEach(() => {
  vi.clearAllMocks()
  state.create.mockImplementation((_data: unknown, options: { onSuccess: () => void }) => options.onSuccess())
})
afterEach(cleanup)

describe('outbound entry navigation', () => {
  it('has a clear heading and returns to the actual previous screen', () => {
    render(<OutboundPage />)
    expect(screen.getByRole('heading', { name: 'Xuất kho' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Quay lại' }))
    expect(state.back).toHaveBeenCalledWith(state.navigate, '/inventory')
  })

  it('uses history for cancellation without submitting a stock transaction', () => {
    render(<OutboundPage />)
    fireEvent.click(screen.getByRole('button', { name: 'common:cancel' }))
    expect(state.back).toHaveBeenCalledWith(state.navigate, '/inventory')
    expect(state.create).not.toHaveBeenCalled()
  })

  it('leaves the standalone form for the canonical outbound list after successful creation', () => {
    render(<OutboundPage />)
    fireEvent.click(screen.getByRole('button', { name: 'inventory:outbound.confirm' }))
    expect(state.create).toHaveBeenCalledOnce()
    expect(state.reset).toHaveBeenCalledOnce()
    expect(state.navigate).toHaveBeenCalledWith('/inventory?tab=operations&sub=outbound&view=list', { replace: true })
  })
})
