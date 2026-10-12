import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react'
import type {
  User as AuthUser,
  Session,
  AuthError,
  AuthResponse,
  AuthTokenResponsePassword,
} from '@supabase/supabase-js'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { getAuthErrorKey } from '@/lib/auth-error-messages'
import { useQueryClient } from '@tanstack/react-query'

// Silent refresh interval: 30 minutes
const REFRESH_INTERVAL_MS = 30 * 60 * 1000

type SignInResult =
  | { data: AuthTokenResponsePassword['data']; error: null }
  | { data: null; error: AuthError }

type SignUpResult =
  | { data: AuthResponse['data']; error: null }
  | { data: null; error: AuthError }

interface AuthContextType {
  user: AuthUser | null
  session: Session | null
  loading: boolean
  isAuthenticated: boolean
  signIn: (email: string, password: string) => Promise<SignInResult>
  signUp: (email: string, password: string, fullName: string) => Promise<SignUpResult>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>
  updatePassword: (newPassword: string) => Promise<{ error: AuthError | null }>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// Request persistent storage for PWA to prevent data loss
const requestPersistentStorage = async () => {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const isPersisted = await navigator.storage.persisted()
      if (!isPersisted) {
        await navigator.storage.persist()
      }
    }
  } catch (e) {
    console.warn('[Auth] Persistent storage not supported:', e)
  }
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const { t } = useTranslation('auth')
  const queryClient = useQueryClient()
  const isManualLogout = useRef(false)
  const previousSessionRef = useRef<Session | null>(null)

  // Request persistent storage for PWA on mount
  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const isIOSStandalone = (window.navigator as any).standalone === true
    
    if (isStandalone || isIOSStandalone) void requestPersistentStorage()
  }, [])

  // Silent refresh: refresh token periodically to keep session alive
  useEffect(() => {
    const silentRefresh = async () => {
      try {
        const { data: { session: currentSession } } = await supabase.auth.getSession()
        if (currentSession) {
          const { data, error } = await supabase.auth.refreshSession()
          if (error) {
            console.warn('[Auth] Silent refresh failed:', error.message)
          }
        }
      } catch (err) {
        console.warn('[Auth] Silent refresh error:', err)
      }
    }

    // Initial refresh when component mounts (in case token is stale)
    silentRefresh()

    // Set up periodic refresh
    const refreshInterval = setInterval(silentRefresh, REFRESH_INTERVAL_MS)

    return () => clearInterval(refreshInterval)
  }, [])

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        
        
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)

        // Handle auth events
        if (event === 'SIGNED_OUT') {
          // Check if this was an unexpected logout (session expired)
          if (!isManualLogout.current && previousSessionRef.current) {
            
            toast({
              title: 'Phiên đăng nhập hết hạn',
              description: 'Vui lòng đăng nhập lại để tiếp tục sử dụng ứng dụng.',
              variant: 'destructive',
            })
          }
          setUser(null)
          setSession(null)
          isManualLogout.current = false
        }

        // Store previous session for detecting unexpected logouts
        previousSessionRef.current = session
      }
    )

    // THEN check for existing session
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) throw error

        setSession(session)
        setUser(session?.user ?? null)
        previousSessionRef.current = session
        setLoading(false)
      })
      .catch((error) => {
        // A temporary Auth API outage must not leave the whole app in a loading state.
        console.warn('[Auth] Initial session check failed:', error)
        setLoading(false)
      })

    return () => subscription.unsubscribe()
  }, [toast])

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) throw error

      toast({
        title: t('common:messages.success', 'Đăng nhập thành công'),
        description: t('quickLogin.welcomeBack', 'Chào mừng bạn quay trở lại!'),
      })

      return { data, error: null }
    } catch (error: any) {
      const errorKey = getAuthErrorKey(error)
      
      toast({
        title: t('common:messages.loginFailed', 'Đăng nhập thất bại'),
        description: t(errorKey),
        variant: 'destructive',
      })
      return { data: null, error }
    }
  }, [toast, t])

  const signUp = useCallback(async (email: string, password: string, fullName: string) => {
    try {
      // A verified-email link must land on the route that resolves the
      // authenticated profile and sends an unprovisioned owner to onboarding.
      // Redirecting to `/` works only incidentally and can expose a landing
      // page while the profile query is still pending.
      const redirectUrl = `${window.location.origin}/auth/callback`

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            full_name: fullName,
          },
        },
      })

      if (error) throw error

      // The registration screen decides the next message because local and
      // production environments may differ on email confirmation.  In
      // particular, a returned session means the owner can continue directly
      // to onboarding instead of being told to check an email unnecessarily.

      return { data, error: null }
    } catch (error: any) {
      const errorKey = getAuthErrorKey(error)
      
      toast({
        title: t('common:messages.registerFailed', 'Đăng ký thất bại'),
        description: t(errorKey),
        variant: 'destructive',
      })
      return { data: null, error }
    }
  }, [toast, t])

  const resetPassword = useCallback(async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) throw error

      toast({
        title: t('forgotPassword.emailSent', 'Email đã gửi'),
        description: t('forgotPassword.checkInbox', 'Vui lòng kiểm tra email để đặt lại mật khẩu.'),
      })

      return { error: null }
    } catch (error: any) {
      const errorKey = getAuthErrorKey(error)
      
      toast({
        title: t('common:messages.error', 'Lỗi'),
        description: t(errorKey),
        variant: 'destructive',
      })
      return { error }
    }
  }, [toast, t])

  const updatePassword = useCallback(async (newPassword: string) => {
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) throw error

      toast({
        title: t('resetPassword.success', 'Cập nhật thành công'),
        description: t('resetPassword.successDescription', 'Mật khẩu của bạn đã được thay đổi.'),
      })

      return { error: null }
    } catch (error: any) {
      const errorKey = getAuthErrorKey(error)
      
      toast({
        title: t('common:messages.error', 'Lỗi'),
        description: t(errorKey),
        variant: 'destructive',
      })
      return { error }
    }
  }, [toast, t])

  const signOut = useCallback(async () => {
    try {
      // Mark as manual logout to prevent "session expired" toast
      isManualLogout.current = true
      
      // Clear local state FIRST (important for graceful logout)
      setUser(null)
      setSession(null)
      previousSessionRef.current = null
      
      // Clear React Query cache
      queryClient.clear()

      // Xoá credential đã lưu + đánh dấu logged-out để PWA không auto-login lại
      try {
        const { clearLocalCredential } = await import('@/lib/credential-manager')
        clearLocalCredential()
      } catch (e) {
        console.warn('[SignOut] Clear credential failed:', e)
      }
      
      // Then call API (may fail if session already expired - that's ok)
      const { error } = await supabase.auth.signOut()
      
      // Only show error toast if it's a real error (not session missing)
      if (error && !error.message?.includes('session')) {
        console.error('SignOut API error:', error)
      }

      toast({
        title: 'Đã đăng xuất',
        description: 'Hẹn gặp lại bạn!',
      })
    } catch (error: any) {
      // Silent fail - user is still logged out locally
      console.error('SignOut error:', error)
      toast({
        title: 'Đã đăng xuất',
        description: 'Hẹn gặp lại bạn!',
      })
    }
  }, [toast, queryClient])

  const value: AuthContextType = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    isAuthenticated: !!user,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
