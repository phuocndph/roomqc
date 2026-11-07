import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChangePasswordForm } from './ChangePasswordForm'

const state=vi.hoisted(()=>({changePassword:vi.fn(),changePasswordAsync:vi.fn()}))
vi.mock('@/hooks/useProfile',()=>({useProfile:()=>({...state,isChangingPassword:false})}))
vi.mock('@/components/auth/PasswordStrengthMeter',()=>({PasswordStrengthMeter:()=>null}))
function fill() {
  fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'),{target:{value:'OwnedOld!123'}})
  fireEvent.change(screen.getByLabelText('Mật khẩu mới'),{target:{value:'OwnedNew!123'}})
  fireEvent.change(screen.getByLabelText('Xác nhận mật khẩu mới'),{target:{value:'OwnedNew!123'}})
  fireEvent.click(screen.getByRole('button',{name:'Đổi mật khẩu'}))
}
describe('password form completion contract',()=>{
  beforeEach(()=>{vi.clearAllMocks();state.changePasswordAsync.mockResolvedValue(undefined)})
  it('passes the entered current password to the awaited ordinary-change operation',async()=>{
    render(<ChangePasswordForm/>);fill()
    await waitFor(()=>expect(state.changePasswordAsync).toHaveBeenCalledWith({currentPassword:'OwnedOld!123',newPassword:'OwnedNew!123'}))
  })
  it('does not clear credentials while the operation has no confirmed result',async()=>{
    let resolve!:()=>void
    state.changePasswordAsync.mockImplementation(()=>new Promise<void>(done=>{resolve=done}))
    render(<ChangePasswordForm/>);fill()
    await waitFor(()=>expect(state.changePasswordAsync).toHaveBeenCalledOnce())
    expect(screen.getByLabelText('Mật khẩu hiện tại')).toHaveValue('OwnedOld!123')
    expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue('OwnedNew!123')
    resolve();await waitFor(()=>expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue(''))
  })
  it('preserves inputs when the Auth operation refuses the change',async()=>{
    state.changePasswordAsync.mockRejectedValue(new Error('Owned password refusal'))
    render(<ChangePasswordForm/>);fill()
    await waitFor(()=>expect(state.changePasswordAsync).toHaveBeenCalledOnce())
    expect(screen.getByLabelText('Mật khẩu hiện tại')).toHaveValue('OwnedOld!123')
    expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue('OwnedNew!123')
  })
})
