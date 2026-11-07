import {act, fireEvent, render, screen, waitFor} from '@testing-library/react'
import type {UserWithRelations} from '@/types/database.types'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {UserFormDialog} from './UserFormDialog'

const ids = {hotel: '10000000-0000-4000-8000-000000000001', second: '10000000-0000-4000-8000-000000000002',
  position: '20000000-0000-4000-8000-000000000001', supervisor: '30000000-0000-4000-8000-000000000001'}
const state = vi.hoisted(() => ({currentUser: {id: 'owner', full_name: 'Fixture owner', user_level_code: 'tenant_owner'}}))
vi.mock('react-i18next', () => ({useTranslation: () => ({t: (key: string, fallback?: string) => fallback || key})}))
vi.mock('@/hooks/useHotels', () => ({useHotels: () => ({data: [
  {id: '10000000-0000-4000-8000-000000000001', name: 'Hotel one'},
  {id: '10000000-0000-4000-8000-000000000002', name: 'Hotel two'},
], isLoading: false})}))
vi.mock('@/hooks/useUserLevels', () => ({useAvailableUserLevels: () => ({data: [
  {code: 'tenant_owner'}, {code: 'manager'}, {code: 'department_manager'}, {code: 'staff'},
], isLoading: false})}))
vi.mock('@/hooks/usePositions', () => ({usePositions: () => ({data: [
  {id: '20000000-0000-4000-8000-000000000001', name: 'Fixture position'},
]})}))
vi.mock('@/hooks/useUser', () => ({useUser: () => ({user: state.currentUser})}))
vi.mock('@/hooks/useManagersByHotel', () => ({useManagersByHotel: () => ({data: [
  {id: '30000000-0000-4000-8000-000000000001', full_name: 'Fixture supervisor'},
], isFetching: false})}))
vi.mock('./PositionManagementDialog', () => ({PositionManagementDialog: () => null}))
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({open, children}: {open: boolean; children: React.ReactNode}) => open ? children : null,
  DialogContent: ({children}: {children: React.ReactNode}) => <div role="dialog">{children}</div>,
  DialogHeader: ({children}: {children: React.ReactNode}) => <div>{children}</div>,
  DialogTitle: ({children}: {children: React.ReactNode}) => <h2>{children}</h2>,
  DialogDescription: ({children}: {children: React.ReactNode}) => <p>{children}</p>,
}))
// Native selects exercise the form's values/change handlers, not Radix internals.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  const SelectItem = ({value, children}: {value: string; children: React.ReactNode}) =>
    <option value={value}>{React.Children.toArray(children).map(c => typeof c === 'string' ? c : value).join('')}</option>
  return {
    Select: ({onValueChange, children, value, disabled}: {onValueChange: (s: string) => void;
      children: React.ReactNode; value?: string; disabled?: boolean}) =>
      <select value={value || ''} disabled={disabled} onChange={e => onValueChange(e.target.value)}>
        <option value="">Choose</option>{children}
      </select>,
    SelectContent: ({children}: {children: React.ReactNode}) => <>{React.Children.toArray(children)
      .filter(c => React.isValidElement(c) && c.type === SelectItem)}</>,
    SelectItem, SelectTrigger: () => null, SelectValue: () => null,
  }
})

function employee(overrides: Record<string, unknown> = {}) {
  return {id: 'employee-one', full_name: 'Fixture employee', email: 'employee@roomqc.invalid',
    user_level_code: 'staff', hotel_id: ids.hotel, position_id: ids.position, reports_to: ids.supervisor,
    ...overrides} as unknown as UserWithRelations
}
function setup(user: UserWithRelations | null = employee()) {
  const props = {user, open: true, onOpenChange: vi.fn(), onSubmit: vi.fn().mockResolvedValue(undefined)}
  return {...render(<UserFormDialog {...props} />), props}
}
const selects = () => screen.getAllByRole('combobox') as HTMLSelectElement[]

describe('employee edit form state', () => {
  beforeEach(() => vi.clearAllMocks())

  it('hydrates the selected employee and retains its supervisor on initial open', async () => {
    setup()
    expect(await screen.findByDisplayValue('Fixture employee')).toBeInTheDocument()
    expect(screen.getByDisplayValue('employee@roomqc.invalid')).toBeDisabled()
    await waitFor(() => expect(selects().map(s => s.value)).toEqual(['staff', ids.hotel, ids.position, ids.supervisor]))
    expect(selects()[0]).toBeDisabled()
  })

  it.each(['manager', 'department_manager'])('does not replace the existing %s level with staff', async level => {
    setup(employee({user_level_code: level}))
    await waitFor(() => expect(selects()[0]).toHaveValue(level))
    expect(selects()[0]).toBeDisabled()
  })

  it('shows a stored owner level without adding it as a selectable creation permission', async () => {
    setup(employee({user_level_code: 'tenant_owner', hotel_id: null, position_id: null}))
    await waitFor(() => expect(selects()[0]).toHaveValue('tenant_owner'))
    expect(selects()[0]).toBeDisabled()
  })

  it('loads another selected employee while the dialog remains open', async () => {
    const {rerender, props} = setup()
    rerender(<UserFormDialog {...props} user={employee({id: 'employee-two', full_name: 'Second employee', reports_to: null})} />)
    expect(await screen.findByDisplayValue('Second employee')).toBeInTheDocument()
    await waitFor(() => expect(selects()[3]).toHaveValue('none'))
  })

  it('does not erase unsaved text when a query refresh returns the same identity', async () => {
    const {rerender, props} = setup()
    const name = await screen.findByDisplayValue('Fixture employee')
    fireEvent.change(name, {target: {value: 'Unsaved employee'}})
    rerender(<UserFormDialog {...props} user={employee({full_name: 'Refetched employee'})} />)
    expect(screen.getByDisplayValue('Unsaved employee')).toBeInTheDocument()
  })

  it('discards unsaved edits after close and reopen', async () => {
    const {rerender, props} = setup()
    fireEvent.change(await screen.findByDisplayValue('Fixture employee'), {target: {value: 'Unsaved employee'}})
    rerender(<UserFormDialog {...props} open={false} />)
    rerender(<UserFormDialog {...props} />)
    expect(await screen.findByDisplayValue('Fixture employee')).toBeInTheDocument()
  })

  it('clears hotel-dependent position and supervisor only when the user changes hotel', async () => {
    setup()
    await screen.findByDisplayValue('Fixture employee')
    await waitFor(() => expect(selects()[3]).toHaveValue(ids.supervisor))
    fireEvent.change(selects()[1], {target: {value: ids.second}})
    await waitFor(() => expect(selects()[2]).toHaveValue(''))
    expect(selects()[3]).toHaveValue('none')
  })

  it('submits the populated values without silently clearing reportsTo', async () => {
    const {props} = setup()
    await screen.findByDisplayValue('Fixture employee')
    fireEvent.click(screen.getByRole('button', {name: 'common:update'}))
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledWith({fullName: 'Fixture employee',
      email: 'employee@roomqc.invalid', userLevelCode: 'staff', hotelId: ids.hotel,
      positionId: ids.position, reportsTo: ids.supervisor}))
    expect(props.onOpenChange).toHaveBeenCalledWith(false)
  })

  it('does not close the dialog if saving fails', async () => {
    const {props} = setup()
    props.onSubmit.mockRejectedValueOnce(new Error('Owned save refusal'))
    await screen.findByDisplayValue('Fixture employee')
    fireEvent.click(screen.getByRole('button', {name: 'common:update'}))
    await waitFor(() => expect(props.onSubmit).toHaveBeenCalledOnce())
    await waitFor(() => expect(screen.getByRole('button', {name: 'common:update'})).toBeEnabled())
    expect(props.onOpenChange).not.toHaveBeenCalled()
  })

  it('resets to an empty invitation form when switching to create mode', async () => {
    const {rerender, props} = setup()
    await screen.findByDisplayValue('Fixture employee')
    rerender(<UserFormDialog {...props} user={null} />)
    await waitFor(() => expect(screen.queryByDisplayValue('Fixture employee')).not.toBeInTheDocument())
    expect(screen.getByPlaceholderText('users:form.emailPlaceholder')).toBeEnabled()
    expect(selects()[0]).toBeEnabled()
    expect(selects()[0]).toHaveValue('staff')
  })
  it('does not close a replacement dialog when the previous submission finishes', async () => {
    const f = setup(); let resolve!: () => void
    f.props.onSubmit.mockImplementationOnce(() => new Promise<void>(r => { resolve = r }))
    await screen.findByDisplayValue('Fixture employee')
    fireEvent.click(screen.getByRole('button', {name: 'common:update'}))
    await waitFor(() => expect(f.props.onSubmit).toHaveBeenCalledOnce())
    f.rerender(<UserFormDialog {...f.props} user={employee({id: 'employee-two', full_name: 'Second employee'})} submissionScope="new-session" />)
    await screen.findByDisplayValue('Second employee')
    await act(async () => resolve())
    expect(f.props.onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('Second employee')).toBeInTheDocument()
  })
  it('does not close a reopened same-identity dialog from an old response', async () => {
    const f = setup(); let resolve!: () => void
    f.props.onSubmit.mockImplementationOnce(() => new Promise<void>(r => { resolve = r }))
    await screen.findByDisplayValue('Fixture employee')
    fireEvent.click(screen.getByRole('button', {name: 'common:update'}))
    await waitFor(() => expect(f.props.onSubmit).toHaveBeenCalledOnce())
    f.rerender(<UserFormDialog {...f.props} open={false} />)
    f.rerender(<UserFormDialog {...f.props} />)
    await act(async () => resolve())
    expect(f.props.onOpenChange).not.toHaveBeenCalled()
  })
  it('rejects a duplicate submission before rerender updates the disabled button', async () => {
    const f = setup(); let resolve!: () => void
    f.props.onSubmit.mockImplementationOnce(() => new Promise<void>(r => { resolve = r }))
    await screen.findByDisplayValue('Fixture employee')
    const form = screen.getByRole('button', {name: 'common:update'}).closest('form')!
    fireEvent.submit(form); fireEvent.submit(form)
    await waitFor(() => expect(f.props.onSubmit).toHaveBeenCalledOnce())
    await act(async () => resolve())
  })
})
