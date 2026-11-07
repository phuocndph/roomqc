import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileForm } from './ProfileForm'
const state = vi.hoisted(() => ({user: null as null | {id: string; full_name: string; phone: string; avatar_url: string; email: string}}))
vi.mock('@/hooks/useUser', () => ({useUser: () => ({user: state.user})}))
vi.mock('@/hooks/useProfile', () => ({useProfile: () => ({updateProfile: vi.fn(), isUpdating: false})}))
vi.mock('@/components/users/UserAvatar', () => ({UserAvatar: () => <span>avatar</span>}))
const profile = (id = 'owned-self', full_name = 'Owned profile') => ({id, full_name, phone: '0901234567', avatar_url: '', email: 'synthetic@roomqc.invalid'})
describe('self-profile form hydration', () => {
  beforeEach(() => { state.user = null })
  it('hydrates a profile that arrives after the first render', async () => {
    const view = render(<ProfileForm />); state.user = profile(); view.rerender(<ProfileForm />)
    await waitFor(() => expect(screen.getByLabelText('Họ và tên')).toHaveValue('Owned profile'))
  })
  it('keeps an unsaved edit when the same profile refetches', async () => {
    state.user = profile(); const view = render(<ProfileForm />)
    fireEvent.change(screen.getByLabelText('Họ và tên'), {target: {value: 'Unsaved local name'}})
    state.user = {...profile(), phone: '0907654321'}; view.rerender(<ProfileForm />)
    expect(screen.getByLabelText('Họ và tên')).toHaveValue('Unsaved local name')
    await waitFor(() => expect(screen.getByLabelText('Số điện thoại')).toHaveValue('0907654321'))
  })
  it('does not carry another identity\'s unsaved text into a new profile', async () => {
    state.user = profile(); const view = render(<ProfileForm />)
    fireEvent.change(screen.getByLabelText('Họ và tên'), {target: {value: 'Unsaved old identity'}})
    state.user = profile('other-owned-self', 'Other profile'); view.rerender(<ProfileForm />)
    await waitFor(() => expect(screen.getByLabelText('Họ và tên')).toHaveValue('Other profile'))
  })
})
