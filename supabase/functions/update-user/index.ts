import { createClient } from "npm:@supabase/supabase-js@2"
import { buildCorsHeaders } from "../_shared/cors.ts"

interface UpdateUserRequest {
  userId: string
  fullName?: string
  phone?: string
  userLevelCode?: 'tenant_owner' | 'manager' | 'department_manager' | 'staff'
  hotelId?: string
  positionId?: string
  departments?: string[]
  status?: 'active' | 'inactive' | 'suspended'
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Create Supabase admin client
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey)

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header')
    }

    // Verify the user making the request
    const token = authHeader.replace('Bearer ', '')
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !requestingUser) {
      console.error('Auth error:', authError)
      throw new Error('Unauthorized')
    }

    // Parse request body
    const requestData: UpdateUserRequest = await req.json()
    const { userId, fullName, phone, userLevelCode, hotelId, positionId, departments, status } = requestData

    // Validate required fields
    if (!userId) {
      throw new Error('userId is required')
    }

    console.log('Requesting user:', requestingUser.id)
    console.log('Updating user:', userId)

    // Get current user data
    const { data: targetUser, error: getUserError } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()

    if (getUserError || !targetUser) {
      throw new Error('Không tìm thấy người dùng')
    }

    // Check if requesting user can manage target user
    const { data: canManage, error: permError } = await supabaseAdmin
      .rpc('can_manage_user', {
        p_manager_id: requestingUser.id,
        p_target_user_id: userId
      })

    if (permError) {
      console.error('Permission check error:', permError)
      throw new Error('Không thể kiểm tra quyền chỉnh sửa người dùng')
    }

    if (!canManage) {
      throw new Error('Bạn không có quyền chỉnh sửa người dùng này')
    }

    // Prevent changing owner's level
    if (targetUser.user_level_code === 'tenant_owner' && userLevelCode && userLevelCode !== 'tenant_owner') {
      throw new Error('Không thể thay đổi cấp bậc của Chủ sở hữu')
    }

    // Prevent changing primary owner status
    if (targetUser.is_primary_owner && userLevelCode && userLevelCode !== 'tenant_owner') {
      throw new Error('Không thể thay đổi cấp bậc của Chủ sở hữu chính')
    }

    // Validate manager must have hotel_id
    if (
      (userLevelCode === 'manager' || userLevelCode === 'department_manager')
      && !hotelId
      && !targetUser.hotel_id
    ) {
      throw new Error('Quản lý phải được gán cho một khách sạn cụ thể')
    }

    // Validate hotel exists if provided
    if (hotelId) {
      const { data: hotel, error: hotelError } = await supabaseAdmin
        .from('hotels')
        .select('id')
        .eq('id', hotelId)
        .eq('tenant_id', targetUser.tenant_id)
        .maybeSingle()

      if (hotelError || !hotel) {
        throw new Error('Khách sạn không tồn tại hoặc không thuộc doanh nghiệp này')
      }
    }

    // Check if user has subordinates when trying to change level
    if (userLevelCode && userLevelCode !== targetUser.user_level_code) {
      const { data: hasSubordinates } = await supabaseAdmin
        .rpc('user_has_subordinates', {
          p_user_id: userId
        })

      if (hasSubordinates) {
        throw new Error('Không thể thay đổi cấp bậc của người dùng này vì họ đang quản lý người khác. Vui lòng chuyển quyền quản lý trước.')
      }
    }

    console.log('Updating user profile...')

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (fullName) updateData.full_name = fullName
    if (phone !== undefined) updateData.phone = phone
    if (userLevelCode) {
      const roleMapping: Record<string, string> = {
        tenant_owner: 'owner',
        manager: 'hotel_manager',
        department_manager: 'department_manager',
        staff: 'staff',
      }
      updateData.user_level_code = userLevelCode
      updateData.role = roleMapping[userLevelCode]
    }
    if (status) updateData.status = status

    // Update user profile
    const { data: updatedUser, error: updateError } = await supabaseAdmin
      .from('users')
      .update(updateData)
      .eq('id', userId)
      .select()
      .single()

    if (updateError) {
      console.error('User update error:', updateError)
      throw new Error(`Không thể cập nhật người dùng: ${updateError.message}`)
    }

    console.log('User profile updated:', updatedUser.id)

    // Update hotel assignment if provided
    if (hotelId || departments) {
      const { data: existingAssignment } = await supabaseAdmin
        .from('user_hotels')
        .select('*')
        .eq('user_id', userId)
        .eq('hotel_id', hotelId || targetUser.hotel_id)
        .maybeSingle()

      if (existingAssignment) {
        // Update existing assignment
        const updateAssignment: any = {}
        if (departments) updateAssignment.departments = departments
        
        await supabaseAdmin
          .from('user_hotels')
          .update(updateAssignment)
          .eq('id', existingAssignment.id)
      } else if (hotelId) {
        // Create new assignment
        await supabaseAdmin
          .from('user_hotels')
          .insert({
            user_id: userId,
            hotel_id: hotelId,
            departments: departments || [],
            is_default: true,
            is_active: true,
            assigned_by: requestingUser.id,
            can_create_managers: userLevelCode === 'manager',
            can_create_staff: userLevelCode === 'manager' || userLevelCode === 'department_manager',
            can_view_reports: userLevelCode === 'manager' || userLevelCode === 'department_manager',
            can_export_data: userLevelCode === 'manager' || userLevelCode === 'department_manager',
            can_approve_requests: userLevelCode === 'manager' || userLevelCode === 'department_manager'
          })
      }
    }

    // Keep the authoritative app role in sync when an account level changes.
    if (userLevelCode) {
      const roleMapping: Record<string, string> = {
        tenant_owner: 'owner',
        manager: 'hotel_manager',
        department_manager: 'department_manager',
        staff: 'staff',
      }
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .upsert({
          user_id: userId,
          role: roleMapping[userLevelCode],
          created_by: requestingUser.id,
        }, { onConflict: 'user_id,role' })

      if (roleError) {
        throw new Error(`Không thể đồng bộ vai trò: ${roleError.message}`)
      }

      await supabaseAdmin
        .from('user_roles')
        .delete()
        .eq('user_id', userId)
        .in('role', ['owner', 'hotel_manager', 'department_manager', 'staff'])
        .neq('role', roleMapping[userLevelCode])
    }

    // Log activity
    const changes: any = {}
    if (fullName && fullName !== targetUser.full_name) changes.full_name = { old: targetUser.full_name, new: fullName }
    if (phone !== undefined && phone !== targetUser.phone) changes.phone = { old: targetUser.phone, new: phone }
    if (userLevelCode && userLevelCode !== targetUser.user_level_code) changes.user_level_code = { old: targetUser.user_level_code, new: userLevelCode }
    if (status && status !== targetUser.status) changes.status = { old: targetUser.status, new: status }

    const { error: logError } = await supabaseAdmin
      .from('activity_logs')
      .insert({
        tenant_id: targetUser.tenant_id,
        user_id: requestingUser.id,
        user_name: targetUser.full_name,
        entity_type: 'user',
        entity_id: userId,
        entity_name: targetUser.full_name,
        action: 'update',
        description: `Cập nhật thông tin người dùng: ${targetUser.full_name}`,
        old_values: targetUser,
        new_values: changes
      })

    if (logError) {
      console.error('Activity log error:', logError)
    }

    console.log('User update completed successfully')

    return new Response(
      JSON.stringify({
        success: true,
        user: updatedUser,
        message: 'Đã cập nhật thông tin người dùng thành công'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Update user error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Không thể cập nhật người dùng'
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
