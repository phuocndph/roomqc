import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SetupChecklist } from './SetupChecklist'

const state=vi.hoisted(()=>({roomsDone:false,allDone:false,error:false,refetch:vi.fn()}))
vi.mock('@/integrations/supabase/client',()=>({supabase:{}}))
vi.mock('@/hooks/useUser',()=>({useUser:()=>({tenantId:'tenant-A',user:{id:'owner-A'}})}))
vi.mock('@/contexts/HotelContext',()=>({useHotelContext:()=>({selectedHotel:{id:'hotel-A'}})}))
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({isLoading:false,error:state.error?new Error('offline'):null,refetch:state.refetch,data:[
  {key:'warehouse',label:'Tạo kho hàng',description:'Kho tùy chọn',href:'/settings/warehouses',done:state.allDone},
  {key:'rooms',label:'Thêm phòng',description:'Thêm phòng hoặc nhập Excel tại Quản lý phòng',href:'/rooms',done:state.roomsDone||state.allDone},
  {key:'items',label:'Thêm sản phẩm / vật tư',description:'Vật tư tùy chọn',href:'/items',done:state.allDone},
  {key:'users',label:'Mời nhân viên',description:'Nhân viên tùy chọn',href:'/settings/users',done:state.allDone},
]})}))

beforeEach(()=>{localStorage.clear();state.roomsDone=false;state.allDone=false;state.error=false;state.refetch.mockReset()})
afterEach(cleanup)
const open=()=>render(<MemoryRouter><SetupChecklist /></MemoryRouter>)

describe('simple getting-started guidance',()=>{
  it('prioritizes rooms and keeps every optional destination accessible without a progress requirement',()=>{
    const view=open()
    expect(screen.getByRole('link',{name:'Thêm phòng'})).toHaveAttribute('href','/rooms')
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    const optional=view.container.querySelector('details')!
    expect(optional.open).toBe(false)
    fireEvent.click(screen.getByText('Thiết lập thêm khi cần (tùy chọn)'))
    // JSDOM does not implement the summary toggle; links remain in the native details element.
    const links=Array.from(optional.querySelectorAll('a')).map(link=>link.getAttribute('href'))
    expect(links).toEqual(['/settings/warehouses','/items','/settings/users'])
  })

  it('makes it clear that rooms are ready even if optional setup is unfinished',()=>{
    state.roomsDone=true
    open()
    expect(screen.getByText('Đã có phòng, bạn có thể bắt đầu vận hành.')).toBeInTheDocument()
    expect(screen.queryByRole('link',{name:'Thêm phòng'})).not.toBeInTheDocument()
  })

  it('can be dismissed and remains dismissed for the current hotel and user',()=>{
    const view=open()
    fireEvent.click(screen.getByRole('button',{name:'Ẩn checklist'}))
    expect(screen.queryByText('Bắt đầu sử dụng')).not.toBeInTheDocument()
    view.unmount()
    open()
    expect(screen.queryByText('Bắt đầu sử dụng')).not.toBeInTheDocument()
  })

  it('offers retry when setup status cannot load',()=>{
    state.error=true
    open()
    fireEvent.click(screen.getByRole('button',{name:'Thử lại'}))
    expect(state.refetch).toHaveBeenCalledOnce()
  })

  it('hides itself once all suggested steps are done',()=>{
    state.allDone=true
    const view=open()
    expect(view.container).toBeEmptyDOMElement()
  })
})
