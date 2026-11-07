import { describe, expect, it } from 'vitest'
import { appendSetupRooms, generateSetupRooms, setupRoomsSchema } from './setup'
const input={firstFloor:1,floors:2,perFloor:3,excluded:'102, 201',roomType:'standard' as const}
describe('initial room setup',()=>{
  it('keeps entered prices when adding a floor and rejects repeated generation without changing the draft',()=>{
    const existing=generateSetupRooms({...input,floors:1,excluded:''}).map(room=>({...room,base_price:450000,hourly_price:120000,monthly_price:6000000}))
    const next=generateSetupRooms({...input,firstFloor:2,floors:1,excluded:''})
    const combined=appendSetupRooms(existing,next)
    expect(combined).toHaveLength(6)
    expect(combined.every(room=>room.base_price===450000&&room.hourly_price===120000&&room.monthly_price===6000000)).toBe(true)
    expect(setupRoomsSchema.safeParse(combined).success).toBe(true)
    expect(()=>appendSetupRooms(existing,existing)).toThrow('bị trùng')
    expect(existing).toHaveLength(3)
  })
  it('generates by floor, preserves skipped numbers and never assumes live prices',()=>{
    const rooms=generateSetupRooms(input)
    expect(rooms.map(r=>r.room_number)).toEqual(['101','103','202','203'])
    expect(rooms.map(r=>r.floor)).toEqual([1,1,2,2])
    expect(rooms.every(r=>r.base_price===0&&r.hourly_price===0&&r.monthly_price===0)).toBe(true)
  })
  it('rejects ambiguous floor numbering and excessive batches',()=>{
    for(const change of [{firstFloor:0},{firstFloor:999,floors:2},{perFloor:100},{floors:50,perFloor:5},{floors:1.2}]) expect(()=>generateSetupRooms({...input,...change})).toThrow()
  })
  it('rejects duplicates after trimming, regardless of case',()=>{
    const rooms=generateSetupRooms({...input,floors:1,excluded:''})
    expect(setupRoomsSchema.safeParse([{...rooms[0],room_number:' A01 '},{...rooms[1],room_number:'a01'}]).success).toBe(false)
  })
  it('requires consistent confirmed rates for the same type',()=>{
    const rooms=generateSetupRooms({...input,floors:1,excluded:''})
    expect(setupRoomsSchema.safeParse([rooms[0],{...rooms[1],base_price:500000}]).success).toBe(false)
    expect(setupRoomsSchema.safeParse([rooms[0],{...rooms[1],room_type:'deluxe',base_price:500000}]).success).toBe(true)
  })
  it('rejects invalid capacity, price, control characters and empty lists',()=>{
    const room=generateSetupRooms(input)[0]
    for(const patch of [{max_guests:0},{base_price:-1},{hourly_price:1.5},{monthly_price:1e10},{room_number:'101\nxx'}]) expect(setupRoomsSchema.safeParse([{...room,...patch}]).success).toBe(false)
    expect(setupRoomsSchema.safeParse([]).success).toBe(false)
  })
})
