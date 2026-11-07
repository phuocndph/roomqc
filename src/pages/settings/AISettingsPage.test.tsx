import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { FunctionsHttpError } from '@supabase/supabase-js'
import AISettingsPage from './AISettingsPage'

const state = vi.hoisted(() => ({
  load: vi.fn(), invoke: vi.fn(), upsert: vi.fn(), save: vi.fn(), errorToast: vi.fn(), successToast: vi.fn(),
  tenant: 'tenant-1' as string | null, role: 'owner',
}))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: () => ({
    select: () => ({ eq: (...args: unknown[]) => state.load(...args) }),
    upsert: (...args: unknown[]) => {
      state.upsert(...args)
      return { select: () => ({ single: () => state.save() }) }
    },
  }), functions: { invoke: (...args: unknown[]) => state.invoke(...args) },
} }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ user: { id: 'user-1' }, role: state.role, isLoading: false }) }))
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ tenant: state.tenant ? { id: state.tenant } : null, isLoading: false, error: null }) }))
vi.mock('sonner', () => ({ toast: { error: (...args: unknown[]) => state.errorToast(...args), success: (...args: unknown[]) => state.successToast(...args) } }))

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retryDelay: 1, gcTime: 0 } } })
  const app = () => <QueryClientProvider client={client}><MemoryRouter><AISettingsPage /></MemoryRouter></QueryClientProvider>
  const view = render(app())
  return { client, ...view, app }
}
async function loaded() {
  await waitFor(() => expect(screen.getByRole('button', { name: 'Chạy thử' })).toBeEnabled())
}
const settings = [{ config_key: 'ocr_model', config_value: 'gemini-3-flash' }]

describe('AI settings error recovery and truthful tests', () => {
  beforeEach(() => {
    state.tenant = 'tenant-1'
    state.role = 'owner'
    state.load.mockReset().mockResolvedValue({ data: settings, error: null })
    state.invoke.mockReset().mockResolvedValue({ data: { data: [{ id: 'gemini-3-flash', vision: true }, { id: 'gemini-2.5-flash', vision: true }] }, error: null })
    state.upsert.mockReset()
    state.save.mockReset().mockResolvedValue({ data: { config_key: 'ocr_model', config_value: 'gemini-2.5-flash' }, error: null })
    state.errorToast.mockReset()
    state.successToast.mockReset()
  })
  it('blocks editing after load errors, scopes the request, and recovers on retry', async () => {
    state.load.mockResolvedValue({ data: null, error: { message: 'network failure' } })
    setup()
    expect(await screen.findByText('Không tải được cấu hình AI đã lưu')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu cấu hình' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Chạy thử' })).toBeDisabled()
    expect(state.load).toHaveBeenCalledWith('tenant_id', 'tenant-1')
    state.load.mockResolvedValue({ data: settings, error: null })
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    await loaded()
    expect(screen.getByRole('combobox', { name: 'AI đọc giấy tờ' })).toHaveTextContent('gemini-3-flash')
    expect(state.upsert).not.toHaveBeenCalled()
  })
  it('blocks testing an unsaved selection, preserves failed saves, and verifies the saved response', async () => {
    setup()
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại mặc định' }))
    expect(screen.getByText('Có thay đổi chưa lưu.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chạy thử' })).toBeDisabled()
    state.save.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } })
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }))
    await waitFor(() => expect(state.errorToast).toHaveBeenCalledOnce())
    expect(state.successToast).not.toHaveBeenCalled()
    expect(screen.getByRole('combobox')).toHaveTextContent('gemini-2.5-flash')
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' }))
    await waitFor(() => expect(state.successToast).toHaveBeenCalledOnce())
    expect(state.upsert).toHaveBeenLastCalledWith({ tenant_id: 'tenant-1', config_key: 'ocr_model', config_value: 'gemini-2.5-flash', updated_by: 'user-1' }, { onConflict: 'tenant_id,config_key' })
    expect(screen.getByText('Đang dùng: gemini-2.5-flash')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chạy thử' })).toBeEnabled()
  })
  it('preserves an unavailable saved model and allows retrying the model catalogue', async () => {
    state.load.mockResolvedValue({ data: [{ config_key: 'ocr_model', config_value: 'custom-vision' }], error: null })
    state.invoke.mockResolvedValue({ data: null, error: new Error('network error') })
    setup()
    await loaded()
    expect(await screen.findByText('Chưa cập nhật được danh sách model')).toBeInTheDocument()
    expect(screen.getByRole('combobox')).toHaveTextContent('custom-vision')
    state.invoke.mockResolvedValue({ data: { data: [{ id: 'custom-vision', vision: true }] }, error: null })
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại danh sách' }))
    await waitFor(() => expect(screen.queryByText('Chưa cập nhật được danh sách model')).not.toBeInTheDocument())
    expect(screen.getByRole('combobox')).toHaveTextContent('custom-vision')
    expect(state.upsert).not.toHaveBeenCalled()
  })
  it.each([
    [422, 'Ảnh không phải giấy tờ tùy thân. Vui lòng chụp rõ mặt trước', 'Đã nhận phản hồi'],
    [422, 'Lỗi không xác định', 'Chưa kiểm tra thành công'],
    [401, 'Invalid API key', 'Chưa kiểm tra thành công'],
    [503, 'Provider unavailable', 'Chưa kiểm tra thành công'],
  ])('reports HTTP %s honestly', async (status, message, title) => {
    setup()
    await loaded()
    state.invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError(new Response(JSON.stringify({ error: message }), { status })) })
    fireEvent.click(screen.getByRole('button', { name: 'Chạy thử' }))
    expect(await screen.findByText(title)).toBeInTheDocument()
    expect(state.invoke).toHaveBeenLastCalledWith('scan-guest-document', { body: { imageBase64: expect.any(String), documentType: 'cccd' } })
  })
  it.each([{ error: 'Provider error' }, {}, null])('does not report success for malformed payloads: %s', async data => {
    setup()
    await loaded()
    state.invoke.mockResolvedValueOnce({ data, error: null })
    fireEvent.click(screen.getByRole('button', { name: 'Chạy thử' }))
    expect(await screen.findByText('Chưa kiểm tra thành công')).toBeInTheDocument()
  })
  it('clears unsaved selections and results when changing tenant', async () => {
    const view = setup()
    await loaded()
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại mặc định' }))
    state.tenant = 'tenant-2'
    state.load.mockResolvedValue({ data: [{ config_key: 'ocr_model', config_value: 'custom-2' }], error: null })
    view.rerender(view.app())
    await waitFor(() => expect(screen.getByRole('combobox')).toHaveTextContent('custom-2'))
    expect(screen.queryByText('Có thay đổi chưa lưu.')).not.toBeInTheDocument()
    expect(state.load).toHaveBeenLastCalledWith('tenant_id', 'tenant-2')
  })
  it('handles a missing tenant without loading forever', () => {
    state.tenant = null
    setup()
    expect(screen.getByText('Chưa tải được thông tin doanh nghiệp')).toBeInTheDocument()
    expect(state.load).not.toHaveBeenCalled()
  })
  it('does not request AI configuration for staff', () => {
    state.role = 'staff'
    setup()
    expect(screen.getByText('Không có quyền truy cập')).toBeInTheDocument()
    expect(state.load).not.toHaveBeenCalled()
    expect(state.invoke).not.toHaveBeenCalled()
  })
})
