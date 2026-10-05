import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff, Lock, Loader2, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { storeCredential } from '@/lib/credential-manager';

const quickLoginSchema = z.object({
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

type QuickLoginData = z.infer<typeof quickLoginSchema>;

interface QuickReLoginProps {
  email: string;
  onSwitchAccount: () => void;
  onSuccess: () => void;
}

export const QuickReLogin = ({ email, onSwitchAccount, onSuccess }: QuickReLoginProps) => {
  const { t } = useTranslation('auth');
  const [showPassword, setShowPassword] = useState(false);
  const { signIn } = useAuth();

  const form = useForm<QuickLoginData>({
    resolver: zodResolver(quickLoginSchema),
    defaultValues: {
      password: '',
    },
  });

  const onSubmit = async (data: QuickLoginData) => {
    const { error } = await signIn(email, data.password);
    if (!error) {
      // Lưu credential vào local store (mọi platform) + native API nếu có
      await storeCredential(email, data.password);
      // Full-page navigation để iOS/Android nhận diện "successful login submit"
      window.location.assign('/auth/callback');
    }
  };

  // Get initials from email
  const getInitials = (email: string) => {
    const name = email.split('@')[0];
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="w-full space-y-6">
      {/* User Avatar and Welcome */}
      <div className="flex flex-col items-center space-y-3">
        <Avatar className="h-20 w-20">
          <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
            {getInitials(email)}
          </AvatarFallback>
        </Avatar>
        <div className="text-center">
          <p className="text-sm text-muted-foreground">{t('quickLogin.welcomeBack', 'Chào mừng trở lại')}</p>
          <p className="font-medium text-foreground">{email}</p>
        </div>
      </div>

      <Form {...form}>
        <form id="quick-login-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Hidden email field cho iOS Keychain / Google Password biết tài khoản đang đăng nhập.
              Dùng sr-only để vẫn được mobile browser nhận diện là input thật. */}
          <input 
            type="email"
            name="email"
            id="quick-login-email"
            autoComplete="username"
            value={email}
            readOnly
            tabIndex={-1}
            onChange={() => {}}
            className="sr-only"
          />
          
          {/* Password */}
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('login.password', 'Mật khẩu')}</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      {...field}
                      id="quick-login-password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      className="pl-10 pr-10"
                      autoComplete="current-password"
                      autoFocus
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      )}
                    </Button>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Submit Button */}
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {form.formState.isSubmitting ? t('common:messages.loading', 'Đang xử lý...') : t('quickLogin.continue', 'Tiếp tục')}
          </Button>
        </form>
      </Form>

      {/* Switch Account Link */}
      <div className="text-center">
        <Button
          type="button"
          variant="ghost"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={onSwitchAccount}
        >
          <User className="mr-2 h-4 w-4" />
          {t('quickLogin.switchAccount', 'Đăng nhập bằng tài khoản khác')}
        </Button>
      </div>
    </div>
  );
};
