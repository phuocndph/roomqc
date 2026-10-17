import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RoomSetupState } from '@/lib/rooms/setup'
import RoomSetupPage from './RoomSetupPage'

const state=vi.hoisted(()=>({data:null as RoomSetupState|null,owner:true,save:vi.fn(),complete:vi.fn(),refetch:vi.fn()}))
vi.mock('@/hooks/useUser',()=>({useUser:()=>({hasRole:()=>state.owner})}))
vi.mock('@/contexts/HotelContext',()=>({useHotelContext:()=>({selectedHotel:{id:'hotel-A',name:'An Thủy'},isAllHotelsMode:false})}))
vi.mock('@/hooks/useHotelRoomSetup',()=>({useHotelRoomSetup:()=>({data:state.data,isLoading:false,isError:false,save:state.save,complete:state.complete,refetch:state.refetch})}))
function open(){return render(<MemoryRouter><RoomSetupPage /></MemoryRouter>)}
const draft:RoomSetupState={hotel_id:'hotel-A',version:1,request_id:'request-A',rooms:[{room_number:'101',floor:1,room_type:'standard',max_guests:2,base_price:450000,hourly_price:120000,monthly_price:6000000}],completed_at:null,actual_rooms:0,expected_rooms:1,updated_at:'2026-10-15'}
beforeEach(()=>{
  state.owner=true;state.data={...draft,version:0,request_id:null,rooms:[],expected_rooms:2}
  state.save.mockReset().mockImplementation(async(version,rooms)=>({...draft,rooms,version:version+1}))
  state.complete.mockReset().mockResolvedValue({...draft,completed_at:'2026-10-15',actual_rooms:1})
  state.refetch.mockReset()
})
afterEach(cleanup)

describe('room setup workflow',()=>{
  it('requires a saved preview, then creates rooms with one clear action and no checkbox',async()=>{
    open()
    fireEvent.change(screen.getByLabelText('Phòng mỗi tầng'),{target:{value:'2'}})
    fireEvent.click(screen.getByRole('button',{name:'Thêm vào danh sách'}))
    fireEvent.change(screen.getByLabelText('Giá đêm'),{target:{value:'450000'}})
    fireEvent.click(screen.getByRole('button',{name:'Lưu và xem trước'}))
    await screen.findByText('Đã lưu bản nháp. Chưa tạo phòng cho đến khi bạn xác nhận.')
    expect(screen.getByRole('heading',{level:1,name:'Thiết lập phòng ban đầu'})).toHaveFocus()
    expect(state.save.mock.calls[0][0]).toBe(0)
    expect(state.save.mock.calls[0][1]).toHaveLength(2)
    expect(state.save.mock.calls[0][1][0].base_price).toBe(450000)
    expect(state.complete).not.toHaveBeenCalled()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.getByRole('button',{name:'Tạo 2 phòng'})).toBeEnabled()
    fireEvent.click(screen.getByRole('button',{name:'Tạo 2 phòng'}))
    await waitFor(()=>expect(state.complete).toHaveBeenCalledOnce())
    expect(state.complete.mock.calls[0][0].request_id).toBe('request-A')
  })

  it('resumes persisted drafts and retries a lost response using the exact preview',async()=>{
    state.data=draft
    state.complete.mockRejectedValueOnce(new Error('Failed to fetch')).mockResolvedValueOnce({...draft,completed_at:'done'})
    open()
    expect(screen.getByText('101')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Tạo 1 phòng'}))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button',{name:'Tạo 1 phòng'}))
    await waitFor(()=>expect(state.complete).toHaveBeenCalledTimes(2))
    expect(state.complete.mock.calls[0][0]).toEqual(state.complete.mock.calls[1][0])
    expect(state.save).not.toHaveBeenCalled()
  })

  it('does not confirm unseen data after a background query changes the draft',async()=>{
    state.data=draft
    const view=open()
    state.data={...draft,version:2,request_id:'unseen-request',rooms:[{...draft.rooms[0],room_number:'999'}]}
    view.rerender(<MemoryRouter><RoomSetupPage /></MemoryRouter>)
    expect(screen.getByText('101')).toBeInTheDocument()
    expect(screen.queryByText('999')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Tạo 1 phòng'}))
    await waitFor(()=>expect(state.complete).toHaveBeenCalledOnce())
    expect(state.complete.mock.calls[0][0].request_id).toBe('request-A')
  })

  it('keeps edits when saving fails and saves changed data before the next preview',async()=>{
    state.data=draft
    state.save.mockRejectedValueOnce(new Error('Failed to fetch')).mockImplementationOnce(async(version,rooms)=>({...draft,rooms,version:version+1,request_id:'request-B'}))
    open()
    fireEvent.click(screen.getByRole('button',{name:'Sửa danh sách'}))
    fireEvent.change(screen.getByLabelText('Số phòng dòng 1'),{target:{value:'105'}})
    expect(screen.queryByRole('button',{name:'Tạo 1 phòng'})).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Lưu và xem trước'}))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Số phòng dòng 1')).toHaveValue('105')
    expect(state.complete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'Lưu và xem trước'}))
    await screen.findByText('105')
    fireEvent.click(screen.getByRole('button',{name:'Tạo 1 phòng'}))
    await waitFor(()=>expect(state.complete).toHaveBeenCalledOnce())
    expect(state.complete.mock.calls[0][0].request_id).toBe('request-B')
    expect(state.complete.mock.calls[0][0].rooms[0].room_number).toBe('105')
  })

  it('warns about zero overnight rates without adding another confirmation gate',async()=>{
    state.data={...draft,rooms:[{...draft.rooms[0],base_price:0}]}
    open()
    expect(screen.getByText(/Có phòng có giá đêm bằng 0 đ/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Tạo 1 phòng'}))
    await waitFor(()=>expect(state.complete).toHaveBeenCalledOnce())
  })

  it('prevents rapid repeated creation while the request is pending',async()=>{
    state.data=draft
    state.complete.mockImplementation(()=>new Promise(()=>{}))
    open()
    const create=screen.getByRole('button',{name:'Tạo 1 phòng'})
    fireEvent.click(create)
    fireEvent.click(create)
    expect(state.complete).toHaveBeenCalledOnce()
    expect(screen.getByRole('button',{name:'Đang tạo phòng…'})).toBeDisabled()
  })

  it('protects existing rooms from initial setup overwrites',()=>{
    state.data={...draft,rooms:[],actual_rooms:3}
    open()
    expect(screen.getByText('Khách sạn đã có danh sách phòng')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Thêm vào danh sách'})).not.toBeInTheDocument()
    expect(screen.getByRole('link',{name:'Mở danh sách phòng'})).toHaveAttribute('href','/rooms')
    expect(screen.getByRole('link',{name:'Tạo tài khoản nhân viên'})).toHaveAttribute('href','/settings/users')
  })

  it('does not expose the setup editor to staff',()=>{
    state.owner=false
    open()
    expect(screen.getByText('Chỉ chủ sở hữu được thiết lập phòng ban đầu.')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'Thêm vào danh sách'})).not.toBeInTheDocument()
  })
})
