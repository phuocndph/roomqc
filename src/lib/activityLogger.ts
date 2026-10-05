import { supabase } from '@/integrations/supabase/client'

interface LogActivityParams {
  action: string
  entityType: string
  entityId?: string
  entityName?: string
  description?: string
  oldValues?: any
  newValues?: any
}

export async function logActivity({
  action,
  entityType,
  entityId,
  entityName,
  description,
  oldValues,
  newValues,
}: LogActivityParams) {
  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Get user details
    const { data: userData } = await supabase
      .from('users')
      .select('full_name, tenant_id, role')
      .eq('id', user.id)
      .single()

    if (!userData) return

    // Get client IP (in production, this would come from headers)
    const ipAddress = await getClientIP()

    // Log the activity
    await supabase.from('activity_logs').insert({
      tenant_id: userData.tenant_id,
      user_id: user.id,
      user_name: userData.full_name,
      user_role: userData.role,
      action,
      entity_type: entityType,
      entity_id: entityId,
      entity_name: entityName,
      description: description || `${action} ${entityType}`,
      old_values: oldValues ? JSON.stringify(oldValues) : null,
      new_values: newValues ? JSON.stringify(newValues) : null,
      ip_address: ipAddress,
    })
  } catch (error) {
    console.error('Failed to log activity:', error)
    // Don't throw - logging failure shouldn't break the app
  }
}

async function getClientIP(): Promise<string | null> {
  try {
    const response = await fetch('https://api.ipify.org?format=json')
    const data = await response.json()
    return data.ip
  } catch {
    return null
  }
}

// Convenience functions for common actions
export const logCreate = (entityType: string, entityId: string, entityName: string, values?: any) =>
  logActivity({
    action: 'created',
    entityType,
    entityId,
    entityName,
    description: `Tạo ${entityType}: ${entityName}`,
    newValues: values,
  })

export const logUpdate = (
  entityType: string,
  entityId: string,
  entityName: string,
  oldValues?: any,
  newValues?: any
) =>
  logActivity({
    action: 'updated',
    entityType,
    entityId,
    entityName,
    description: `Cập nhật ${entityType}: ${entityName}`,
    oldValues,
    newValues,
  })

export const logDelete = (entityType: string, entityId: string, entityName: string, values?: any) =>
  logActivity({
    action: 'deleted',
    entityType,
    entityId,
    entityName,
    description: `Xóa ${entityType}: ${entityName}`,
    oldValues: values,
  })

export const logView = (entityType: string, entityId: string, entityName: string) =>
  logActivity({
    action: 'viewed',
    entityType,
    entityId,
    entityName,
    description: `Xem ${entityType}: ${entityName}`,
  })

export const logExport = (entityType: string, description: string) =>
  logActivity({
    action: 'exported',
    entityType,
    description: `Xuất dữ liệu: ${description}`,
  })

export const logLogin = () =>
  logActivity({
    action: 'login',
    entityType: 'auth',
    description: 'Đăng nhập hệ thống',
  })

export const logLogout = () =>
  logActivity({
    action: 'logout',
    entityType: 'auth',
    description: 'Đăng xuất hệ thống',
  })
