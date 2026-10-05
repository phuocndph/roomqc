import { z } from 'zod'

// Password validation for user creation
const passwordSchema = z
  .string()
  .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
  .regex(/[A-Z]/, 'Mật khẩu phải có ít nhất 1 chữ hoa')
  .regex(/[a-z]/, 'Mật khẩu phải có ít nhất 1 chữ thường')
  .regex(/[0-9]/, 'Mật khẩu phải có ít nhất 1 số')
  .regex(/[^A-Za-z0-9]/, 'Mật khẩu phải có ít nhất 1 ký tự đặc biệt')

// Phone schema for profile form
const phoneSchema = z
  .string()
  .regex(/^(0|\+84)[0-9]{9}$/, 'Số điện thoại không hợp lệ')
  .optional()
  .or(z.literal(''))

export const userFormSchema = z.object({
  fullName: z.string().min(2, 'Họ tên phải có ít nhất 2 ký tự'),
  email: z.string().email('Email không hợp lệ'),
  password: passwordSchema,
  userLevelCode: z.enum(['tenant_owner', 'manager', 'department_manager', 'staff'], {
    required_error: 'Vui lòng chọn cấp độ người dùng',
  }),
  hotelId: z.string().uuid().optional().nullable(),
  positionId: z.string().uuid().optional().nullable(),
  reportsTo: z.string().uuid().optional().nullable(),
})

export type UserFormData = z.infer<typeof userFormSchema>

export const profileFormSchema = z.object({
  fullName: z.string().min(2, 'Họ tên phải có ít nhất 2 ký tự'),
  phone: phoneSchema,
  avatarUrl: z.string().url().optional().or(z.literal('')),
})

export type ProfileFormData = z.infer<typeof profileFormSchema>

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Vui lòng nhập mật khẩu hiện tại'),
  newPassword: z
    .string()
    .min(8, 'Mật khẩu phải có ít nhất 8 ký tự')
    .regex(/[A-Z]/, 'Mật khẩu phải có ít nhất 1 chữ hoa')
    .regex(/[a-z]/, 'Mật khẩu phải có ít nhất 1 chữ thường')
    .regex(/[0-9]/, 'Mật khẩu phải có ít nhất 1 số')
    .regex(/[^A-Za-z0-9]/, 'Mật khẩu phải có ít nhất 1 ký tự đặc biệt'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Mật khẩu xác nhận không khớp',
  path: ['confirmPassword'],
})

export type ChangePasswordData = z.infer<typeof changePasswordSchema>
