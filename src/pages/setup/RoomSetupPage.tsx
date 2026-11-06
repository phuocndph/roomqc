import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useHotelContext } from '@/contexts/HotelContext'
import { useUser } from '@/hooks/useUser'
import { useHotelRoomSetup } from '@/hooks/useHotelRoomSetup'
import { appendSetupRooms, generateSetupRooms, ROOM_SETUP_TYPES, setupRoomsSchema, type SetupRoom, type RoomSetupState } from '@/lib/rooms/setup'
import { navigateBack } from '@/lib/navigation'

const money=(n:number)=>`${n.toLocaleString('vi-VN')} đ`
const message=(error:unknown)=>error&&typeof error==='object'&&'message' in error?String(error.message):'Không thể lưu thiết lập. Hãy thử lại.'

export default function RoomSetupPage() {
  const {selectedHotel,isAllHotelsMode}=useHotelContext()
  const {hasRole}=useUser()
  if(!hasRole('owner')) return <p className="p-6">Chỉ chủ sở hữu được thiết lập phòng ban đầu.</p>
  if(!selectedHotel||isAllHotelsMode) return <div className="space-y-3 p-4"><h1 className="text-xl font-semibold">Thiết lập phòng ban đầu</h1><p>Chọn một khách sạn ở thanh trên để tiếp tục.</p></div>
  return <RoomSetupEditor key={selectedHotel.id} hotelId={selectedHotel.id} hotelName={selectedHotel.name} />
}

function RoomSetupEditor({hotelId,hotelName}:{hotelId:string;hotelName:string}) {
  const navigate=useNavigate()
  const setup=useHotelRoomSetup(hotelId,true)
  const [rooms,setRooms]=useState<SetupRoom[]>([])
  const [version,setVersion]=useState(0)
  const [review,setReview]=useState(false)
  const [preview,setPreview]=useState<RoomSetupState|null>(null)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [firstFloor,setFirstFloor]=useState(1)
  const [floors,setFloors]=useState(1)
  const [perFloor,setPerFloor]=useState(10)
  const [excluded,setExcluded]=useState('')
  const [kind,setKind]=useState<SetupRoom['room_type']>('standard')
  const initialized=useRef(false)
  const inFlight=useRef(false)
  const headingRef=useRef<HTMLHeadingElement>(null)
  useEffect(()=>{
    if(!setup.data||initialized.current)return
    initialized.current=true
    setRooms(setup.data.rooms);setVersion(setup.data.version);setPreview(setup.data);setReview(setup.data.rooms.length>0)
  },[setup.data])
  useEffect(()=>{
    // The shorter preview must not stay above the document's previous scroll offset.
    headingRef.current?.focus({preventScroll:true})
    headingRef.current?.scrollIntoView?.({block:'start',behavior:'auto'})
  },[review,setup.data?.completed_at])

  const update=(next:SetupRoom[])=>{setRooms(next);setError('')}
  const updateRoom=(index:number,change:Partial<SetupRoom>)=>update(rooms.map((r,i)=>i===index?{...r,...change}:r))
  const updatePrice=(type:SetupRoom['room_type'],field:'base_price'|'hourly_price'|'monthly_price',value:number)=>update(rooms.map(r=>r.room_type===type?{...r,[field]:value}:r))
  const save=async()=>{
    if(inFlight.current)return
    const valid=setupRoomsSchema.safeParse(rooms)
    if(!valid.success){setError(valid.error.issues[0].message==='Required'?'Điền đầy đủ thông tin phòng và giá.':valid.error.issues[0].message);return}
    inFlight.current=true;setBusy(true);setError('')
    try{const state=await setup.save(version,valid.data);setVersion(state.version);setRooms(state.rooms);setPreview(state);setReview(true)}
    catch(e){setError(message(e))}finally{inFlight.current=false;setBusy(false)}
  }
  const commit=async()=>{
    if(inFlight.current||!review||!preview)return
    inFlight.current=true;setBusy(true);setError('')
    try{await setup.complete(preview)}catch(e){setError(`${message(e)} Nếu mất kết nối, nhấn tạo phòng lại để kiểm tra cùng yêu cầu; không tạo danh sách mới.`)}
    finally{inFlight.current=false;setBusy(false)}
  }

  if(setup.isLoading) return <p role="status" className="p-6">Đang tải thiết lập đã lưu…</p>
  if(setup.isError) return <div className="space-y-3 p-6"><p role="alert">{message(setup.error)}</p><Button onClick={()=>void setup.refetch()}>Thử lại</Button></div>
  const done=!!setup.data?.completed_at
  const existing=!done&&(setup.data?.actual_rooms||0)>0
  const types=ROOM_SETUP_TYPES.filter(t=>rooms.some(r=>r.room_type===t.value))
  return <div className="mx-auto max-w-5xl space-y-5 pb-10">
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ghost" size="sm" onClick={()=>navigateBack(navigate,'/rooms')}><ArrowLeft className="mr-1 h-4 w-4" />Quay lại</Button>
      <div><h1 ref={headingRef} tabIndex={-1} className="text-xl font-semibold focus:outline-none">Thiết lập phòng ban đầu</h1><p className="text-sm text-slate-600">{hotelName}</p></div>
    </div>
    {done||existing?<div className="rounded-lg border p-5 space-y-4">
      <CheckCircle2 className="h-7 w-7 text-green-700" />
      <h2 className="text-lg font-semibold">{done?'Đã lưu phòng và bảng giá':'Khách sạn đã có danh sách phòng'}</h2>
      <p>Hiện có {setup.data?.actual_rooms} phòng. Tiếp tục thêm, sửa hoặc quản lý từ danh sách phòng.</p>
      <div className="flex flex-wrap gap-2"><Button asChild><Link to="/rooms">Mở danh sách phòng</Link></Button><Button asChild variant="outline"><Link to="/settings/users">Tạo tài khoản nhân viên</Link></Button></div>
    </div>:<>
      <ol className="flex gap-5 text-sm" aria-label="Các bước thiết lập"><li className={!review?'font-semibold text-blue-800':'text-slate-600'}>1. Lập danh sách và giá</li><li className={review?'font-semibold text-blue-800':'text-slate-600'}>2. Kiểm tra và xác nhận</li></ol>
      <p className="text-sm text-slate-600">Thêm phòng và nhập giá, sau đó xem lại trước khi tạo. Nhấn “Lưu và xem trước” để lưu bản nháp và tiếp tục sau; thay đổi chưa lưu sẽ mất khi rời trang. Tối đa 200 phòng.</p>
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
        {!review&&<>
          <section className="rounded-lg border p-4 space-y-4" aria-labelledby="generate-title">
            <h2 id="generate-title" className="font-semibold">Tạo nhanh số phòng theo tầng</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><Label htmlFor="first-floor">Từ tầng</Label><Input id="first-floor" type="number" min={1} max={999} value={firstFloor} onChange={e=>setFirstFloor(Number(e.target.value))} /></div>
              <div><Label htmlFor="floor-count">Số tầng</Label><Input id="floor-count" type="number" min={1} max={200} value={floors} onChange={e=>setFloors(Number(e.target.value))} /></div>
              <div><Label htmlFor="rooms-per-floor">Phòng mỗi tầng</Label><Input id="rooms-per-floor" type="number" min={1} max={99} value={perFloor} onChange={e=>setPerFloor(Number(e.target.value))} /></div>
              <div><Label htmlFor="generated-kind">Loại phòng</Label><select id="generated-kind" className="h-10 w-full rounded border bg-background px-2" value={kind} onChange={e=>setKind(e.target.value as SetupRoom['room_type'])}>{ROOM_SETUP_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
            </div>
            <div><Label htmlFor="excluded-rooms">Bỏ qua số phòng (không bắt buộc)</Label><Input id="excluded-rooms" value={excluded} onChange={e=>setExcluded(e.target.value)} placeholder="104, 204" /></div>
            <p className="text-sm text-slate-600">Ví dụ: tầng 1 có phòng 101, 102… Bạn có thể sửa từng số phòng bên dưới.</p>
            <Button variant="outline" onClick={()=>{try{const generated=generateSetupRooms({firstFloor,floors,perFloor,excluded,roomType:kind});update(appendSetupRooms(rooms,generated))}catch(e){setError(message(e))}}}><Plus className="mr-1 h-4 w-4" />Thêm vào danh sách</Button>
          </section>
          {rooms.length>0&&<section className="rounded-lg border p-4 space-y-4" aria-labelledby="prices-title">
            <h2 id="prices-title" className="font-semibold">Nhập bảng giá theo loại phòng (VNĐ)</h2>
            <p className="text-sm text-slate-600">Giá ban đầu là 0, không phải giá đề xuất. Nhập giá thực tế; để 0 nếu không thu tiền theo hình thức đó. Giá này sẽ dùng cho các phòng cùng loại.</p>
            {types.map(type=>{const row=rooms.find(r=>r.room_type===type.value)!;return <div key={type.value} className="space-y-2 border-t pt-3"><h3 className="text-sm font-medium">{type.label}</h3><div className="grid gap-3 sm:grid-cols-3">{([['base_price','Giá đêm'],['hourly_price','Giá giờ'],['monthly_price','Giá tháng']] as const).map(([key,label])=><div key={key}><Label htmlFor={`${type.value}-${key}`}>{label}</Label><Input id={`${type.value}-${key}`} type="number" min={0} max={999999999} step={1} value={row[key]} onChange={e=>updatePrice(type.value,key,Number(e.target.value))} /></div>)}</div></div>})}
          </section>}
        </>}
        <section className="rounded-lg border p-4 space-y-3">
          <h2 className="font-semibold">{review?'Xem trước':'Danh sách dự kiến'}: {rooms.length} phòng</h2>
          {rooms.length!==setup.data?.expected_rooms&&<p className="text-sm text-amber-800">Quy mô đã khai báo: {setup.data?.expected_rooms} phòng. Danh sách hiện tại có {rooms.length} phòng; bạn có thể xác nhận số thực tế này.</p>}
          {review&&<p className="text-sm text-green-800" role="status">Đã lưu bản nháp. Chưa tạo phòng cho đến khi bạn xác nhận.</p>}
          <div className="overflow-auto max-h-[55vh]"><table className="w-full text-sm"><thead className="sticky top-0 bg-background"><tr className="text-left border-b"><th className="p-2">Phòng</th><th className="p-2">Tầng</th><th className="p-2">Loại phòng</th><th className="p-2">Số khách</th><th className="p-2">{review?'Giá đêm / giờ / tháng':'Thao tác'}</th></tr></thead>
            <tbody>{rooms.map((room,index)=><tr key={index} className="border-b"><td className="p-2">{review?room.room_number:<Input aria-label={`Số phòng dòng ${index+1}`} className="w-24" maxLength={20} value={room.room_number} onChange={e=>updateRoom(index,{room_number:e.target.value})} />}</td><td className="p-2">{review?room.floor:<Input aria-label={`Tầng dòng ${index+1}`} type="number" className="w-20" min={1} max={999} value={room.floor} onChange={e=>updateRoom(index,{floor:Number(e.target.value)})} />}</td><td className="p-2">{review?ROOM_SETUP_TYPES.find(t=>t.value===room.room_type)?.label:<select aria-label={`Loại phòng dòng ${index+1}`} className="h-10 rounded border bg-background px-2" value={room.room_type} onChange={e=>{const target=rooms.find(r=>r.room_type===e.target.value);updateRoom(index,{room_type:e.target.value as SetupRoom['room_type'],base_price:target?.base_price||0,hourly_price:target?.hourly_price||0,monthly_price:target?.monthly_price||0})}}>{ROOM_SETUP_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select>}</td><td className="p-2">{review?room.max_guests:<Input aria-label={`Số khách dòng ${index+1}`} type="number" className="w-20" min={1} max={20} value={room.max_guests} onChange={e=>updateRoom(index,{max_guests:Number(e.target.value)})} />}</td><td className="p-2">{review?<span className="whitespace-nowrap">{money(room.base_price)} / {money(room.hourly_price)} / {money(room.monthly_price)}</span>:<Button variant="ghost" size="icon" aria-label={`Xóa dòng ${index+1}`} onClick={()=>update(rooms.filter((_,i)=>i!==index))}><Trash2 className="h-4 w-4" /></Button>}</td></tr>)}</tbody></table></div>
          {!review&&<Button variant="outline" disabled={rooms.length>=200} onClick={()=>update([...rooms,{room_number:'',floor:1,room_type:'standard',max_guests:2,base_price:rooms.find(r=>r.room_type==='standard')?.base_price||0,hourly_price:rooms.find(r=>r.room_type==='standard')?.hourly_price||0,monthly_price:rooms.find(r=>r.room_type==='standard')?.monthly_price||0}])}>Thêm một phòng</Button>}
        </section>
        {review&&<p className="text-sm text-slate-600">Nhấn “Tạo {rooms.length} phòng” để dùng danh sách và bảng giá trên. Bạn có thể sửa sau trong quản lý phòng và bảng giá.</p>}
        {review&&rooms.some(room=>room.base_price===0)&&<p className="text-sm text-amber-800">Có phòng có giá đêm bằng 0 đ. Nếu chưa nhập giá, hãy cập nhật bảng giá trước khi nhận khách.</p>}
        {error&&<p role="alert" className="rounded border border-red-300 p-3 text-sm text-red-700">{error}</p>}
        {error&&<details className="text-sm"><summary className="cursor-pointer text-slate-600">Khôi phục bản đã lưu trên máy chủ</summary><p className="my-2 text-slate-600">Thao tác này thay nội dung đang sửa bằng bản nháp đã lưu.</p><Button variant="outline" onClick={async()=>{setBusy(true);try{const result=await setup.refetch();if(result.error)throw result.error;if(result.data){setRooms(result.data.rooms);setVersion(result.data.version);setPreview(result.data);setReview(result.data.rooms.length>0);setError('')}}catch(e){setError(message(e))}finally{setBusy(false)}}}>Tải bản nháp đã lưu</Button></details>}
        <div className="flex flex-wrap gap-3">
          {review?<><Button disabled={busy} onClick={()=>void commit()}>{busy?'Đang tạo phòng…':`Tạo ${rooms.length} phòng`}</Button><Button variant="outline" onClick={()=>setReview(false)}>Sửa danh sách</Button></>:<Button disabled={!rooms.length||busy} onClick={()=>void save()}>{busy?'Đang lưu bản nháp…':'Lưu và xem trước'}</Button>}
          <Button asChild variant="ghost"><Link to="/rooms">Làm sau</Link></Button>
        </div>
      </fieldset>
    </>}
  </div>
}
