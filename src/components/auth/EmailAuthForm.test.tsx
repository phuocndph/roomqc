import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EmailAuthForm } from './EmailAuthForm'

const flow=vi.hoisted(()=>({send:vi.fn(),verify:vi.fn(),finish:vi.fn(),dispose:vi.fn()}))
vi.mock('@/lib/email-auth',()=>({createEmailAuthFlow:()=>flow}))
beforeEach(()=>{vi.clearAllMocks();flow.send.mockResolvedValue(undefined);flow.verify.mockResolvedValue({});flow.finish.mockResolvedValue(undefined)})
afterEach(cleanup)

it('uses neutral recovery copy and does not allow password entry until OTP verification succeeds',async()=>{
  render(<MemoryRouter><EmailAuthForm mode="recovery" /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Email'),{target:{value:'test@example.invalid'}})
  fireEvent.click(screen.getByRole('button',{name:'Gửi mã khôi phục'}))
  await screen.findByText(/Nếu email đã đăng ký/)
  expect(screen.queryByLabelText('Mật khẩu mới')).not.toBeInTheDocument()
  flow.verify.mockRejectedValueOnce(new Error('Mã đã hết hạn'))
  fireEvent.change(screen.getByLabelText('Mã xác minh 6 chữ số'),{target:{value:'123456'}})
  fireEvent.click(screen.getByRole('button',{name:'Xác minh mã'}))
  await screen.findByRole('alert')
  expect(screen.queryByLabelText('Mật khẩu mới')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'Xác minh mã'}))
  await screen.findByLabelText('Mật khẩu mới')
  expect(flow.finish).not.toHaveBeenCalled()
})

it('holds the form while verification is pending and preserves the password step after a failed acceptance',async()=>{
  let release:()=>void=()=>{}
  flow.verify.mockImplementationOnce(()=>new Promise(resolve=>{release=()=>resolve({})}))
  render(<MemoryRouter><EmailAuthForm mode="invite" /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Email'),{target:{value:'test@example.invalid'}})
  fireEvent.change(screen.getByLabelText('Mã xác minh 6 chữ số'),{target:{value:'123456'}})
  fireEvent.click(screen.getByRole('button',{name:'Xác minh mã'}))
  expect(screen.getByRole('button',{name:'Xác minh mã'})).toBeDisabled()
  release()
  await screen.findByLabelText('Mật khẩu mới')
  flow.finish.mockRejectedValueOnce(new Error('Chưa nhận được lời mời'))
  fireEvent.change(screen.getByLabelText('Mật khẩu mới'),{target:{value:'Secret!12345'}})
  fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'),{target:{value:'Secret!12345'}})
  fireEvent.click(screen.getByRole('button',{name:'Hoàn tất'}))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Mật khẩu mới')).toHaveValue('Secret!12345')
  fireEvent.click(screen.getByRole('button',{name:'Hoàn tất'}))
  await waitFor(()=>expect(screen.getByText('Bạn có thể đăng nhập bằng mật khẩu vừa đặt.')).toBeInTheDocument())
})
