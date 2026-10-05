import { useState, useEffect, useCallback } from 'react'
import { User, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useSearchGuestByPhone, Guest } from '@/hooks/useGuests'

interface GuestAutoCompleteProps {
  phone: string
  onGuestFound: (guest: Guest) => void
}

function useDebounceValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function GuestAutoComplete({ phone, onGuestFound }: GuestAutoCompleteProps) {
  const searchGuest = useSearchGuestByPhone()
  const debouncedPhone = useDebounceValue(phone, 500)
  const [lastCheckedPhone, setLastCheckedPhone] = useState('')

  useEffect(() => {
    if (debouncedPhone.length >= 8 && debouncedPhone !== lastCheckedPhone) {
      setLastCheckedPhone(debouncedPhone)
      searchGuest.mutate(debouncedPhone, {
        onSuccess: (guest) => {
          if (guest) onGuestFound(guest)
        },
      })
    }
  }, [debouncedPhone, lastCheckedPhone, onGuestFound, searchGuest])

  if (searchGuest.isPending) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground px-1 py-1">
        <Search className="h-3 w-3 animate-pulse" />
        Đang tìm khách...
      </div>
    )
  }

  if (searchGuest.data && debouncedPhone.length >= 8) {
    return (
      <div className="flex items-center gap-2 text-xs text-green-600 px-1 py-1">
        <User className="h-3 w-3" />
        Khách quen: {searchGuest.data.full_name} ({searchGuest.data.total_stays} lượt ở)
      </div>
    )
  }

  return null
}
