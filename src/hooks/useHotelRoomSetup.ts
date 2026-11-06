import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import type { Json } from '@/integrations/supabase/types'
import type { RoomSetupState, SetupRoom } from '@/lib/rooms/setup'

// Typed boundary for the additive migration; generated database types are refreshed separately.
export async function roomSetupRpc(name:'get_hotel_room_setup'|'save_hotel_room_setup'|'complete_hotel_room_setup',args:Record<string,Json>):Promise<RoomSetupState> {
  const {data,error}=await supabase.rpc(name as never,args as never)
  if(error) throw error
  const result=data as unknown as RoomSetupState
  if(!result||typeof result.version!=='number'||!Array.isArray(result.rooms)) throw new Error('Phản hồi thiết lập phòng không hợp lệ.')
  return result
}
export function useHotelRoomSetup(hotelId:string|undefined,enabled:boolean) {
  const cache=useQueryClient()
  const key=['hotel-room-setup',hotelId]
  const query=useQuery({queryKey:key,enabled:!!hotelId&&enabled,refetchOnWindowFocus:false,queryFn:()=>roomSetupRpc('get_hotel_room_setup',{p_hotel_id:hotelId!})})
  const save=async(version:number,rooms:SetupRoom[])=>{
    const result=await roomSetupRpc('save_hotel_room_setup',{p_hotel_id:hotelId!,p_expected_version:version,p_rooms:rooms})
    cache.setQueryData(key,result)
    return result
  }
  const complete=async(state:RoomSetupState)=>{
    const result=await roomSetupRpc('complete_hotel_room_setup',{p_hotel_id:hotelId!,p_request_id:state.request_id,p_version:state.version,p_confirm_prices:true})
    cache.setQueryData(key,result)
    await Promise.all(['rooms','room-stats','floor-plan','floor-plan-rooms','room-types','room-type-rates','room-type-rate','today-prices-by-hotel','resolved-daily-prices','daily-prices','available-rooms','rate-plans','tenant-usage','check-quota','actual-room-count','setup-checklist','room-type-pricing-fixed']
      .map(prefix=>cache.invalidateQueries({queryKey:[prefix]})))
    return result
  }
  return {...query,save,complete}
}
