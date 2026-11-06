import {fireEvent, render, screen, waitFor} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {beforeEach, describe, expect, it, vi} from 'vitest'
import {MobileUserProfilePage} from './MobileUserProfilePage'
const state = vi.hoisted(() => ({
  user: {id: 'owned-self', full_name: 'Owned profile', phone: '0901234567', avatar_url: 'https://avatar.roomqc.invalid/old.png',
    email: 'synthetic@roomqc.invalid', user_level_code: 'staff'},
  refetch: vi.fn(), updateProfile: vi.fn(), upload: vi.fn(), single: vi.fn(), success: vi.fn(), error: vi.fn(),
  changePasswordAsync: vi.fn(), checkPasswordChangeAsync: vi.fn(),
}))
vi.mock('@/hooks/useUser', () => ({useUser: () => ({user: state.user, refetch: state.refetch})}))
vi.mock('@/hooks/useProfile', () => ({useProfile: () => ({updateProfile: state.updateProfile,
  changePasswordAsync: state.changePasswordAsync, checkPasswordChangeAsync: state.checkPasswordChangeAsync,
  isUpdating: false, isChangingPassword: false})}))
vi.mock('@/components/layout/MobileDetailHeader', () => ({MobileDetailHeader: () => <h1>Thông tin cá nhân</h1>}))
vi.mock('@/components/profile/TelegramConnectionCard', () => ({TelegramConnectionCard: () => null}))
vi.mock('@/components/auth/PasswordStrengthMeter', () => ({PasswordStrengthMeter: () => null}))
vi.mock('sonner', () => ({toast: {success: state.success, error: state.error}}))
vi.mock('@/integrations/supabase/client', () => ({supabase: {
  storage: {from: () => ({upload: state.upload, getPublicUrl: () => ({data: {publicUrl: 'https://avatar.roomqc.invalid/new.png'}})})},
  from: () => ({update: () => ({eq: () => ({select: () => ({single: state.single})})})}),
}}))
const element = () => <MemoryRouter><MobileUserProfilePage /></MemoryRouter>
describe('mobile self-profile completion', () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.user = {...state.user, id: 'owned-self', full_name: 'Owned profile', phone: '0901234567',
      avatar_url: 'https://avatar.roomqc.invalid/old.png'}
    state.upload.mockResolvedValue({error: null}); state.refetch.mockResolvedValue({data: state.user})
    state.single.mockResolvedValue({data: {id: 'owned-self', avatar_url: 'https://avatar.roomqc.invalid/new.png'}, error: null})
    state.changePasswordAsync.mockResolvedValue({id: 'owned-self'})
    state.checkPasswordChangeAsync.mockResolvedValue(null)
  })
  it('keeps dirty text on refetch and updates untouched fields', async () => {
    const view = render(element())
    fireEvent.change(screen.getByLabelText('Họ và tên'), {target: {value: 'Unsaved local'}})
    state.user = {...state.user, full_name: 'Server name', phone: '0907654321'}; view.rerender(element())
    expect(screen.getByLabelText('Họ và tên')).toHaveValue('Unsaved local')
    await waitFor(() => expect(screen.getByLabelText('Số điện thoại')).toHaveValue('0907654321'))
  })
  it('preserves the old avatar and refuses success when profile save returns no row', async () => {
    state.single.mockResolvedValue({data: null, error: null}); const view = render(element())
    fireEvent.change(screen.getByLabelText('Chọn ảnh đại diện'), {target: {files: [new File(['owned'], 'owned.png', {type: 'image/png'})]}})
    await waitFor(() => expect(state.error).toHaveBeenCalledWith(expect.stringContaining('chưa xác nhận lưu hồ sơ')))
    expect(state.success).not.toHaveBeenCalled(); expect(state.refetch).not.toHaveBeenCalled()
    expect(view.container.querySelector<HTMLInputElement>('input[name="avatarUrl"]')?.value).toBe(state.user.avatar_url)
  })
  it('shows success only after saved-row confirmation and keeps unrelated unsaved text', async () => {
    const view = render(element())
    fireEvent.change(screen.getByLabelText('Họ và tên'), {target: {value: 'Unsaved local'}})
    fireEvent.change(screen.getByLabelText('Chọn ảnh đại diện'), {target: {files: [new File(['owned'], 'owned.png', {type: 'image/png'})]}})
    await waitFor(() => expect(state.success).toHaveBeenCalledExactlyOnceWith('Tải ảnh đại diện thành công'))
    expect(view.container.querySelector<HTMLInputElement>('input[name="avatarUrl"]')?.value).toBe('https://avatar.roomqc.invalid/new.png')
    expect(screen.getByLabelText('Họ và tên')).toHaveValue('Unsaved local')
  })
  it('sends an empty phone explicitly when the user clears it', async () => {
    render(element()); fireEvent.change(screen.getByLabelText('Số điện thoại'), {target: {value: ''}})
    fireEvent.click(screen.getByRole('button', {name: 'Lưu thay đổi'}))
    await waitFor(() => expect(state.updateProfile).toHaveBeenCalledWith(expect.objectContaining({phone: ''})))
  })
  it('passes both passwords and resets only after confirmed completion', async () => {
    let resolve!: (value: unknown) => void
    state.changePasswordAsync.mockImplementation(() => new Promise(done => { resolve = done }))
    render(element())
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), {target: {value: 'OwnedOld!123'}})
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), {target: {value: 'OwnedNew!123'}})
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), {target: {value: 'OwnedNew!123'}})
    fireEvent.click(screen.getByRole('button', {name: 'Đổi mật khẩu'}))
    await waitFor(() => expect(state.changePasswordAsync).toHaveBeenCalledWith({currentPassword: 'OwnedOld!123', newPassword: 'OwnedNew!123'}))
    expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue('OwnedNew!123')
    expect(screen.getByRole('button', {name: 'Đổi mật khẩu'})).toBeDisabled()
    resolve({id: 'owned-self'})
    await waitFor(() => expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue(''))
  })
  it('retains password inputs on a refusal and supports password-free readback', async () => {
    state.changePasswordAsync.mockRejectedValue(new Error('Owned refusal'))
    render(element())
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), {target: {value: 'OwnedOld!123'}})
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), {target: {value: 'OwnedNew!123'}})
    fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'), {target: {value: 'OwnedNew!123'}})
    fireEvent.click(screen.getByRole('button', {name: 'Đổi mật khẩu'}))
    await waitFor(() => expect(state.changePasswordAsync).toHaveBeenCalledOnce())
    expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue('OwnedNew!123')
    fireEvent.click(screen.getByRole('button', {name: 'Kiểm tra lần đổi trước'}))
    await waitFor(() => expect(state.checkPasswordChangeAsync).toHaveBeenCalledOnce())
    expect(state.changePasswordAsync).toHaveBeenCalledOnce()
  })
})
