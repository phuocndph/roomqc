import { supabase } from '@/integrations/supabase/client'
import { runtimeConfig } from './runtime-config'
import { createPasswordChangeFlow } from './password-change'

export const passwordChangeFlow = createPasswordChangeFlow({
  endpoint: runtimeConfig.supabaseUrl,
  publishableKey: runtimeConfig.supabasePublishableKey,
  getSession: () => supabase.auth.getSession(),
  storage: localStorage,
})
