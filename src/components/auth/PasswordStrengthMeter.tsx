import { useMemo } from 'react'
import { Progress } from '@/components/ui/progress'

interface PasswordStrengthMeterProps {
  password: string
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const strength = useMemo(() => {
    if (!password) return { score: 0, label: '', color: '' }

    let score = 0

    // Length
    if (password.length >= 8) score += 20
    if (password.length >= 12) score += 10

    // Contains lowercase
    if (/[a-z]/.test(password)) score += 20

    // Contains uppercase
    if (/[A-Z]/.test(password)) score += 20

    // Contains numbers
    if (/[0-9]/.test(password)) score += 20

    // Contains special characters
    if (/[^A-Za-z0-9]/.test(password)) score += 10

    // Determine label and color
    if (score < 40) {
      return { score, label: 'Yếu', color: 'bg-destructive' }
    } else if (score < 60) {
      return { score, label: 'Trung bình', color: 'bg-yellow-500' }
    } else if (score < 80) {
      return { score, label: 'Tốt', color: 'bg-blue-500' }
    } else {
      return { score, label: 'Rất tốt', color: 'bg-green-500' }
    }
  }, [password])

  if (!password) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Độ mạnh mật khẩu:</span>
        <span className={`font-medium ${
          strength.score < 40 ? 'text-destructive' :
          strength.score < 60 ? 'text-yellow-500' :
          strength.score < 80 ? 'text-blue-500' :
          'text-green-500'
        }`}>
          {strength.label}
        </span>
      </div>
      <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full transition-all duration-300 ${strength.color}`}
          style={{ width: `${strength.score}%` }}
        />
      </div>
      <ul className="space-y-1 text-xs text-muted-foreground">
        <li className={password.length >= 8 ? 'text-green-600' : ''}>
          • Ít nhất 8 ký tự
        </li>
        <li className={/[A-Z]/.test(password) ? 'text-green-600' : ''}>
          • Có chữ hoa
        </li>
        <li className={/[a-z]/.test(password) ? 'text-green-600' : ''}>
          • Có chữ thường
        </li>
        <li className={/[0-9]/.test(password) ? 'text-green-600' : ''}>
          • Có số
        </li>
        <li className={/[^A-Za-z0-9]/.test(password) ? 'text-green-600' : ''}>
          • Có ký tự đặc biệt
        </li>
      </ul>
    </div>
  )
}
