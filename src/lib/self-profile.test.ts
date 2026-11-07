import {beforeEach, describe, expect, it, vi} from 'vitest'
import {saveSelfProfile, uploadSelfProfileAvatar} from './self-profile'
const state = vi.hoisted(() => ({from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), single: vi.fn(),
  upload: vi.fn(), getPublicUrl: vi.fn(), remove: vi.fn()}))
vi.mock('@/integrations/supabase/client', () => ({supabase: {from: state.from,
  storage: {from: () => ({upload: state.upload, getPublicUrl: state.getPublicUrl, remove: state.remove})}}}))
const url = 'https://avatar.roomqc.invalid/owned.png'
const file = () => new File(['synthetic image'], 'untrusted-name.php', {type: 'image/png'})
describe('self-profile persistence and avatar completion', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.from.mockReturnValue({update: state.update}); state.update.mockReturnValue({eq: state.eq})
    state.eq.mockReturnValue({select: state.select}); state.select.mockReturnValue({single: state.single})
    state.single.mockResolvedValue({data: {id: 'owned-self', full_name: 'Owned profile', phone: '', avatar_url: url}, error: null})
    state.upload.mockResolvedValue({error: null}); state.getPublicUrl.mockReturnValue({data: {publicUrl: url}})
  })
  it('confirms exact values and identity, preserving an explicit blank phone', async () => {
    await expect(saveSelfProfile('owned-self', {full_name: 'Owned profile', phone: ''})).resolves.toMatchObject({id: 'owned-self'})
    expect(state.update).toHaveBeenCalledWith({full_name: 'Owned profile', phone: ''})
    expect(state.single).toHaveBeenCalledOnce()
  })
  it.each([null, [], {id: 'other-self'}, {id: 'owned-self', full_name: 'Old profile'}])('rejects unconfirmed data %s', async data => {
    state.single.mockResolvedValue({data, error: null})
    await expect(saveSelfProfile('owned-self', {full_name: 'Owned profile'})).rejects.toThrow('Chưa xác minh')
  })
  it('preserves server refusal', async () => {
    const error = {message: 'permission denied'}; state.single.mockResolvedValue({data: null, error})
    await expect(saveSelfProfile('owned-self', {phone: ''})).rejects.toEqual(error)
  })
  it('bounds client fields without pretending this replaces server authority', async () => {
    await expect(saveSelfProfile('owned-self', {role: 'owner'} as never)).rejects.toThrow('Chỉ có thể')
    expect(state.from).not.toHaveBeenCalled()
  })
  it('uses a new MIME-derived path and requires profile save after upload', async () => {
    await expect(uploadSelfProfileAvatar('owned-self', file())).resolves.toMatchObject({avatar_url: url})
    expect(state.upload).toHaveBeenCalledWith(expect.stringMatching(/^owned-self\/avatar-[a-f0-9-]+\.png$/), expect.any(File),
      {upsert: false, cacheControl: '3600'})
    expect(state.update).toHaveBeenCalledWith({avatar_url: url})
    expect(state.remove).not.toHaveBeenCalled()
  })
  it.each([null, {id: 'wrong-self', avatar_url: url}])('does not treat upload alone as saved profile (%s)', async data => {
    state.single.mockResolvedValue({data, error: null})
    await expect(uploadSelfProfileAvatar('owned-self', file())).rejects.toThrow('chưa xác nhận lưu hồ sơ')
    expect(state.remove).not.toHaveBeenCalled()
  })
  it('does not delete a possibly referenced object after lost save response', async () => {
    state.single.mockRejectedValue(new Error('Network response lost'))
    await expect(uploadSelfProfileAvatar('owned-self', file())).rejects.toThrow('tải lại hồ sơ')
    expect(state.remove).not.toHaveBeenCalled()
  })
  it('stops before profile persistence if identity changes during upload', async () => {
    const isCurrent = vi.fn().mockReturnValueOnce(true).mockReturnValue(false)
    await expect(uploadSelfProfileAvatar('owned-self', file(), isCurrent)).rejects.toThrow('Tài khoản đã thay đổi')
    expect(state.from).not.toHaveBeenCalled(); expect(state.remove).not.toHaveBeenCalled()
  })
  it('does not persist a URL when upload fails', async () => {
    state.upload.mockResolvedValue({error: new Error('Upload failed')})
    await expect(uploadSelfProfileAvatar('owned-self', file())).rejects.toThrow('Upload failed')
    expect(state.from).not.toHaveBeenCalled()
  })
  it.each(['image/svg+xml', 'text/plain'])('refuses unsupported content before upload (%s)', async type => {
    await expect(uploadSelfProfileAvatar('owned-self', new File(['synthetic'], 'owned', {type}))).rejects.toThrow('chọn ảnh')
    expect(state.upload).not.toHaveBeenCalled()
  })
  it('refuses a file over 5MB before upload', async () => {
    await expect(uploadSelfProfileAvatar('owned-self', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'owned.png',
      {type: 'image/png'}))).rejects.toThrow('5MB')
    expect(state.upload).not.toHaveBeenCalled()
  })
})
