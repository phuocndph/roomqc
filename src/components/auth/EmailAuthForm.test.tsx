import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { EmailAuthForm } from './EmailAuthForm'

const flow=vi.hoisted(()=>({send:vi.fn(),verify:vi.fn(),finish:vi.fn(),check:vi.fn(),dispose:vi.fn()}))
const factory=vi.hoisted(()=>vi.fn())
vi.mock('@/lib/email-auth',()=>({createEmailAuthFlow:factory}))
beforeEach(()=>{vi.clearAllMocks();factory.mockReset().mockReturnValue(flow);flow.send.mockResolvedValue(undefined);flow.verify.mockResolvedValue({});flow.finish.mockResolvedValue({completion:'submitted'});flow.check.mockResolvedValue({completion:'previous'});flow.dispose.mockResolvedValue(undefined)})
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

async function enterPasswordStep() {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.invalid' } })
  fireEvent.change(screen.getByLabelText('Mã xác minh 6 chữ số'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác minh mã' }))
  await screen.findByLabelText('Mật khẩu mới')
}

it('checks a prior operation without password input and distinguishes previous completion from a new password', async () => {
  render(<MemoryRouter><EmailAuthForm mode="invite" /></MemoryRouter>)
  await enterPasswordStep()
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra kết quả / tiếp tục lời mời' }))
  await screen.findByText('Đã xác nhận lần đặt mật khẩu trước. Hãy dùng mật khẩu của lần đó để đăng nhập.')
  expect(flow.check).toHaveBeenCalledWith('invite')
  expect(flow.finish).not.toHaveBeenCalled()
  expect(screen.queryByText('Bạn có thể đăng nhập bằng mật khẩu vừa đặt.')).not.toBeInTheDocument()
})

it('keeps an unknown outcome actionable without clearing inputs or showing completion', async () => {
  render(<MemoryRouter><EmailAuthForm mode="invite" /></MemoryRouter>)
  await enterPasswordStep()
  flow.check.mockRejectedValueOnce(new Error('Chưa xác nhận được kết quả'))
  fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra kết quả / tiếp tục lời mời' }))
  await screen.findByRole('alert')
  expect(screen.getByLabelText('Mật khẩu mới')).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Hoàn tất' })).not.toBeInTheDocument()
  expect(flow.finish).not.toHaveBeenCalled()
})

it('does not advance a new mode when the previous OTP response arrives late', async () => {
  let release!: () => void
  flow.verify.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({}) }))
  const next = { ...flow, dispose: vi.fn().mockResolvedValue(undefined) }
  factory.mockReturnValueOnce(flow).mockReturnValueOnce(next)
  const view = render(<MemoryRouter><EmailAuthForm mode="invite" /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.invalid' } })
  fireEvent.change(screen.getByLabelText('Mã xác minh 6 chữ số'), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: 'Xác minh mã' }))
  view.rerender(<MemoryRouter><EmailAuthForm mode="recovery" /></MemoryRouter>)
  await act(async () => { release() })
  expect(screen.getByRole('button', { name: 'Gửi mã khôi phục' })).toBeEnabled()
  expect(screen.queryByLabelText('Mật khẩu mới')).not.toBeInTheDocument()
  expect(flow.dispose).toHaveBeenCalledTimes(1)
})

it('ignores an old send error after mode replacement and catches rejected cleanup', async () => {
  let reject!: (error: Error) => void
  flow.send.mockImplementationOnce(() => new Promise((_, fail) => { reject = fail }))
  flow.dispose.mockRejectedValueOnce(new Error('private cleanup detail'))
  factory.mockReturnValueOnce(flow).mockReturnValueOnce({ ...flow, dispose: vi.fn().mockResolvedValue(undefined) })
  const view = render(<MemoryRouter><EmailAuthForm mode="recovery" /></MemoryRouter>)
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'test@example.invalid' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi mã khôi phục' }))
  view.rerender(<MemoryRouter><EmailAuthForm mode="invite" /></MemoryRouter>)
  await act(async () => { reject(new Error('old send failure')) })
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Xác minh mã' })).toBeEnabled()
})

it('single-flights same-render submits and does not publish a late finish into the next mode', async () => {
  let release!: () => void
  flow.finish.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ completion: 'submitted' }) }))
  factory.mockReturnValueOnce(flow).mockReturnValueOnce({ ...flow, dispose: vi.fn().mockResolvedValue(undefined) })
  const view = render(<MemoryRouter><EmailAuthForm mode="invite" /></MemoryRouter>)
  await enterPasswordStep()
  fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'OwnedNew!12345' } })
  fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), { target: { value: 'OwnedNew!12345' } })
  const button = screen.getByRole('button', { name: 'Hoàn tất' })
  fireEvent.click(button); fireEvent.click(button)
  expect(flow.finish).toHaveBeenCalledTimes(1)
  view.rerender(<MemoryRouter><EmailAuthForm mode="recovery" /></MemoryRouter>)
  await act(async () => { release() })
  expect(screen.getByRole('button', { name: 'Gửi mã khôi phục' })).toBeEnabled()
  expect(screen.queryByRole('heading', { name: 'Hoàn tất' })).not.toBeInTheDocument()
})
