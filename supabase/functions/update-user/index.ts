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

const USER_LEVELS = new Set(['tenant_owner', 'manager', 'department_manager', 'staff'])
const USER_STATUSES = new Set(['active', 'inactive', 'suspended'])

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

    // Parse and validate the untrusted request at runtime. TypeScript unions do
    // not protect an Edge function from JSON values such as "super_admin".
    const requestData: unknown = await req.json()
    if (!requestData || typeof requestData !== 'object' || Array.isArray(requestData)) {
      throw new Error('Dữ liệu cập nhật không hợp lệ')
    }
    const { userId, fullName, phone, userLevelCode, hotelId, positionId, departments, status } = requestData as Record<string, unknown>

    if (typeof userId !== 'string' || !userId) {
      throw new Error('userId is required')
    }
    if (typeof fullName !== 'undefined' && fullName !== null && typeof fullName !== 'string') throw new Error('fullName không hợp lệ')
    if (typeof phone !== 'undefined' && phone !== null && typeof phone !== 'string') throw new Error('phone không hợp lệ')
    if (typeof userLevelCode !== 'undefined' && userLevelCode !== null && (typeof userLevelCode !== 'string' || !USER_LEVELS.has(userLevelCode))) throw new Error('Cấp bậc người dùng không hợp lệ')
    if (typeof status !== 'undefined' && status !== null && (typeof status !== 'string' || !USER_STATUSES.has(status))) throw new Error('Trạng thái người dùng không hợp lệ')
    if (typeof hotelId !== 'undefined' && hotelId !== null && typeof hotelId !== 'string') throw new Error('hotelId không hợp lệ')
    if (typeof positionId !== 'undefined' && positionId !== null && typeof positionId !== 'string') throw new Error('positionId không hợp lệ')
    if (typeof departments !== 'undefined' && departments !== null && (!Array.isArray(departments) || departments.some((item) => typeof item !== 'string'))) throw new Error('departments không hợp lệ')

    const { data: updatedUser, error: updateError } = await supabaseAdmin.rpc('update_user_atomic', {
      p_actor_id: requestingUser.id,
      p_target_user_id: userId,
      p_full_name: typeof fullName === 'string' ? fullName : null,
      p_phone: typeof phone === 'string' ? phone : null,
      p_user_level_code: typeof userLevelCode === 'string' ? userLevelCode : null,
      p_hotel_id: typeof hotelId === 'string' ? hotelId : null,
      p_position_id: typeof positionId === 'string' ? positionId : null,
      p_departments: Array.isArray(departments) ? departments : null,
      p_status: typeof status === 'string' ? status : null,
    })

    if (updateError) {
      console.error('Atomic user update error:', updateError)
      throw new Error(updateError.message || 'Không thể cập nhật người dùng')
    }
    if (!updatedUser) throw new Error('Không thể cập nhật người dùng')

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
