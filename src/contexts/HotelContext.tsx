import { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Hotel, useHotels } from '@/hooks/useHotels'
import { useUser } from '@/hooks/useUser'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

interface HotelContextType {
  selectedHotel: Hotel | null
  setSelectedHotel: (hotel: Hotel) => void
  availableHotels: Hotel[]
  isAllHotelsMode: boolean
  setAllHotelsMode: (enabled: boolean) => void
  isLoading: boolean
  canViewAllHotels: boolean // true for owner/super_admin
}

const HotelContext = createContext<HotelContextType | undefined>(undefined)

export function HotelProvider({ children }: { children: ReactNode }) {
  const { user, hotelId } = useUser()
  const userId = user?.id
  const userLevel = user?.user_level_code
  const { data: hotels, isLoading: hotelsLoading } = useHotels()
  const [selectedHotel, setSelectedHotelState] = useState<Hotel | null>(null)
  const [isAllHotelsMode, setAllHotelsMode] = useState(false)
  const queryClient = useQueryClient()

  // Check if user can view all hotels (owner/super_admin)
  const canViewAllHotels = userLevel === 'super_admin' || userLevel === 'tenant_owner'

  // Fetch assigned hotels for non-admin users
  const { data: assignedHotelIds, isLoading: assignedLoading } = useQuery({
    queryKey: ['user-assigned-hotels', userId],
    queryFn: async () => {
      if (!userId) return []
      
      const { data, error } = await supabase
        .from('user_hotels')
        .select('hotel_id')
        .eq('user_id', userId)
      
      if (error) {
        console.error('Error fetching assigned hotels:', error)
        return []
      }
      
      return data?.map(d => d.hotel_id) || []
    },
    enabled: !!userId && !canViewAllHotels,
  })

  // Filter hotels based on user permissions
  const availableHotels = useMemo(() => {
    if (!hotels) return []
    
    // Owner/super_admin can see all hotels
    if (canViewAllHotels) {
      return hotels
    }
    
    // Manager/staff can only see assigned hotels
    if (assignedHotelIds && assignedHotelIds.length > 0) {
      return hotels.filter(h => assignedHotelIds.includes(h.id))
    }

    // Fallback: allow user's primary hotel even if user_hotels is empty
    if (hotelId) {
      return hotels.filter(h => h.id === hotelId)
    }

    return []
  }, [hotels, canViewAllHotels, assignedHotelIds, hotelId])

  // Fetch user preference from database
  const { data: userPreference, isLoading: preferenceLoading } = useQuery({
    queryKey: ['user-preference', userId],
    queryFn: async () => {
      if (!userId) return null
      
      const { data, error } = await supabase
        .from('user_preferences')
        .select('current_hotel_id, preferences')
        .eq('user_id', userId)
        .maybeSingle()
      
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching user preference:', error)
        return null
      }
      return data
    },
    enabled: !!userId,
  })

  // Save preference mutation
  const savePreferenceMutation = useMutation({
    mutationFn: async ({ hotelId: newHotelId, isAllHotels }: { hotelId: string | null, isAllHotels: boolean }) => {
      if (!userId) throw new Error('No user ID')

      const { error } = await supabase
        .from('user_preferences')
        .upsert(
          {
            user_id: userId,
            current_hotel_id: isAllHotels ? null : newHotelId,
            preferences: { is_all_hotels_mode: isAllHotels },
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' }
        )

      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-preferences'] })
      
      // Also update localStorage as backup
      if (isAllHotelsMode) {
        localStorage.removeItem('selected_hotel_id')
        localStorage.setItem('is_all_hotels_mode', 'true')
      } else if (selectedHotel) {
        localStorage.setItem('selected_hotel_id', selectedHotel.id)
        localStorage.removeItem('is_all_hotels_mode')
      }
    },
    onError: (error: unknown) => {
      console.error('Error saving preference:', error)
      
      // Fallback to localStorage on error
      if (isAllHotelsMode) {
        localStorage.removeItem('selected_hotel_id')
        localStorage.setItem('is_all_hotels_mode', 'true')
      } else if (selectedHotel) {
        localStorage.setItem('selected_hotel_id', selectedHotel.id)
        localStorage.removeItem('is_all_hotels_mode')
      }
    },
  })

  // Initialize selected hotel from preference or fallback
  useEffect(() => {
    // Wait for all data to load
    if (hotelsLoading || preferenceLoading) return
    if (!canViewAllHotels && assignedLoading) return
    if (availableHotels.length === 0) return

    // Check for "All Hotels" mode first (only for owners/super_admin)
    if (canViewAllHotels) {
      const preferences = userPreference?.preferences as { is_all_hotels_mode?: boolean } | null
      const isAllHotelsFromPref = preferences?.is_all_hotels_mode
      const isAllHotelsFromLocal = localStorage.getItem('is_all_hotels_mode') === 'true'
      
      if (isAllHotelsFromPref || (isAllHotelsFromLocal && availableHotels.length > 1)) {
        setAllHotelsMode(true)
        return
      }
    }

    // Try database preference
    if (userPreference?.current_hotel_id) {
      const hotel = availableHotels.find(h => h.id === userPreference.current_hotel_id)
      if (hotel) {
        setSelectedHotelState(hotel)
        return
      }
    }

    // Fallback to localStorage
    const savedHotelId = localStorage.getItem('selected_hotel_id')
    if (savedHotelId) {
      const hotel = availableHotels.find(h => h.id === savedHotelId)
      if (hotel) {
        setSelectedHotelState(hotel)
        return
      }
    }

    // Fallback to user's primary hotel
    if (hotelId) {
      const hotel = availableHotels.find(h => h.id === hotelId)
      if (hotel) {
        setSelectedHotelState(hotel)
        return
      }
    }

    // Fallback to first available hotel
    if (availableHotels.length > 0) {
      setSelectedHotelState(availableHotels[0])
    }
  }, [availableHotels, hotelId, userPreference, hotelsLoading, preferenceLoading, canViewAllHotels, assignedLoading])

  // Centralized cache invalidation when hotel context changes.
  // Add new keys here so both setSelectedHotel & setAllHotelsMode stay in sync.
  const invalidateHotelScopedQueries = () => {
    const keys = [
      'users', 'items', 'rooms', 'floor-plan', 'laundry-batches',
      'maintenance-requests', 'vendors', 'purchase-orders',
      'inventory-transactions', 'dashboard-stats', 'hotels-breakdown-stats',
      'categories',
    ]
    keys.forEach((key) => queryClient.invalidateQueries({ queryKey: [key] }))
  }

  const setSelectedHotel = (hotel: Hotel) => {
    setSelectedHotelState(hotel)
    setAllHotelsMode(false)
    savePreferenceMutation.mutate({ hotelId: hotel.id, isAllHotels: false })
    invalidateHotelScopedQueries()
  }

  const handleSetAllHotelsMode = (enabled: boolean) => {
    setAllHotelsMode(enabled)
    savePreferenceMutation.mutate({ hotelId: null, isAllHotels: enabled })
    invalidateHotelScopedQueries()
  }

  const isLoading = hotelsLoading || preferenceLoading || (!canViewAllHotels && assignedLoading)

  return (
    <HotelContext.Provider
      value={{
        selectedHotel,
        setSelectedHotel,
        availableHotels,
        isAllHotelsMode: canViewAllHotels ? isAllHotelsMode : false, // Only owners can view all hotels
        setAllHotelsMode: canViewAllHotels ? handleSetAllHotelsMode : () => {}, // Disable for non-owners
        isLoading,
        canViewAllHotels,
      }}
    >
      {children}
    </HotelContext.Provider>
  )
}

export function useHotelContext() {
  const context = useContext(HotelContext)
  if (context === undefined) {
    throw new Error('useHotelContext must be used within a HotelProvider')
  }
  return context
}
