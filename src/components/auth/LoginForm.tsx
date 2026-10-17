import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, Mail, Lock, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/contexts/AuthContext';
import { loginSchema, LoginFormData } from '@/lib/validations/auth.schemas';
import { storeCredential, clearLocalCredential } from '@/lib/credential-manager';
import { workspacePath, workspaceNext } from '@/lib/workspace';
import { scopedStorageKey, runtimeConfig } from '@/lib/runtime-config';

// Storage keys for remember me functionality
const REMEMBERED_EMAIL_KEY = scopedStorageKey('remembered_email');

export const LoginForm = () => {
  const { t } = useTranslation('auth');
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();
  
  const form = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      rememberMe: false
    }
  });

  // Only remember the email locally; passwords stay in the browser password manager.
  useEffect(() => {
    const savedEmail = localStorage.getItem(REMEMBERED_EMAIL_KEY);
    if (savedEmail) {
      form.setValue('email', savedEmail);
      form.setValue('rememberMe', true);
    }
  }, [form]);

  const onSubmit = async (data: LoginFormData) => {
    // Save or remove email based on rememberMe checkbox
    if (data.rememberMe) {
      localStorage.setItem(REMEMBERED_EMAIL_KEY, data.email);
    } else {
      localStorage.removeItem(REMEMBERED_EMAIL_KEY);
      clearLocalCredential();
    }

    const { error } = await signIn(data.email, data.password);
    if (!error) {
      // Lưu credential vào local store (mọi platform) + native API nếu có
      if (data.rememberMe) {
        await storeCredential(data.email, data.password);
      }
      // Full-page navigation để iOS/Android nhận diện "successful login submit"
      // và prompt lưu mật khẩu vào iCloud Keychain / Google Password Manager
      const next = workspaceNext(new URLSearchParams(window.location.search).get('next'));
      window.location.assign(workspacePath('/auth/callback') + (next ? `?next=${encodeURIComponent(next)}` : ''));
    }
  };

  return (
    <div className="w-full space-y-6">
      <Form {...form}>
        <form id="login-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Email */}
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('login.email')}</FormLabel>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <FormControl>
                    <Input
                      {...field}
                      name="email"
                      type="email"
                      placeholder="email@example.com"
                      className="pl-10"
                      autoComplete="username"
                      inputMode="email"
                      autoCapitalize="off"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </FormControl>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Password */}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('login.password')}</FormLabel>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <FormControl>
                    <Input
                      {...field}
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      autoComplete="current-password"
                    />
                  </FormControl>
                  <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                  </Button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Remember Me & Forgot Password */}
          <div className="flex items-center justify-between">
            <FormField
              control={form.control}
              name="rememberMe"
              render={({ field }) => (
                <FormItem className="flex items-center space-x-2 space-y-0">
                  <FormControl>
                    <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="text-sm font-normal cursor-pointer">
                    {t('login.rememberMe')}
                  </FormLabel>
                </FormItem>
              )}
            />
            <Link to="/auth/forgot-password" className="text-sm text-primary hover:underline">
              {t('login.forgotPassword')}
            </Link>
          </div>

          {/* Submit Button */}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {form.formState.isSubmitting ? t('common:messages.loading') : t('login.loginButton')}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm"><Link to="/auth/accept-invite" className="text-primary hover:underline">Nhận lời mời nhân viên</Link></p>
      <p className="text-center text-sm"><Link to="/auth/verify-email" className="text-primary hover:underline">Xác minh email đăng ký</Link></p>

      {/* Register Link */}
      {runtimeConfig.workspace?.workspace.status !== 'active' && <p className="text-center text-sm text-muted-foreground">
        {t('login.noAccount')}{' '}
        <Link to="/auth/register" className="text-primary hover:underline font-medium">
          {t('login.signUp')}
        </Link>
      </p>}
    </div>
  );
};
