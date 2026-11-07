import { z } from 'zod'

export const ROOM_SETUP_TYPES = [
  { value: 'standard', label: 'Tiêu chuẩn (Standard)' },
  { value: 'deluxe', label: 'Cao cấp (Deluxe)' },
  { value: 'suite', label: 'Phòng Suite' },
  { value: 'vip', label: 'Phòng VIP' },
] as const

const price = z.number().int().min(0).max(999999999)
export const setupRoomSchema = z.object({
  room_number: z.string().trim().min(1).max(20).refine(s => !Array.from(s).some(c => c.charCodeAt(0)<32), 'Số phòng không hợp lệ'),
  floor: z.number().int().min(1).max(999),
  room_type: z.enum(['standard','deluxe','suite','vip']),
  max_guests: z.number().int().min(1).max(20),
  base_price: price,
  hourly_price: price,
  monthly_price: price,
})
export const setupRoomsSchema = z.array(setupRoomSchema).min(1,'Cần ít nhất một phòng.').max(200,'Mỗi lần thiết lập tối đa 200 phòng.').superRefine((rooms,ctx) => {
  const seen = new Set<string>()
  const rates = new Map<string,string>()
  rooms.forEach((room,i) => {
    const number=room.room_number.toLowerCase()
    if(seen.has(number)) ctx.addIssue({code:'custom',path:[i,'room_number'],message:`Số phòng ${room.room_number} bị trùng.`})
    seen.add(number)
    const prices=JSON.stringify([room.base_price,room.hourly_price,room.monthly_price])
    if(rates.has(room.room_type)&&rates.get(room.room_type)!==prices) ctx.addIssue({code:'custom',path:[i,'base_price'],message:'Các phòng cùng loại phải dùng chung bảng giá.'})
    rates.set(room.room_type,prices)
  })
})
export type SetupRoom = z.infer<typeof setupRoomSchema>
export interface RoomSetupState {
  hotel_id: string
  version: number
  request_id: string | null
  rooms: SetupRoom[]
  completed_at: string | null
  actual_rooms: number
  expected_rooms: number
  updated_at: string | null
}

// Adding another floor preserves the prices already entered for the same type.
export function appendSetupRooms(existing: SetupRoom[], generated: SetupRoom[]): SetupRoom[] {
  if (existing.length + generated.length > 200) throw new Error('Tổng danh sách không được quá 200 phòng.')
  const seen = new Set(existing.map(room => room.room_number.trim().toLowerCase()))
  for (const room of generated) {
    if (seen.has(room.room_number.toLowerCase())) throw new Error(`Số phòng ${room.room_number} bị trùng. Chọn tầng khác hoặc bỏ qua số phòng này.`)
    seen.add(room.room_number.toLowerCase())
  }
  return [...existing, ...generated.map(room => {
    const priced = existing.find(previous => previous.room_type === room.room_type)
    return priced ? { ...room, base_price: priced.base_price, hourly_price: priced.hourly_price, monthly_price: priced.monthly_price } : room
  })]
}

export function generateSetupRooms(input: { firstFloor:number; floors:number; perFloor:number; excluded:string; roomType:SetupRoom['room_type'] }): SetupRoom[] {
  const {firstFloor,floors,perFloor,excluded,roomType}=input
  if(!Number.isInteger(firstFloor)||firstFloor<1||!Number.isInteger(floors)||floors<1||firstFloor+floors-1>999
    ||!Number.isInteger(perFloor)||perFloor<1||perFloor>99||floors*perFloor>200) throw new Error('Chọn 1–200 phòng, từ 1–99 phòng mỗi tầng; tầng từ 1 đến 999.')
  const skip=new Set(excluded.split(/[,\s]+/).filter(Boolean))
  const rooms: SetupRoom[]=[]
  for(let floor=firstFloor;floor<firstFloor+floors;floor++) for(let index=1;index<=perFloor;index++) {
    const room_number=`${floor}${String(index).padStart(2,'0')}`
    if(!skip.has(room_number)) rooms.push({room_number,floor,room_type:roomType,max_guests:2,base_price:0,hourly_price:0,monthly_price:0})
  }
  return setupRoomsSchema.parse(rooms)
}
