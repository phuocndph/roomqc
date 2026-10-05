import { createClient } from "npm:@supabase/supabase-js@2"
import { buildCorsHeaders } from "../_shared/cors.ts"

// Generate random password
function generatePassword(length: number = 12): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const lowercase = 'abcdefghijklmnopqrstuvwxyz'
  const numbers = '0123456789'
  const symbols = '!@#$%^&*'
  const allChars = uppercase + lowercase + numbers + symbols
  
  let password = ''
  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)]
  password += lowercase[Math.floor(Math.random() * lowercase.length)]
  password += numbers[Math.floor(Math.random() * numbers.length)]
  password += symbols[Math.floor(Math.random() * symbols.length)]
  
  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)]
  }
  
  // Shuffle the password
  return password.split('').sort(() => Math.random() - 0.5).join('')
}

interface CreateUserRequest {
  email: string
  fullName: string
  password: string
  tenantId: string
  userLevelCode: 'tenant_owner' | 'manager' | 'department_manager' | 'staff'
  hotelId?: string
  positionId?: string
  reportsTo?: string
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
    const requestData: CreateUserRequest = await req.json()
    const { email, fullName, password, tenantId, userLevelCode, hotelId, positionId, reportsTo } = requestData

    // Validate required fields
    if (!email || !fullName || !password || !tenantId || !userLevelCode) {
      throw new Error('Missing required fields: email, fullName, password, tenantId, userLevelCode')
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      throw new Error('Email không hợp lệ')
    }

    // Check for duplicate email in the same tenant
    const { data: existingUser, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id, email')
      .eq('tenant_id', tenantId)
      .eq('email', email.toLowerCase())
      .maybeSingle()

    if (checkError) {
      console.error('Error checking existing user:', checkError)
      throw new Error('Không thể kiểm tra email trùng lặp')
    }

    if (existingUser) {
      throw new Error('Email này đã được sử dụng trong hệ thống')
    }

    // Check if email exists in auth.users (orphaned user) — query trực tiếp theo email
    const normalizedEmail = email.toLowerCase().trim()
    // supabase-js admin does not expose getUserByEmail; use the supported
    // paginated list API for the small local/tenant user directory.
    const { data: authUsers, error: authUsersError } = await supabaseAdmin.auth.admin
      .listUsers({ page: 1, perPage: 1000 })
    if (authUsersError) {
      console.error('Error checking auth users:', authUsersError)
      throw new Error('Không thể kiểm tra tài khoản xác thực trùng lặp')
    }
    const orphanedAuthUser = authUsers.users.find(
      (authUser) => authUser.email?.toLowerCase() === normalizedEmail
    ) ?? null

    if (orphanedAuthUser) {
      console.log('Found orphaned auth user, deleting:', orphanedAuthUser.id)
      await supabaseAdmin.auth.admin.deleteUser(orphanedAuthUser.id)
    }

    console.log('Requesting user:', requestingUser.id)
    console.log('Creating user with level:', userLevelCode)

    // Check if requesting user has permission to create this level of user
    const { data: canCreate, error: permError } = await supabaseAdmin
      .rpc('can_create_user', {
        p_creator_id: requestingUser.id,
        p_new_user_level: userLevelCode,
        p_tenant_id: tenantId
      })

    if (permError) {
      console.error('Permission check error:', permError)
      throw new Error('Không thể kiểm tra quyền tạo người dùng')
    }

    if (!canCreate) {
      if (userLevelCode === 'tenant_owner') {
        throw new Error('Không thể tạo thêm Chủ sở hữu. Mỗi doanh nghiệp chỉ có một Chủ sở hữu.')
      } else if (userLevelCode === 'manager') {
        throw new Error('Bạn không có quyền tạo Quản lý. Chỉ Chủ sở hữu mới có quyền này.')
      } else {
        throw new Error('Bạn không có quyền tạo người dùng này')
      }
    }

    // Validate manager must have hotel_id
    if ((userLevelCode === 'manager' || userLevelCode === 'department_manager') && !hotelId) {
      throw new Error('Quản lý phải được gán cho một khách sạn cụ thể')
    }

    // Validate hotel exists if provided
    if (hotelId) {
      const { data: hotel, error: hotelError } = await supabaseAdmin
        .from('hotels')
        .select('id')
        .eq('id', hotelId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (hotelError || !hotel) {
        throw new Error('Khách sạn không tồn tại hoặc không thuộc doanh nghiệp này')
      }
    }

    // Positions carry the department used by permission templates. Keep the
    // denormalized users.department value in sync when an account is created.
    let positionDepartment: string | null = null
    if (positionId) {
      const { data: position, error: positionError } = await supabaseAdmin
        .from('positions')
        .select('department, user_level_code')
        .eq('id', positionId)
        .eq('tenant_id', tenantId)
        .maybeSingle()

      if (positionError || !position) {
        throw new Error('Vị trí không tồn tại hoặc không thuộc doanh nghiệp này')
      }

      if (position.user_level_code !== 'staff' && userLevelCode === 'staff') {
        throw new Error('Vị trí không phù hợp với cấp bậc người dùng')
      }
      positionDepartment = position.department
    }

    // Use password from request instead of generating
    console.log('Creating auth user...')
    
    // Create auth user with flag to skip handle_new_user trigger
    const { data: authUser, error: authUserError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        created_by_admin: 'true', // Flag to skip handle_new_user trigger
      }
    })

    if (authUserError) {
      console.error('Auth user creation error:', authUserError)
      throw new Error(`Không thể tạo tài khoản xác thực: ${authUserError.message}`)
    }

    console.log('Auth user created:', authUser.user.id)
    console.log('Creating user profile...')

    // Determine if this is primary owner
    let isPrimaryOwner = false
    if (userLevelCode === 'tenant_owner') {
      const { count } = await supabaseAdmin
        .from('users')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .eq('user_level_code', 'tenant_owner')
        .eq('is_primary_owner', true)
      
      isPrimaryOwner = (count === 0)
    }

    // Determine reports_to based on creator and user level
    let finalReportsTo = null
    if (userLevelCode === 'staff') {
      // If reportsTo is explicitly provided (Owner selecting manager), use it
      if (reportsTo) {
        finalReportsTo = reportsTo
      } else {
        // Check if creator is a manager - staff created by manager reports to that manager
        const { data: creatorData } = await supabaseAdmin
          .from('users')
          .select('user_level_code')
          .eq('id', requestingUser.id)
          .single()
        
        if (creatorData?.user_level_code === 'manager') {
          finalReportsTo = requestingUser.id
        }
      }
    }

    // Keep the legacy users.role column aligned with the authoritative user_roles row.
    // Several older policies and reports still read users.role directly.
    const roleMapping: { [key: string]: string } = {
      'tenant_owner': 'owner',
      'manager': 'hotel_manager',
      'department_manager': 'department_manager',
      'staff': 'staff'
    }
    const assignedRole = roleMapping[userLevelCode]

    // Create user profile
    const userProfile = {
      id: authUser.user.id,
      email: email.toLowerCase(),
      full_name: fullName,
      tenant_id: tenantId,
      role: assignedRole,
      user_level_code: userLevelCode,
      is_super_admin: false,
      is_primary_owner: isPrimaryOwner,
      status: 'active',
      department: positionDepartment,
      created_by: userLevelCode === 'tenant_owner' ? null : requestingUser.id,
      reports_to: finalReportsTo,
      must_change_password: true,
      login_count: 0,
      account_locked: false
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .insert(userProfile)
      .select()
      .single()

    if (userError) {
      console.error('User profile creation error:', userError)
      // Cleanup auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
      throw new Error(`Không thể tạo hồ sơ người dùng: ${userError.message}`)
    }

    console.log('User profile created:', user.id)

    // Create role assignment in user_roles
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: user.id,
        role: assignedRole,
        created_by: userLevelCode === 'tenant_owner' ? null : requestingUser.id
      })

    if (roleError) {
      console.error('Role assignment error:', roleError)
      // Cleanup on failure
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
      await supabaseAdmin.from('users').delete().eq('id', user.id)
      throw new Error('Không thể gán quyền cho người dùng')
    }

    console.log('Role assigned:', roleMapping[userLevelCode])

    // Update hotel_id and position_id in users table
    const updateData: any = {}
    if (hotelId) updateData.hotel_id = hotelId
    if (positionId) updateData.position_id = positionId

    if (Object.keys(updateData).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update(updateData)
        .eq('id', user.id)

      if (updateError) {
        console.error('User update error:', updateError)
      } else {
        console.log('User updated with hotel_id/position_id')
      }
    }

    // Create hotel assignment if hotel_id provided
    if (hotelId) {
      const { error: hotelAssignmentError } = await supabaseAdmin
        .from('user_hotels')
        .insert({
          user_id: user.id,
          hotel_id: hotelId,
          assigned_by: requestingUser.id,
          can_create_managers: userLevelCode === 'manager',
          can_create_staff: userLevelCode === 'manager' || userLevelCode === 'department_manager',
          can_view_reports: userLevelCode === 'manager' || userLevelCode === 'department_manager',
          can_export_data: userLevelCode === 'manager' || userLevelCode === 'department_manager',
          can_approve_requests: userLevelCode === 'manager' || userLevelCode === 'department_manager'
        })

      if (hotelAssignmentError) {
        console.error('Hotel assignment error:', hotelAssignmentError)
      } else {
        console.log('Hotel assignment created')
      }
    }

    // Log activity
    const { error: logError } = await supabaseAdmin
      .from('activity_logs')
      .insert({
        tenant_id: tenantId,
        user_id: requestingUser.id,
        user_name: fullName,
        entity_type: 'user',
        entity_id: user.id,
        entity_name: fullName,
        action: 'create',
        description: `Tạo người dùng mới: ${fullName} (${userLevelCode})`,
        new_values: { email, user_level_code: userLevelCode }
      })

    if (logError) {
      console.error('Activity log error:', logError)
    }

    // Create welcome notification for new user
    try {
      await supabaseAdmin.from('in_app_notifications').insert({
        user_id: authUser.user.id,
        tenant_id: tenantId,
        title: 'Chào mừng bạn đến với hệ thống! 👋',
        body: 'Tài khoản của bạn đã được tạo. Vui lòng đổi mật khẩu khi đăng nhập lần đầu.',
        type: 'welcome',
        icon: 'sparkles',
        is_read: false,
        metadata: { action: 'getting_started' }
      })
      console.log('Welcome notification created')
    } catch (notifError) {
      console.error('Welcome notification error:', notifError)
    }

    console.log('User creation completed successfully')

    // Get requesting user's name and hotel name for welcome email
    let createdByName = 'Quản trị viên'
    let hotelNameForEmail: string | undefined

    try {
      const { data: creatorData } = await supabaseAdmin
        .from('users')
        .select('full_name')
        .eq('id', requestingUser.id)
        .single()
      
      if (creatorData?.full_name) {
        createdByName = creatorData.full_name
      }

      if (hotelId) {
        const { data: hotelData } = await supabaseAdmin
          .from('hotels')
          .select('name')
          .eq('id', hotelId)
          .single()
        
        if (hotelData?.name) {
          hotelNameForEmail = hotelData.name
        }
      }
    } catch (queryError) {
      console.error('Error getting creator/hotel info:', queryError)
    }

    // Send welcome email to new user
    try {
      const welcomeEmailPayload = {
        email: email.toLowerCase(),
        fullName: fullName,
        isCreatedByAdmin: true,
        createdByName: createdByName,
        roleName: userLevelCode === 'manager'
          ? 'Quản lý'
          : userLevelCode === 'department_manager'
            ? 'Quản lý bộ phận'
            : 'Nhân viên',
        hotelName: hotelNameForEmail,
        tempPassword: password
      }

      console.log('Sending welcome email to new user...')
      
      const emailResponse = await fetch(`${supabaseUrl}/functions/v1/send-welcome-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`
        },
        body: JSON.stringify(welcomeEmailPayload)
      })

      if (emailResponse.ok) {
        console.log('Welcome email sent successfully')
      } else {
        const errorText = await emailResponse.text()
        console.error('Failed to send welcome email:', errorText)
      }
    } catch (emailError) {
      console.error('Error sending welcome email:', emailError)
      // Don't throw - email failure shouldn't block user creation
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          user_level_code: user.user_level_code,
          is_primary_owner: user.is_primary_owner
        },
        message: `Đã tạo tài khoản ${
          userLevelCode === 'manager'
            ? 'Quản lý'
            : userLevelCode === 'department_manager'
              ? 'Quản lý bộ phận'
              : 'Nhân viên'
        } thành công.`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )

  } catch (error) {
    console.error('Create user error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Không thể tạo người dùng'
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
