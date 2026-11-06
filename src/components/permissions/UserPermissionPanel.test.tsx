import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { UserWithRelations } from '@/types/database.types'
import { authorityConfiguration, target, hotel, hotel2 } from '@/test/employee-authority-fixture'
const state = vi.hoisted(() => ({ config: null as unknown, scope: 'one', save: vi.fn(), refresh: vi.fn(), recover: vi.fn() }))
vi.mock('@/hooks/useUserPermissionConfiguration', () => ({ useUserPermissionConfiguration: (id: string, allowed: boolean) => ({
  scope: state.scope + id, data: allowed ? state.config : undefined, isReady: allowed, isLoading: false, isFetching: false, isSaving: false,
  pendingReady: true, pending: { grants: [], hotels: [] }, notice: null, refresh: state.refresh, save: state.save, recover: state.recover,
}) }))
vi.mock('@/hooks/useUserPermissions', () => ({ MODULES: [{ code: 'rooms', name: 'Phòng' }, { code: 'bookings', name: 'Đặt phòng' }],
  ACTIONS: [{ code: 'update', name: 'Chỉnh sửa' }, { code: 'create', name: 'Tạo mới' }, { code: 'view', name: 'Xem' }] }))
import { UserPermissionPanel } from './UserPermissionPanel'
const user = { id: target, full_name: 'Nhân viên Một', email: 'staff@roomqc.invalid', user_level_code: 'staff', updated_at: 'v1',
  hotel_id: hotel, roles: [] } as unknown as UserWithRelations
beforeEach(() => { vi.clearAllMocks(); state.config = authorityConfiguration(); state.scope = 'one'; state.save.mockResolvedValue({}); state.recover.mockResolvedValue({}) })
afterEach(cleanup)
function details() { fireEvent.click(screen.getByRole('button', { name: 'Chi tiết quyền Phòng' })) }
const save = () => screen.getByRole('button', { name: 'Lưu quyền bổ sung' })

describe('shared employee authority editor', () => {
  it('separates inherited rights from custom switches and renders all server catalog modules', () => {
    render(<UserPermissionPanel user={user} />); details()
    expect(screen.getByText('Kế thừa từ vai trò')).toBeVisible()
    expect(screen.getByRole('switch', { name: 'Quyền bổ sung Chỉnh sửa: Phòng' })).not.toBeChecked()
    expect(screen.getByText('extra_catalog')).toBeVisible()
    expect(screen.getByText(/Đang có 1\/1 quyền/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết quyền Đặt phòng' }))
    expect(screen.getByRole('switch', { name: 'Quyền bổ sung Tạo mới: Đặt phòng' })).toBeDisabled()
  })
  it('saves only the custom aggregate with the captured version, keeping inherited rights out of its payload', async () => {
    render(<UserPermissionPanel user={user} />); details()
    fireEvent.click(screen.getByRole('switch', { name: 'Quyền bổ sung Chỉnh sửa: Phòng' })); fireEvent.click(save())
    await waitFor(() => expect(state.save).toHaveBeenCalledWith('grants', [{ module: 'rooms', action: 'update', enabled: true }], '5'))
    expect(state.save).toHaveBeenCalledTimes(1)
  })
  it('keeps a dirty draft on refetch, blocks stale-version saves, and supports explicit discard', () => {
    const view = render(<UserPermissionPanel user={user} />); details()
    fireEvent.click(screen.getByRole('switch', { name: 'Quyền bổ sung Chỉnh sửa: Phòng' }))
    const next = authorityConfiguration(); next.versions.grants = '9'; state.config = next
    view.rerender(<UserPermissionPanel user={user} />)
    expect(screen.getByRole('switch', { name: 'Quyền bổ sung Chỉnh sửa: Phòng' })).toBeChecked()
    expect(screen.getByText(/Cấu hình đã thay đổi ở nơi khác/)).toBeVisible(); expect(save()).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ thay đổi và tải lại' }))
    expect(screen.getByRole('switch', { name: 'Quyền bổ sung Chỉnh sửa: Phòng' })).not.toBeChecked(); expect(state.refresh).toHaveBeenCalledTimes(1)
  })
  it('drops drafts when the target or captured runtime scope changes', () => {
    const view = render(<UserPermissionPanel user={user} />); details()
    fireEvent.click(screen.getByRole('switch', { name: 'Quyền bổ sung Chỉnh sửa: Phòng' })); expect(save()).toBeEnabled()
    view.rerender(<UserPermissionPanel user={{ ...user, id: hotel2 }} />); details(); expect(save()).toBeDisabled()
    fireEvent.click(screen.getByRole('switch', { name: 'Quyền bổ sung Chỉnh sửa: Phòng' })); state.scope = 'new-runtime'
    view.rerender(<UserPermissionPanel user={{ ...user, id: hotel2 }} />); expect(save()).toBeDisabled()
  })
  it('retains drafts across tabs and saves every hotel flag in a single aggregate', async () => {
    render(<UserPermissionPanel user={user} />); details()
    fireEvent.click(screen.getByRole('switch', { name: 'Quyền bổ sung Chỉnh sửa: Phòng' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Khách sạn' }))
    expect(screen.getByRole('checkbox', { name: 'Phân công Khách sạn Một' })).toBeDisabled()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Phân công Khách sạn Hai' }))
    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết quyền tại Khách sạn Hai' }))
    fireEvent.click(screen.getByRole('switch', { name: 'Tạo nhân viên tại Khách sạn Hai' }))
    fireEvent.click(screen.getByRole('tab', { name: 'Quyền sử dụng' }))
    expect(screen.getByRole('switch', { name: 'Quyền bổ sung Chỉnh sửa: Phòng' })).toBeChecked()
    fireEvent.click(screen.getByRole('tab', { name: 'Khách sạn' }))
    fireEvent.click(screen.getByRole('button', { name: 'Lưu phân công khách sạn' }))
    await waitFor(() => expect(state.save).toHaveBeenCalledWith('hotels', [
      { hotel_id: hotel, can_create_managers: false, can_create_staff: false, can_view_reports: true, can_export_data: false, can_approve_requests: false },
      { hotel_id: hotel2, can_create_managers: false, can_create_staff: true, can_view_reports: false, can_export_data: false, can_approve_requests: false },
    ], '7'))
    expect(state.save).toHaveBeenCalledTimes(1)
  })
  it('preserves unknown legacy grants until explicitly removed and never silently filters them', async () => {
    const data = authorityConfiguration(); data.grants.push({ module: 'legacy_old', action: 'view', enabled: false }); state.config = data
    render(<UserPermissionPanel user={user} />); details()
    fireEvent.click(screen.getByRole('switch', { name: 'Quyền bổ sung Chỉnh sửa: Phòng' }))
    expect(save()).toBeDisabled(); expect(screen.getByText(/legacy_old \/ view/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ cấu hình cũ legacy_old/view' })); fireEvent.click(save())
    await waitFor(() => expect(state.save).toHaveBeenCalledWith('grants', [{ module: 'rooms', action: 'update', enabled: true }], '5'))
  })
  it('shows out-of-scope old memberships and blocks destructive aggregate changes', () => {
    const data = authorityConfiguration(); data.hotel_catalog[0].assignable = false; state.config = data
    render(<UserPermissionPanel user={user} />); fireEvent.click(screen.getByRole('tab', { name: 'Khách sạn' }))
    expect(screen.getByText(/Có phân công hiện tại/)).toBeVisible()
    expect(screen.getByRole('checkbox', { name: 'Phân công Khách sạn Hai' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Lưu phân công khách sạn' })).toBeDisabled()
  })
  it('gives protected targets an accurate read-only explanation without an editable configuration', () => {
    render(<UserPermissionPanel user={{ ...user, user_level_code: 'tenant_owner' }} />)
    expect(screen.getByText(/Không chỉnh quyền qua màn phân quyền nhân viên/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Lưu quyền bổ sung' })).not.toBeInTheDocument()
  })
})
