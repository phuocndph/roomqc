import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserWithRelations } from '@/types/database.types'
import { UserManagementTab } from './UserManagementTab'
import { MobileUserListTab } from '@/components/settings/mobile/MobileUserListTab'

const state = vi.hoisted(() => ({
  actor: null as UserWithRelations | null, users: [] as UserWithRelations[],
  navigate: vi.fn(), info: vi.fn(), create: vi.fn(), update: vi.fn(),
}))
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }))
vi.mock('sonner', () => ({ toast: { info: state.info } }))
vi.mock('@/lib/workspace', () => ({ workspacePath: (p: string) => '/app/owned-demo' + p }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: state.actor }) }))
vi.mock('@/hooks/useUsers', () => ({
  useUsers: () => ({ users: state.users, isLoading: false }),
  useCreateUser: () => ({ mutateAsync: state.create }),
  useUpdateUser: () => ({ mutateAsync: state.update }),
}))
vi.mock('./UserHierarchyView', () => ({ UserHierarchyView: ({ users, onEdit }: {
  users: UserWithRelations[]; onEdit: (user: UserWithRelations) => void
}) => <>{users.map(u => <button key={u.id} onClick={() => onEdit(u)}>edit-{u.id}</button>)}</> }))
vi.mock('./UserTable', () => ({ UserTable: () => null }))
vi.mock('./UserStatsCards', () => ({ UserStatsCards: () => null }))
vi.mock('./UserFilters', () => ({ UserFilters: () => null }))
vi.mock('./PendingInvitations', () => ({ PendingInvitations: () => null }))
vi.mock('./UserFormDialog', () => ({ UserFormDialog: ({ user, open, onSubmit }: { user?: UserWithRelations; open: boolean; onSubmit: (data: unknown) => Promise<void> }) =>
  open ? <div role="dialog" data-user={user?.id || 'new'}>
    <button onClick={() => void onSubmit({ fullName: 'Owned draft' })}>submit-owned</button>
  </div> : null }))
vi.mock('@/components/settings/mobile/MobileUserCard', () => ({ MobileUserCard: ({ user, onEdit }: {
  user: UserWithRelations; onEdit: (u: UserWithRelations) => void
}) => <button onClick={() => onEdit(user)}>edit-{user.id}</button> }))
vi.mock('@/components/settings/mobile/MobileUserFiltersSheet', () => ({ MobileUserFiltersSheet: () => null }))

function user(id: string, level: string, extra: Record<string, unknown> = {}) {
  return { id, tenant_id: 'tenant-a', full_name: 'Owned ' + id, email: id + '@roomqc.invalid',
    user_level_code: level, status: 'active', is_primary_owner: level === 'tenant_owner',
    is_super_admin: false, updated_at: '2026-10-21T00:00:00Z', ...extra } as UserWithRelations
}
afterEach(cleanup)
beforeEach(() => {
  vi.clearAllMocks()
  state.actor = user('self', 'tenant_owner')
  state.users = [state.actor, user('employee', 'staff'), user('other-owner', 'tenant_owner')]
})

describe.each([['desktop', UserManagementTab], ['mobile', MobileUserListTab]] as const)('%s employee entry', (_, Component) => {
  it('opens the employee form without a profile redirect', () => {
    render(<Component />)
    fireEvent.click(screen.getByRole('button', { name: 'edit-employee' }))
    expect(screen.getByRole('dialog')).toHaveAttribute('data-user', 'employee')
    expect(state.navigate).not.toHaveBeenCalled()
    expect(state.update).not.toHaveBeenCalled()
  })
  it('routes self editing to the current workspace profile, not employee RPC', () => {
    render(<Component />)
    fireEvent.click(screen.getByRole('button', { name: 'edit-self' }))
    expect(state.navigate).toHaveBeenCalledWith('/app/owned-demo/profile', { replace: false })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(state.update).not.toHaveBeenCalled()
  })
  it('explains another owner target instead of opening a form guaranteed to fail', () => {
    render(<Component />)
    fireEvent.click(screen.getByRole('button', { name: 'edit-other-owner' }))
    expect(state.info).toHaveBeenCalledWith(expect.stringContaining('Hồ sơ cá nhân'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(state.navigate).not.toHaveBeenCalled()
  })
  it('keeps an employee edit deep link working', async () => {
    render(<Component editUserId="employee" />)
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('data-user', 'employee'))
    expect(state.navigate).not.toHaveBeenCalled()
  })
  it('replaces a self-edit deep link so Back does not redirect in a loop', async () => {
    render(<Component editUserId="self" />)
    await waitFor(() => expect(state.navigate).toHaveBeenCalledTimes(1))
    expect(state.navigate).toHaveBeenCalledWith('/app/owned-demo/profile', { replace: true })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('waits for actor identity before consuming an edit deep link', async () => {
    const actor = state.actor
    state.actor = null
    const { rerender } = render(<Component editUserId="self" />)
    expect(state.navigate).not.toHaveBeenCalled()
    expect(state.info).not.toHaveBeenCalled()
    state.actor = actor
    rerender(<Component editUserId="self" />)
    await waitFor(() => expect(state.navigate).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
  it('does not close another employee dialog from the previous save response', async () => {
    let resolve!: () => void
    state.update.mockImplementationOnce(() => new Promise<void>(r => { resolve = r }))
    state.users.push(user('second-employee', 'staff'))
    render(<Component />)
    fireEvent.click(screen.getByRole('button', { name: 'edit-employee' }))
    fireEvent.click(screen.getByRole('button', { name: 'submit-owned' }))
    await waitFor(() => expect(state.update).toHaveBeenCalledOnce())
    fireEvent.click(screen.getByRole('button', { name: 'edit-second-employee' }))
    await act(async () => resolve())
    expect(screen.getByRole('dialog')).toHaveAttribute('data-user', 'second-employee')
  })
})
