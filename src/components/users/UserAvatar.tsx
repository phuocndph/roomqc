import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { User } from '@/types/database.types'

interface UserAvatarProps {
  user: Pick<User, 'full_name' | 'avatar_url'>
  size?: 'sm' | 'md' | 'lg'
}

export function UserAvatar({ user, size = 'md' }: UserAvatarProps) {
  const sizeClasses = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-16 w-16 text-lg',
  }

  const initials = user.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??'

  return (
    <Avatar className={sizeClasses[size]}>
      <AvatarImage src={user.avatar_url || undefined} alt={user.full_name} />
      <AvatarFallback>{initials}</AvatarFallback>
    </Avatar>
  )
}
