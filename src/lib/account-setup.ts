export interface AccountSetupProfile {
  tenant_id: string | null
  hotel_id: string | null
  status: string | null
  user_level_code: string | null
  role?: string | null
  is_super_admin?: boolean | null
}

/** Call only after the profile query succeeds; an outage is not a new signup. */
export function getAccountSetupState(profile: AccountSetupProfile | null | undefined): 'register' | 'assignment-required' | 'ready' {
  if (!profile) return 'register'
  if (profile.is_super_admin || profile.user_level_code === 'super_admin' || profile.role === 'super_admin') {
    return 'ready'
  }

  const isEmployee = ['manager', 'department_manager', 'staff'].includes(profile.user_level_code ?? '')
    || ['hotel_manager', 'department_manager', 'staff'].includes(profile.role ?? '')

  if (isEmployee) {
    return profile.tenant_id && profile.hotel_id ? 'ready' : 'assignment-required'
  }
  if (profile.status === 'pending_setup' || !profile.tenant_id) return 'register'
  return 'ready'
}
