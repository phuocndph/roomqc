import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AnnouncementHost } from './AnnouncementHost'
import { announcementScope, rememberDismissal } from '@/lib/announcement-state'

const state=vi.hoisted(()=>({
  data:[] as {id:string;placement:string;kind:string;title:string}[],
  user: {id:'user',tenant_id:'tenant'} as {id:string;tenant_id:string}|null,
  isSuccess:true, dismiss:vi.fn(),
}))
vi.mock('@/hooks/useUser',()=>({useUser:()=>({user:state.user})}))
vi.mock('@/hooks/announcements/useActiveAnnouncements',()=>({
  useActiveAnnouncements:()=>({data:state.data,isSuccess:state.isSuccess}),
  useDismissAnnouncement:()=>({mutate:state.dismiss}),
}))
vi.mock('./AnnouncementPopup',()=>({AnnouncementPopup:({announcement,open,onOpenChange}:{announcement:{title:string};open:boolean;onOpenChange:(open:boolean)=>void})=>open?<div role="dialog"><p>{announcement.title}</p><button onClick={()=>onOpenChange(false)}>Đóng</button></div>:null}))
vi.mock('./AnnouncementBanner',()=>({AnnouncementBanner:()=>null}))
const notice=(id:string,kind='system_notice')=>({id,placement:'popup_center',kind,title:`Thông báo ${id}`})
let sequence=0
beforeEach(()=>{
  vi.useFakeTimers();localStorage.clear();sessionStorage.clear();state.data=[notice('A')]
  state.user={id:`user-${sequence++}`,tenant_id:'tenant'};state.isSuccess=true
  state.dismiss.mockReset().mockImplementation(id=>rememberDismissal(announcementScope(state.user!.id,state.user!.tenant_id),id))
})
afterEach(()=>{cleanup();vi.useRealTimers()})
const advance=()=>act(()=>vi.advanceTimersByTime(1000))

describe('announcement popup interruption prevention',()=>{
  it('does not reopen a closed announcement after the display delay or refetch',()=>{
    const view=render(<AnnouncementHost slot="popup" />)
    advance()
    expect(screen.getByText('Thông báo A')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Đóng'}))
    advance()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    state.data=[notice('A')]
    view.rerender(<AnnouncementHost slot="popup" />)
    advance()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('can display a different announcement without repeating the closed one',()=>{
    state.data=[notice('A'),notice('B')]
    render(<AnnouncementHost slot="popup" />)
    advance()
    fireEvent.click(screen.getByRole('button',{name:'Đóng'}))
    advance()
    expect(screen.getByText('Thông báo B')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'Đóng'}))
    advance()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('never opens a popup in the banner slot',()=>{
    render(<AnnouncementHost slot="top" />)
    advance()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('remembers a promo after full remount even with a new tab session',()=>{
    state.data=[notice('promo','promo_popup')]
    const view=render(<AnnouncementHost slot="popup" />)
    advance()
    fireEvent.click(screen.getByRole('button',{name:'Đóng'}))
    expect(state.dismiss).toHaveBeenCalledExactlyOnceWith('promo')
    view.unmount();sessionStorage.clear()
    render(<AnnouncementHost slot="popup" />)
    advance()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('does not follow a closed promo with another promo, including after remount',()=>{
    state.data=[notice('promo-A','promo_popup'),notice('promo-B','promo_popup')]
    const view=render(<AnnouncementHost slot="popup" />)
    advance()
    fireEvent.click(screen.getByRole('button',{name:'Đóng'}))
    view.unmount()
    render(<AnnouncementHost slot="popup" />)
    advance()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(state.dismiss).toHaveBeenCalledTimes(1)
  })

  it('does not hide system notices behind the promo cooldown',()=>{
    state.data=[notice('promo','promo_popup'),notice('system')]
    render(<AnnouncementHost slot="popup" />)
    advance()
    fireEvent.click(screen.getByRole('button',{name:'Đóng'}))
    advance()
    expect(screen.getByText('Thông báo system')).toBeInTheDocument()
  })

  it('isolates account changes',()=>{
    state.data=[notice('promo','promo_popup')]
    const view=render(<AnnouncementHost slot="popup" />)
    advance()
    fireEvent.click(screen.getByRole('button',{name:'Đóng'}))
    state.user={id:'other-user',tenant_id:'other-tenant'}
    view.rerender(<AnnouncementHost slot="popup" />)
    advance()
    expect(screen.getByText('Thông báo promo')).toBeInTheDocument()
  })

  it('waits for successful data and cancels the timer on read failure',()=>{
    state.isSuccess=false
    const view=render(<AnnouncementHost slot="popup" />)
    advance()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    state.isSuccess=true
    view.rerender(<AnnouncementHost slot="popup" />)
    act(()=>vi.advanceTimersByTime(400))
    state.isSuccess=false
    view.rerender(<AnnouncementHost slot="popup" />)
    advance()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('cancels pending display on campaign removal and logout',()=>{
    const view=render(<AnnouncementHost slot="popup" />)
    state.data=[]
    view.rerender(<AnnouncementHost slot="popup" />)
    advance()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    state.data=[notice('A')]
    view.rerender(<AnnouncementHost slot="popup" />)
    state.user=null
    view.rerender(<AnnouncementHost slot="popup" />)
    advance()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
