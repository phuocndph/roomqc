import { supabase } from '@/integrations/supabase/client'

export type SelfProfileUpdates = { full_name?: string; phone?: string; avatar_url?: string }
export class ProfileSaveNotConfirmedError extends Error {
  constructor(message = 'Chưa xác minh được hồ sơ đã lưu. Hãy tải lại hồ sơ để kiểm tra trước khi thử lại.') {
    super(message)
    this.name = 'ProfileSaveNotConfirmedError'
  }
}
export class ProfileIdentityChangedError extends Error {
  constructor() { super('Tài khoản đã thay đổi. Vui lòng mở lại hồ sơ cá nhân.'); this.name = 'ProfileIdentityChangedError' }
}

// Client bounds/confirmation are UX safeguards, never a substitute for server
// authorization. .single() also rejects an RLS-filtered zero-row UPDATE.
export async function saveSelfProfile(userId: string, updates: SelfProfileUpdates) {
  if (!userId) throw new ProfileSaveNotConfirmedError('Vui lòng đăng nhập lại trước khi sửa hồ sơ.')
  if (Object.keys(updates).some(key => !['full_name', 'phone', 'avatar_url'].includes(key))) {
    throw new ProfileSaveNotConfirmedError('Chỉ có thể sửa tên, điện thoại và ảnh đại diện tại đây.')
  }
  const changes = Object.fromEntries(Object.entries(updates).filter(([, value]) => value !== undefined))
  if (!Object.keys(changes).length) throw new ProfileSaveNotConfirmedError('Chưa có thông tin cần cập nhật.')
  const { data, error } = await supabase.from('users').update(changes).eq('id', userId)
    .select('id,full_name,phone,avatar_url').single()
  if (error) throw error
  if (!data || Array.isArray(data) || data.id !== userId ||
    !Object.entries(changes).every(([key, value]) => data[key as keyof typeof data] === value)) {
    throw new ProfileSaveNotConfirmedError()
  }
  return data
}

export async function uploadSelfProfileAvatar(userId: string, file: File, isCurrent = () => true) {
  const extensions: Record<string, string> = {'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif'}
  const extension = extensions[file.type]
  if (!extension) throw new ProfileSaveNotConfirmedError('Vui lòng chọn ảnh JPG, PNG, WebP hoặc GIF.')
  if (file.size > 5 * 1024 * 1024) throw new ProfileSaveNotConfirmedError('Kích thước ảnh tối đa 5MB.')
  if (!userId || !isCurrent()) throw new ProfileIdentityChangedError()
  const path = `${userId}/avatar-${crypto.randomUUID()}.${extension}`
  const bucket = supabase.storage.from('avatars')
  const {error} = await bucket.upload(path, file, {upsert: false, cacheControl: '3600'})
  if (error) throw error
  if (!isCurrent()) throw new ProfileIdentityChangedError()
  const {data: {publicUrl}} = bucket.getPublicUrl(path)
  if (!publicUrl) throw new ProfileSaveNotConfirmedError()
  try {
    const saved = await saveSelfProfile(userId, {avatar_url: publicUrl})
    if (!isCurrent()) throw new ProfileIdentityChangedError()
    return saved
  } catch (error) {
    if (error instanceof ProfileIdentityChangedError) throw error
    // A response can be lost after commit. Never delete either object on an
    // ambiguous failure; orphan cleanup needs reference/retention reconciliation.
    throw new ProfileSaveNotConfirmedError('Ảnh đã tải lên nhưng chưa xác nhận lưu hồ sơ. Hãy tải lại hồ sơ để kiểm tra trước khi thử lại.')
  }
}
