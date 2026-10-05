import { supabase } from '@/integrations/supabase/client'
import { addDays, differenceInCalendarDays, subDays } from 'date-fns'
import { runtimeConfig } from '@/lib/runtime-config'

const DEMO_MARKER = 'ROOMQC-DEMO'
const DEMO_STEP_TOTAL = 25

// Keep demo identifiers deterministic so reruns are easy to inspect and do not
// depend on database-side random code generators.
const demoCode = (kind: string, index: number) =>
  `${DEMO_MARKER}-${kind}-${String(index + 1).padStart(3, '0')}`

interface SeedProgress {
  step: string
  current: number
  total: number
  message: string
}

type ProgressCallback = (progress: SeedProgress) => void

class SeedDataError extends Error {
  constructor(step: string, message: string) {
    super(`${step}: ${message}`)
    this.name = 'SeedDataError'
  }
}

function assertSeedResult(error: { message?: string; details?: string; hint?: string } | null, step: string): void {
  if (!error) return
  const detail = [error.message, error.details, error.hint].filter(Boolean).join(' - ')
  throw new SeedDataError(step, detail || 'Supabase từ chối thao tác')
}

async function assertSeedContext(tenantId: string, hotelId: string, userId: string): Promise<void> {
  if (!runtimeConfig.demoDataEnabled) {
    throw new SeedDataError('Cấu hình', 'Tính năng dữ liệu demo đang bị tắt trên môi trường này')
  }
  if (!tenantId || !hotelId || !userId) {
    throw new SeedDataError('Cấu hình', 'Thiếu tenant, khách sạn hoặc người dùng hiện tại')
  }

  const [tenantResult, hotelResult, userResult] = await Promise.all([
    supabase.from('tenants').select('id').eq('id', tenantId).maybeSingle(),
    supabase.from('hotels').select('id').eq('id', hotelId).eq('tenant_id', tenantId).maybeSingle(),
    supabase.from('users').select('id').eq('id', userId).eq('tenant_id', tenantId).maybeSingle(),
  ])

  assertSeedResult(tenantResult.error, 'Tenant')
  assertSeedResult(hotelResult.error, 'Khách sạn')
  assertSeedResult(userResult.error, 'Người dùng')

  if (!tenantResult.data) {
    throw new SeedDataError('Cấu hình', 'Tenant hiện tại không tồn tại hoặc không thuộc quyền truy cập')
  }
  if (!hotelResult.data) {
    throw new SeedDataError('Cấu hình', 'Khách sạn không tồn tại hoặc không thuộc tenant hiện tại')
  }
  if (!userResult.data) {
    throw new SeedDataError('Cấu hình', 'Người dùng không tồn tại hoặc không thuộc tenant hiện tại')
  }
}

function assertSeedCollection<T>(value: T[], step: string): T[] {
  if (value.length === 0) throw new SeedDataError(step, 'Không tạo được bản ghi nào')
  return value
}

export const seedDemoData = async (
  tenantId: string,
  hotelId: string,
  userId: string,
  onProgress?: ProgressCallback
) => {
  const updateProgress = (step: string, current: number, total: number, message: string) => {
    if (onProgress) {
      onProgress({ step, current, total, message })
    }
  }

  try {
    await assertSeedContext(tenantId, hotelId, userId)
    // 1. Create Categories (5)
    updateProgress('categories', 0, DEMO_STEP_TOTAL, '📂 Creating categories...')
    const categories = assertSeedCollection(await createDemoCategories(tenantId), 'Danh mục')

    // 2. Create Items (50)
    updateProgress('items', 1, DEMO_STEP_TOTAL, '📦 Creating items...')
    const items = assertSeedCollection(await createDemoItems(tenantId, hotelId, categories), 'Tài sản')

    // 3. Create Rooms (20)
    updateProgress('rooms', 2, DEMO_STEP_TOTAL, '🏠 Creating rooms...')
    const rooms = assertSeedCollection(await createDemoRooms(tenantId, hotelId), 'Phòng')

    // 4. Assign Items to Rooms
    updateProgress('room-items', 3, DEMO_STEP_TOTAL, '🔗 Assigning items to rooms...')
    await assignItemsToRooms(rooms, items)

    // 5. Create Room Type Standards
    updateProgress('standards', 4, DEMO_STEP_TOTAL, '📋 Creating room standards...')
    await createRoomStandards(tenantId, hotelId, items)

    // 6. Create Laundry Vendors (3)
    updateProgress('laundry-vendors', 5, DEMO_STEP_TOTAL, '🧺 Creating laundry vendors...')
    const laundryVendors = assertSeedCollection(await createLaundryVendors(tenantId), 'Nhà cung cấp giặt là')

    // 7. Create Laundry Batches (10)
    updateProgress('batches', 6, DEMO_STEP_TOTAL, '📦 Creating laundry batches...')
    const batches = await createLaundryBatches(tenantId, hotelId, userId, laundryVendors, items)

    // 8. Create Vendors (10)
    updateProgress('vendors', 7, DEMO_STEP_TOTAL, '🏪 Creating vendors...')
    const vendors = assertSeedCollection(await createVendors(tenantId), 'Nhà cung cấp')

    // 9. Create Purchase Orders (15)
    updateProgress('pos', 8, DEMO_STEP_TOTAL, '📝 Creating purchase orders...')
    const pos = await createPurchaseOrders(tenantId, hotelId, userId, vendors, items)

    // 10. Create Inventory Transactions (100)
    updateProgress('transactions', 9, DEMO_STEP_TOTAL, '📊 Creating transactions...')
    await createTransactions(tenantId, hotelId, userId, items, rooms, batches, pos)

    // 11. Create Stock Adjustments (5)
    updateProgress('adjustments', 10, DEMO_STEP_TOTAL, '🔧 Creating stock adjustments...')
    await createStockAdjustments(tenantId, hotelId, userId, items)

    // 12. Create Room Checks (30)
    updateProgress('checks', 11, DEMO_STEP_TOTAL, '✅ Creating room checks...')
    await createRoomChecks(userId, rooms)

    // 13. Create Maintenance Requests (10)
    updateProgress('maintenance', 12, DEMO_STEP_TOTAL, '🔧 Creating maintenance requests...')
    await createMaintenanceRequests(tenantId, hotelId, userId, rooms, items)

    // 14. Create Notifications (20)
    updateProgress('notifications', 13, DEMO_STEP_TOTAL, '🔔 Creating notifications...')
    await createNotifications(tenantId, userId)

    // 15. Create Activity Logs (50)
    updateProgress('logs', 14, DEMO_STEP_TOTAL, '📝 Creating activity logs...')
    await createActivityLogs(tenantId, userId)

    updateProgress('hotel-config', 15, DEMO_STEP_TOTAL, '⚙️ Creating hotel settings and pricing...')
    await createHotelConfiguration(tenantId, hotelId)

    updateProgress('guests', 16, DEMO_STEP_TOTAL, '👥 Creating demo guests...')
    const guests = await createDemoGuests(tenantId)

    updateProgress('bookings', 17, DEMO_STEP_TOTAL, '🛎️ Creating demo bookings...')
    const bookings = await createDemoBookings(tenantId, hotelId, userId, rooms, guests)

    updateProgress('booking-payments', 18, DEMO_STEP_TOTAL, '💳 Creating booking payments...')
    await createDemoBookingPayments(tenantId, hotelId, userId, bookings)

    updateProgress('guest-invoices', 19, DEMO_STEP_TOTAL, '🧾 Creating guest invoices...')
    await createDemoGuestInvoices(tenantId, hotelId, userId, bookings, rooms, guests)

    updateProgress('housekeeping', 20, DEMO_STEP_TOTAL, '🧹 Creating housekeeping tasks...')
    const housekeepingTasks = await createDemoHousekeepingTasks(tenantId, hotelId, userId, rooms, bookings)

    updateProgress('warehouses', 21, DEMO_STEP_TOTAL, '🏬 Creating warehouses and stock...')
    await createDemoWarehouses(tenantId, hotelId, items)

    updateProgress('supplements', 22, DEMO_STEP_TOTAL, '📦 Creating supplement requests and distribution...')
    await createDemoSupplementsAndDistribution(tenantId, hotelId, userId, rooms, items)

    updateProgress('chat', 23, DEMO_STEP_TOTAL, '💬 Creating demo chat...')
    await createDemoChat(tenantId, hotelId, userId)

    updateProgress('complete', DEMO_STEP_TOTAL, DEMO_STEP_TOTAL, '✅ Demo data seeding completed!')

    return {
      success: true,
      summary: {
        categories: categories.length,
        items: items.length,
        rooms: rooms.length,
        laundryVendors: laundryVendors.length,
        batches: batches.length,
        vendors: vendors.length,
        purchaseOrders: pos.length,
        guests: guests.length,
        bookings: bookings.length,
        housekeepingTasks: housekeepingTasks.length,
      }
    }
  } catch (error: unknown) {
    console.error('Seeding error:', error)
    const message = error instanceof Error ? error.message : 'Lỗi không xác định'
    throw new Error(`Không thể tạo dữ liệu demo. ${message}`)
  }
}

// Helper Functions

const createDemoCategories = async (tenantId: string) => {
  const categories = [
    { name: 'Đồ vải', name_en: 'Fabric & Linens', icon: 'shirt', color: '#3b82f6', sort_order: 1 },
    { name: 'Tiện nghi', name_en: 'Amenities', icon: 'sparkles', color: '#8b5cf6', sort_order: 2 },
    { name: 'Thiết bị điện', name_en: 'Electronics', icon: 'tv', color: '#10b981', sort_order: 3 },
    { name: 'Nội thất', name_en: 'Furniture', icon: 'sofa', color: '#f59e0b', sort_order: 4 },
    { name: 'Đồ vệ sinh', name_en: 'Cleaning Supplies', icon: 'spray', color: '#06b6d4', sort_order: 5 }
  ]

  // Check existing categories first
  const { data: existing, error: existingError } = await supabase
    .from('item_categories')
    .select('name')
    .eq('tenant_id', tenantId)
  assertSeedResult(existingError, 'Danh mục')

  const existingNames = new Set(existing?.map(c => c.name) || [])
  const created = []

  for (const cat of categories) {
    // Skip if already exists
    if (existingNames.has(cat.name)) {
      const { data: existingCat, error: existingCatError } = await supabase
        .from('item_categories')
        .select()
        .eq('tenant_id', tenantId)
        .eq('name', cat.name)
        .single()
      assertSeedResult(existingCatError, `Danh mục ${cat.name}`)
      
      if (existingCat) created.push(existingCat)
      continue
    }

    const { data, error } = await supabase
      .from('item_categories')
      .insert({
        ...cat,
        tenant_id: tenantId,
        description: `Danh mục ${cat.name}`
      })
      .select()
      .single()
    assertSeedResult(error, `Danh mục ${cat.name}`)
    
    if (data) created.push(data)
  }

  return created
}

const createDemoItems = async (tenantId: string, hotelId: string, categories: any[]) => {
  const itemsData: Record<string, any[]> = {
    'Đồ vải': [
      { name: 'Khăn tắm trắng', unit: 'cái', unit_price: 50000, quantity: 200, min: 50, max_wash: 100 },
      { name: 'Khăn mặt trắng', unit: 'cái', unit_price: 30000, quantity: 250, min: 60, max_wash: 100 },
      { name: 'Ga giường trắng', unit: 'bộ', unit_price: 200000, quantity: 100, min: 20, max_wash: 80 },
      { name: 'Vỏ gối trắng', unit: 'cái', unit_price: 50000, quantity: 150, min: 30, max_wash: 80 },
      { name: 'Chăn cotton', unit: 'cái', unit_price: 300000, quantity: 80, min: 15, max_wash: 50 },
      { name: 'Mền mỏng', unit: 'cái', unit_price: 250000, quantity: 60, min: 10, max_wash: 50 },
      { name: 'Khăn trải giường', unit: 'cái', unit_price: 150000, quantity: 40, min: 8, max_wash: 60 },
      { name: 'Rèm cửa', unit: 'bộ', unit_price: 500000, quantity: 25, min: 5, max_wash: 30 },
      { name: 'Khăn trải bàn', unit: 'cái', unit_price: 80000, quantity: 50, min: 10, max_wash: 80 },
      { name: 'Tạp dề', unit: 'cái', unit_price: 40000, quantity: 30, min: 5, max_wash: 100 }
    ],
    'Tiện nghi': [
      { name: 'Bàn chải đánh răng', unit: 'cái', unit_price: 5000, quantity: 500, min: 100 },
      { name: 'Kem đánh răng', unit: 'tuýp', unit_price: 8000, quantity: 400, min: 80 },
      { name: 'Dầu gội đầu', unit: 'chai', unit_price: 25000, quantity: 300, min: 50 },
      { name: 'Sữa tắm', unit: 'chai', unit_price: 25000, quantity: 300, min: 50 },
      { name: 'Lược', unit: 'cái', unit_price: 10000, quantity: 250, min: 50 },
      { name: 'Dép đi trong phòng', unit: 'đôi', unit_price: 30000, quantity: 200, min: 40 },
      { name: 'Bộ pha trà', unit: 'bộ', unit_price: 50000, quantity: 100, min: 20 },
      { name: 'Cà phê hòa tan', unit: 'gói', unit_price: 5000, quantity: 600, min: 100 },
      { name: 'Khăn giấy', unit: 'hộp', unit_price: 15000, quantity: 350, min: 60 },
      { name: 'Bông tẩy trang', unit: 'hộp', unit_price: 20000, quantity: 150, min: 30 }
    ],
    'Thiết bị điện': [
      { name: 'Tivi Samsung 55 inch', unit: 'cái', unit_price: 12000000, quantity: 25, min: 3 },
      { name: 'Tủ lạnh Mini 50L', unit: 'cái', unit_price: 3500000, quantity: 30, min: 5 },
      { name: 'Máy sấy tóc', unit: 'cái', unit_price: 350000, quantity: 35, min: 8 },
      { name: 'Ấm đun nước', unit: 'cái', unit_price: 300000, quantity: 40, min: 8 },
      { name: 'Remote tivi', unit: 'cái', unit_price: 150000, quantity: 30, min: 5 },
      { name: 'Điều hòa Daikin 12000BTU', unit: 'cái', unit_price: 8500000, quantity: 25, min: 3 },
      { name: 'Quạt trần', unit: 'cái', unit_price: 1200000, quantity: 20, min: 3 },
      { name: 'Đèn ngủ', unit: 'cái', unit_price: 200000, quantity: 50, min: 10 },
      { name: 'Két sắt điện tử', unit: 'cái', unit_price: 2500000, quantity: 28, min: 5 },
      { name: 'Điện thoại nội bộ', unit: 'cái', unit_price: 500000, quantity: 30, min: 5 }
    ],
    'Nội thất': [
      { name: 'Giường đôi 1m8', unit: 'cái', unit_price: 8000000, quantity: 20, min: 2 },
      { name: 'Gối nằm', unit: 'cái', unit_price: 150000, quantity: 60, min: 10 },
      { name: 'Tủ quần áo 3 cánh', unit: 'cái', unit_price: 5000000, quantity: 25, min: 3 },
      { name: 'Bàn làm việc', unit: 'cái', unit_price: 2000000, quantity: 28, min: 5 },
      { name: 'Ghế làm việc', unit: 'cái', unit_price: 1500000, quantity: 30, min: 5 },
      { name: 'Gương treo tường', unit: 'cái', unit_price: 500000, quantity: 35, min: 5 },
      { name: 'Tranh trang trí', unit: 'bức', unit_price: 300000, quantity: 40, min: 8 },
      { name: 'Thùng rác', unit: 'cái', unit_price: 100000, quantity: 50, min: 10 },
      { name: 'Móc treo quần áo', unit: 'cái', unit_price: 50000, quantity: 60, min: 12 },
      { name: 'Kệ để hành lý', unit: 'cái', unit_price: 800000, quantity: 25, min: 5 }
    ],
    'Đồ vệ sinh': [
      { name: 'Giấy vệ sinh', unit: 'cuộn', unit_price: 8000, quantity: 800, min: 150 },
      { name: 'Xà phòng rửa tay', unit: 'chai', unit_price: 30000, quantity: 200, min: 40 },
      { name: 'Túi đựng rác', unit: 'cuộn', unit_price: 25000, quantity: 150, min: 30 },
      { name: 'Nước lau sàn', unit: 'chai', unit_price: 40000, quantity: 80, min: 15 },
      { name: 'Chổi quét', unit: 'cái', unit_price: 50000, quantity: 40, min: 8 },
      { name: 'Cây lau nhà', unit: 'bộ', unit_price: 150000, quantity: 30, min: 6 },
      { name: 'Khăn lau', unit: 'cái', unit_price: 20000, quantity: 100, min: 20 },
      { name: 'Nước tẩy rửa', unit: 'chai', unit_price: 35000, quantity: 60, min: 12 },
      { name: 'Xịt thơm phòng', unit: 'chai', unit_price: 80000, quantity: 50, min: 10 },
      { name: 'Bàn chải toilet', unit: 'bộ', unit_price: 60000, quantity: 35, min: 7 }
    ]
  }

  const { data: existingItems, error: existingItemsError } = await supabase
    .from('items')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('hotel_id', hotelId)
  assertSeedResult(existingItemsError, 'Tài sản')

  const existingByName = new Map((existingItems ?? []).map((item) => [item.name, item]))
  const createdItems = []
  let itemIndex = 0

  for (const [catName, items] of Object.entries(itemsData)) {
    const category = categories.find(c => c.name === catName)
    if (!category) continue

    for (const item of items) {
      const code = demoCode('ITEM', itemIndex++)
      const existingItem = existingByName.get(item.name)
      if (existingItem) {
        createdItems.push(existingItem)
        continue
      }

      const total = item.quantity
      // Leave enough central stock for room assignments and the laundry
      // examples. The inventory triggers move these quantities between
      // buckets as demo links are created.
      const inStock = Math.ceil(total * 0.9)
      const inUse = Math.floor(total * 0.05)
      const inLaundry = total - inStock - inUse

      const { data, error } = await supabase
        .from('items')
        .insert({
          tenant_id: tenantId,
          hotel_id: hotelId,
          category_id: category.id,
          code,
          name: item.name,
          unit: item.unit,
          unit_price: item.unit_price,
          quantity_total: total,
          quantity_in_stock: inStock,
          quantity_in_use: inUse,
          quantity_in_laundry: inLaundry,
          minimum_stock: item.min,
          reorder_point: item.min + 5,
          max_wash_cycles: item.max_wash || null,
          current_wash_cycles: item.max_wash ? Math.floor(Math.random() * item.max_wash * 0.3) : 0,
          status: 'active'
        } as any)
        .select()
        .single()
      assertSeedResult(error, `Tài sản ${item.name}`)

      if (data) createdItems.push(data)
    }
  }

  return createdItems
}

const createDemoRooms = async (tenantId: string, hotelId: string) => {
  const statuses = ['vacant_clean', 'occupied_clean', 'vacant_dirty']
  
  const rooms = []
  let roomNum = 101

  // Floor 1: Standard rooms (1-8)
  for (let i = 0; i < 8; i++) {
    rooms.push({
      tenant_id: tenantId,
      hotel_id: hotelId,
      room_number: `${roomNum++}`,
      floor: 1,
      room_type: 'standard',
      status: statuses[i % 3],
      area_sqm: 25,
      max_guests: 2,
      bed_type: 'Giường đôi',
      base_price: 800000
    })
  }

  // Floor 2: Mix of Standard and Deluxe (201-208)
  roomNum = 201
  for (let i = 0; i < 8; i++) {
    rooms.push({
      tenant_id: tenantId,
      hotel_id: hotelId,
      room_number: `${roomNum++}`,
      floor: 2,
      room_type: i < 4 ? 'standard' : 'deluxe',
      status: statuses[i % 3],
      area_sqm: i < 4 ? 25 : 35,
      max_guests: i < 4 ? 2 : 3,
      bed_type: i < 4 ? 'Giường đôi' : '2 Giường đơn',
      base_price: i < 4 ? 800000 : 1200000
    })
  }

  // Floor 3: Deluxe and Suite (301-304)
  roomNum = 301
  for (let i = 0; i < 4; i++) {
    rooms.push({
      tenant_id: tenantId,
      hotel_id: hotelId,
      room_number: `${roomNum++}`,
      floor: 3,
      room_type: i < 2 ? 'deluxe' : 'suite',
      status: i === 0 ? 'vacant_clean' : 'occupied_clean',
      area_sqm: i < 2 ? 35 : 50,
      max_guests: i < 2 ? 3 : 4,
      bed_type: i < 2 ? '2 Giường đơn' : 'Giường King',
      base_price: i < 2 ? 1200000 : 2000000
    })
  }

  const { data: existingRooms, error: existingRoomsError } = await supabase
    .from('rooms')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('hotel_id', hotelId)
  assertSeedResult(existingRoomsError, 'Phòng')

  const existingByNumber = new Map((existingRooms ?? []).map((room) => [room.room_number, room]))
  const created = []
  for (const room of rooms) {
    const existingRoom = existingByNumber.get(room.room_number)
    if (existingRoom) {
      created.push(existingRoom)
      continue
    }

    const { data, error } = await supabase
      .from('rooms')
      .insert(room)
      .select()
      .single()
    assertSeedResult(error, `Phòng ${room.room_number}`)
    
    if (data) created.push(data)
  }

  return created
}

// ... Continue with remaining helper functions
const assignItemsToRooms = async (rooms: any[], items: any[]) => {
  const roomIds = rooms.map((room) => room.id)
  const { data: existingAssignments, error: existingAssignmentsError } = await supabase
    .from('room_items')
    .select('room_id,item_id')
    .in('room_id', roomIds)
  assertSeedResult(existingAssignmentsError, 'Tài sản phòng')

  const existingKeys = new Set((existingAssignments ?? []).map((row) => `${row.room_id}:${row.item_id}`))

  // Keep the demo allocation intentionally small. `room_items` has a database
  // trigger that moves quantity from central stock to room usage, while the
  // laundry trigger also consumes central stock. A quantity of one per room
  // leaves enough headroom for the later laundry examples and keeps reruns
  // deterministic.
  for (const room of rooms) {
    const itemsPerRoom = room.room_type === 'suite' ? 30 : room.room_type === 'deluxe' ? 25 : 20
    const selectedItems = items.slice(0, itemsPerRoom)

    for (const item of selectedItems) {
      const key = `${room.id}:${item.id}`
      if (existingKeys.has(key)) continue

      const quantity = room.room_type === 'suite' ? 2 : 1

      const { error } = await supabase
        .from('room_items')
        .insert({
          room_id: room.id,
          item_id: item.id,
          quantity,
          condition: 'good'
      })
      assertSeedResult(error, `Gán tài sản cho phòng ${room.room_number}`)
      existingKeys.add(key)
    }
  }
}

const createRoomStandards = async (tenantId: string, hotelId: string, items: any[]) => {
  const standards = [
    { room_type: 'standard', item_count: 20 },
    { room_type: 'deluxe', item_count: 25 },
    { room_type: 'suite', item_count: 30 }
  ]

  const { data: existingStandards, error: existingStandardsError } = await supabase
    .from('room_type_standards')
    .select('hotel_id,room_type,item_id')
    .eq('tenant_id', tenantId)
    .eq('hotel_id', hotelId)
  assertSeedResult(existingStandardsError, 'Tiêu chuẩn phòng')
  const existingKeys = new Set((existingStandards ?? []).map((row) => `${row.room_type}:${row.item_id}`))

  for (const standard of standards) {
    const selectedItems = items.slice(0, standard.item_count)
    
    for (const item of selectedItems) {
      const key = `${standard.room_type}:${item.id}`
      if (existingKeys.has(key)) continue

      const { error } = await supabase
        .from('room_type_standards')
        .insert({
          tenant_id: tenantId,
          hotel_id: hotelId,
          room_type: standard.room_type,
          item_id: item.id,
          quantity: Math.ceil(Math.random() * 3)
        })
      assertSeedResult(error, `Tiêu chuẩn phòng ${standard.room_type}`)
    }
  }
}

const createLaundryVendors = async (tenantId: string) => {
  const vendors = [
    { name: 'Giặt Là Hoàng Gia', type: 'external', phone: '0901234567', price_per_kg: 25000 },
    { name: 'Giặt Là Cao Cấp', type: 'external', phone: '0907654321', price_per_kg: 30000 },
    { name: 'Giặt Nội Bộ', type: 'in_house', phone: '0909999999', price_per_kg: 15000 }
  ]

  const { data: existingVendors, error: existingVendorsError } = await supabase
    .from('laundry_vendors')
    .select('*')
    .eq('tenant_id', tenantId)
  assertSeedResult(existingVendorsError, 'Nhà cung cấp giặt là')
  const existingByName = new Map((existingVendors ?? []).map((vendor) => [vendor.name, vendor]))
  const created = []
  for (const [index, vendor] of vendors.entries()) {
    const existingVendor = existingByName.get(vendor.name)
    if (existingVendor) {
      created.push(existingVendor)
      continue
    }

    const { data, error } = await supabase
      .from('laundry_vendors')
      .insert({
        tenant_id: tenantId,
        code: demoCode('LND', index),
        name: vendor.name,
        type: vendor.type,
        phone: vendor.phone,
        contract_info: { price_per_kg: vendor.price_per_kg },
        status: 'active'
      } as any)
      .select()
      .single()
    assertSeedResult(error, `Nhà cung cấp giặt là ${vendor.name}`)
    
    if (data) created.push(data)
  }

  return created
}

const createLaundryBatches = async (
  tenantId: string,
  hotelId: string,
  userId: string,
  vendors: any[],
  items: any[]
) => {
  const statuses = ['delivered', 'delivered', 'delivered', 'washing', 'washing', 'ready', 'ready', 'received', 'received', 'received']
  const { data: existingBatches, error: existingBatchesError } = await supabase
    .from('laundry_batches')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('hotel_id', hotelId)
    .like('notes', `${DEMO_MARKER}-BATCH-%`)
  assertSeedResult(existingBatchesError, 'Lô giặt')

  const created = [...(existingBatches ?? [])]

  const { data: liveItems, error: liveItemsError } = await supabase
    .from('items')
    .select('id,quantity_in_stock')
    .in('id', items.map((item) => item.id))
  assertSeedResult(liveItemsError, 'Tồn kho trước khi tạo lô giặt')
  const availableByItem = new Map(
    (liveItems ?? []).map((item) => [item.id, Math.max(0, Number(item.quantity_in_stock) || 0)])
  )

  for (let i = 0; i < 10; i++) {
    const vendor = vendors[i % vendors.length]
    const status = statuses[i]
    const deliveryDate = subDays(new Date(), 10 - i)
    const candidates = items.slice(i * 3, i * 3 + 3)
    if (candidates.length === 0) continue

    const batchNote = `${DEMO_MARKER}-BATCH-${i + 1}`
    const existingBatch = existingBatches?.find((batch) => batch.notes === batchNote)
    if (existingBatch) continue

    // Keep each detail row within the live central stock. For received batches
    // we insert as still-in-laundry, then update returned quantity so the
    // inventory trigger moves it back to stock exactly once.
    const plannedItems = candidates
      .map((item) => {
        const available = availableByItem.get(item.id) ?? 0
        const quantity = Math.min(1, available)
        return quantity > 0 ? { item, quantity } : null
      })
      .filter(Boolean) as Array<{ item: any; quantity: number }>
    if (plannedItems.length === 0) continue
    const totalItems = plannedItems.reduce((sum, entry) => sum + entry.quantity, 0)
    const totalWeight = totalItems * 2

    const { data: batch, error } = await supabase
      .from('laundry_batches')
      .insert({
        tenant_id: tenantId,
        hotel_id: hotelId,
        batch_code: demoCode('LB', i),
        vendor_id: vendor.id,
        delivery_date: deliveryDate.toISOString(),
        expected_return_date: addDays(deliveryDate, 2).toISOString(),
        actual_return_date: status === 'received' ? addDays(deliveryDate, 2).toISOString() : null,
        delivery_staff_id: userId,
        return_staff_id: status === 'received' ? userId : null,
        total_items: totalItems,
        total_weight_kg: totalWeight,
        estimated_cost: totalWeight * 25000,
        actual_cost: status === 'received' ? totalWeight * 25000 : null,
        status: status,
        quality_rating: status === 'received' ? 4 + Math.random() : null,
        timeliness_rating: status === 'received' ? 4 + Math.random() : null,
        notes: batchNote
      } as any)
      .select()
      .single()
    assertSeedResult(error, `Lô giặt ${i + 1}`)

    if (batch) {
      created.push(batch)

      for (const [itemIndex, planned] of plannedItems.entries()) {
        const { data: batchItem, error: itemError } = await supabase
          .from('laundry_batch_items')
          .insert({
            batch_id: batch.id,
            item_id: planned.item.id,
            quantity_delivered: planned.quantity,
            weight_kg: 2,
            quantity_returned: 0,
            condition_note: `${DEMO_MARKER} - mẫu lô giặt ${i + 1}`,
          } as any)
          .select('id')
          .single()
        assertSeedResult(itemError, `Chi tiết lô giặt ${i + 1}/${itemIndex + 1}`)

        if (status === 'received' && batchItem) {
          const { error: returnError } = await supabase
            .from('laundry_batch_items')
            .update({ quantity_returned: planned.quantity })
            .eq('id', batchItem.id)
          assertSeedResult(returnError, `Hoàn trả lô giặt ${i + 1}/${itemIndex + 1}`)
        } else if (status !== 'received') {
          const available = availableByItem.get(planned.item.id) ?? 0
          availableByItem.set(planned.item.id, Math.max(0, available - planned.quantity))
        }
      }
    }
  }

  return created
}

const createVendors = async (tenantId: string) => {
  const vendors = [
    { name: 'Công ty TNHH Nội Thất ABC', category: 'supplier', phone: '0281234567' },
    { name: 'Công ty CP Điện Máy XYZ', category: 'supplier', phone: '0287654321' },
    { name: 'Nhà Cung Cấp Vải', category: 'supplier', phone: '0283334444' },
    { name: 'Công Ty Vệ Sinh 123', category: 'service_provider', phone: '0285556666' },
    { name: 'Nhà Cung Cấp Amenities', category: 'supplier', phone: '0287778888' },
    { name: 'Công Ty Sửa Chữa Điện', category: 'contractor', phone: '0289990000' },
    { name: 'Nhà Cung Cấp Thiết Bị', category: 'supplier', phone: '0282223333' },
    { name: 'Công Ty Bảo Trì', category: 'contractor', phone: '0284445555' },
    { name: 'Nhà Cung Cấp F&B', category: 'supplier', phone: '0286667777' },
    { name: 'Công Ty IT Solutions', category: 'service_provider', phone: '0288889999' }
  ]

  const { data: existingVendors, error: existingVendorsError } = await supabase
    .from('vendors')
    .select('*')
    .eq('tenant_id', tenantId)
  assertSeedResult(existingVendorsError, 'Nhà cung cấp')
  const existingByName = new Map((existingVendors ?? []).map((vendor) => [vendor.name, vendor]))
  const created = []
  for (const [index, vendor] of vendors.entries()) {
    const existingVendor = existingByName.get(vendor.name)
    if (existingVendor) {
      created.push(existingVendor)
      continue
    }

    const { data, error } = await supabase
      .from('vendors')
      .insert({
        tenant_id: tenantId,
        code: demoCode('VND', index),
        name: vendor.name,
        category: vendor.category,
        phone: vendor.phone,
        status: 'active'
      } as any)
      .select()
      .single()
    assertSeedResult(error, `Nhà cung cấp ${vendor.name}`)
    
    if (data) created.push(data)
  }

  return created
}

const createPurchaseOrders = async (
  tenantId: string,
  hotelId: string,
  userId: string,
  vendors: any[],
  items: any[]
) => {
  const statuses = ['draft', 'draft', 'submitted', 'submitted', 'submitted', 'approved', 'approved', 'ordered', 'ordered', 'ordered', 'partial', 'partial', 'received', 'received', 'received']
  const { data: existingOrders, error: existingOrdersError } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('hotel_id', hotelId)
    .like('notes', `${DEMO_MARKER}%`)
  assertSeedResult(existingOrdersError, 'Đơn đặt hàng')

  const created = [...(existingOrders ?? [])]

  for (let i = 0; i < 15; i++) {
    const vendor = vendors[i % vendors.length]
    const status = statuses[i]
    const orderDate = subDays(new Date(), 15 - i)

    let po = existingOrders?.find((order) => order.notes === `${DEMO_MARKER}-PO-${i + 1}`)

    if (!po) {
      const { data, error: poError } = await supabase
        .from('purchase_orders')
        .insert({
          tenant_id: tenantId,
          hotel_id: hotelId,
          po_code: demoCode('PO', i),
          vendor_id: vendor.id,
          requested_by: userId,
          order_date: orderDate.toISOString().split('T')[0],
          expected_delivery_date: addDays(orderDate, 7).toISOString().split('T')[0],
          actual_delivery_date: ['received', 'partial'].includes(status) ? addDays(orderDate, 7).toISOString().split('T')[0] : null,
          status: status,
          subtotal: 5000000 + i * 1000000,
          tax_amount: 0,
          shipping_fee: 0,
          total_amount: 5000000 + i * 1000000,
          notes: `${DEMO_MARKER}-PO-${i + 1}`
        } as any)
        .select()
        .single()
      assertSeedResult(poError, `Đơn đặt hàng ${i + 1}`)
      po = data
    }

    if (po) {
      const { data: existingLines, error: existingLinesError } = await supabase
        .from('purchase_order_items')
        .select('item_id')
        .eq('po_id', po.id)
      assertSeedResult(existingLinesError, `Dòng đơn đặt hàng ${i + 1}`)
      const existingItemIds = new Set((existingLines ?? []).map((line) => line.item_id))

      const numItems = 3 + (i % 3)
      for (let j = 0; j < numItems; j++) {
        const item = items[(i * 3 + j) % items.length]
        if (existingItemIds.has(item.id)) continue

        const { error } = await supabase
          .from('purchase_order_items')
          .insert({
            po_id: po.id,
            item_id: item.id,
            quantity_ordered: 10 + j * 5,
            quantity_received: status === 'received' ? 10 + j * 5 : status === 'partial' ? 5 + j * 2 : 0,
            unit_price: item.unit_price
          })
        assertSeedResult(error, `Dòng đơn đặt hàng ${i + 1}/${j + 1}`)
      }

      if (!created.some((order) => order.id === po.id)) created.push(po)
    }
  }

  return created
}

const createTransactions = async (
  tenantId: string,
  hotelId: string,
  userId: string,
  items: any[],
  rooms: any[],
  batches: any[],
  pos: any[]
) => {
  const pairs = [
    ['in', 'purchase'],
    ['out', 'room_deliver'],
    ['in', 'return'],
    ['out', 'laundry_send'],
    ['in', 'other_in'],
  ] as const

  const { count: existingCount, error: existingCountError } = await supabase
    .from('inventory_transactions')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('notes', DEMO_MARKER)
  assertSeedResult(existingCountError, 'Giao dịch kho')
  if ((existingCount ?? 0) >= 100) return

  for (let i = 0; i < 100; i++) {
    const item = items[i % items.length]
    const [type, category] = pairs[i % pairs.length]
    const quantity = 1 + Math.floor(Math.random() * 5)

    const { error } = await supabase
      .from('inventory_transactions')
      .insert({
        tenant_id: tenantId,
        hotel_id: hotelId,
        item_id: item.id,
        transaction_code: demoCode('TXN', i),
        transaction_type: type,
        transaction_category: category,
        quantity: quantity,
        unit_price: item.unit_price,
        total_value: quantity * item.unit_price,
        quantity_before: item.quantity_in_stock,
        quantity_after: item.quantity_in_stock + (type === 'in' ? quantity : -quantity),
        created_by: userId,
        transaction_date: subDays(new Date(), Math.floor(Math.random() * 30)).toISOString(),
        notes: DEMO_MARKER
      } as any)
    assertSeedResult(error, `Giao dịch kho ${i + 1}`)
  }
}

const createStockAdjustments = async (
  tenantId: string,
  hotelId: string,
  userId: string,
  items: any[]
) => {
  const statuses = ['draft', 'in_progress', 'completed', 'completed', 'approved']
  const itemStatuses = ['pending', 'pending', 'approved', 'approved', 'rejected']

  const { data: existingAdjustments, error: existingAdjustmentsError } = await supabase
    .from('stock_adjustments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('hotel_id', hotelId)
    .like('notes', `${DEMO_MARKER}%`)
  assertSeedResult(existingAdjustmentsError, 'Phiếu kiểm kê')

  for (let i = 0; i < 5; i++) {
    let adjustment = existingAdjustments?.find((row) => row.notes === `${DEMO_MARKER}-ADJ-${i + 1}`)

    if (!adjustment) {
      const { data, error: adjustmentError } = await supabase
        .from('stock_adjustments')
        .insert({
          tenant_id: tenantId,
          hotel_id: hotelId,
          adjustment_code: demoCode('ADJ', i),
          adjustment_type: 'inventory_check',
          scheduled_date: subDays(new Date(), 5 - i).toISOString().split('T')[0],
          status: statuses[i],
          created_by: userId,
          notes: `${DEMO_MARKER}-ADJ-${i + 1}`
        } as any)
        .select()
        .single()
      assertSeedResult(adjustmentError, `Phiếu kiểm kê ${i + 1}`)
      adjustment = data
    }

    if (adjustment) {
      const { data: existingLines, error: existingLinesError } = await supabase
        .from('stock_adjustment_items')
        .select('item_id')
        .eq('adjustment_id', adjustment.id)
      assertSeedResult(existingLinesError, `Dòng kiểm kê ${i + 1}`)
      const existingItemIds = new Set((existingLines ?? []).map((line) => line.item_id))

      for (let j = 0; j < 10; j++) {
        const item = items[(i * 10 + j) % items.length]
        if (existingItemIds.has(item.id)) continue

        const systemQty = item.quantity_in_stock
        const actualQty = Math.max(0, systemQty + Math.floor(Math.random() * 11) - 5) // +/- 5

        const { error } = await supabase
          .from('stock_adjustment_items')
          .insert({
            adjustment_id: adjustment.id,
            item_id: item.id,
            system_quantity: systemQty,
            actual_quantity: actualQty,
            status: itemStatuses[i],
            checked_by: userId
          })
        assertSeedResult(error, `Dòng kiểm kê ${i + 1}/${j + 1}`)
      }
    }
  }
}

const createRoomChecks = async (userId: string, rooms: any[]) => {
  const checkTypes = ['daily', 'checkout', 'checkin']

  const { count: existingCount, error: existingCountError } = await supabase
    .from('room_checks')
    .select('id', { count: 'exact', head: true })
    .eq('checked_by', userId)
    .eq('notes', DEMO_MARKER)
  assertSeedResult(existingCountError, 'Kiểm tra phòng')
  if ((existingCount ?? 0) >= 30) return

  for (let i = 0; i < 30; i++) {
    const room = rooms[i % rooms.length]
    const checkType = checkTypes[i % checkTypes.length]

    const { error } = await supabase
      .from('room_checks')
      .insert({
        room_id: room.id,
        tenant_id: room.tenant_id,
        hotel_id: room.hotel_id,
        check_type: checkType,
        checked_by: userId,
        cleanliness_score: 3 + Math.floor(Math.random() * 3),
        items_complete: Math.random() > 0.2,
        items_missing: Math.random() > 0.8 ? [{ item: 'Towel', quantity: 1 }] : [],
        items_damaged: [],
        notes: DEMO_MARKER,
        checked_at: subDays(new Date(), Math.floor(Math.random() * 7)).toISOString()
      })
    assertSeedResult(error, `Kiểm tra phòng ${i + 1}`)
  }
}

const createMaintenanceRequests = async (
  tenantId: string,
  hotelId: string,
  userId: string,
  rooms: any[],
  items: any[]
) => {
  const statuses = ['pending', 'pending', 'in_progress', 'in_progress', 'in_progress', 'completed', 'completed', 'completed', 'completed', 'completed']
  const priorities = ['low', 'medium', 'high']
  const issueTypes = ['repair', 'replace', 'inspection', 'cleaning', 'other']

  const { count: existingCount, error: existingCountError } = await supabase
    .from('maintenance_requests')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('hotel_id', hotelId)
    .like('notes', `${DEMO_MARKER}%`)
  assertSeedResult(existingCountError, 'Yêu cầu bảo trì')
  if ((existingCount ?? 0) >= 10) return

  for (let i = 0; i < 10; i++) {
    const room = rooms[i % rooms.length]
    const item = items[i % items.length]

    const { error } = await supabase
      .from('maintenance_requests')
      .insert({
        tenant_id: tenantId,
        hotel_id: hotelId,
        request_code: demoCode('MNT', i),
        room_id: room.id,
        item_id: item.id,
        issue_type: issueTypes[i % issueTypes.length],
        priority: priorities[i % priorities.length],
        title: `Sửa chữa ${item.name} - Phòng ${room.room_number}`,
        description: `Cần kiểm tra và sửa chữa ${item.name}`,
        location: `Phòng ${room.room_number}`,
        status: statuses[i],
        reported_by: userId,
        reported_at: subDays(new Date(), 10 - i).toISOString(),
        notes: `${DEMO_MARKER}-${i + 1}`
      } as any)
    assertSeedResult(error, `Yêu cầu bảo trì ${i + 1}`)
  }
}

const createNotifications = async (tenantId: string, userId: string) => {
  const types = ['info', 'success', 'warning', 'error']
  const categories = ['system', 'inventory', 'room', 'laundry', 'maintenance']

  const { count: existingCount, error: existingCountError } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .like('title', `${DEMO_MARKER}%`)
  assertSeedResult(existingCountError, 'Thông báo')
  if ((existingCount ?? 0) >= 20) return

  for (let i = 0; i < 20; i++) {
    const { error } = await supabase
      .from('notifications')
      .insert({
        tenant_id: tenantId,
        user_id: userId,
        type: types[i % types.length],
        category: categories[i % categories.length],
        title: `${DEMO_MARKER} - Thông báo ${i + 1}`,
        message: `Nội dung thông báo số ${i + 1}`,
        is_read: i < 10
      })
    assertSeedResult(error, `Thông báo ${i + 1}`)
  }
}

const createActivityLogs = async (tenantId: string, userId: string) => {
  const actions = ['create', 'update', 'delete', 'approve', 'reject']
  const entityTypes = ['item', 'room', 'batch', 'vendor', 'purchase_order']

  const { count: existingCount, error: existingCountError } = await supabase
    .from('activity_logs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .like('description', `${DEMO_MARKER}%`)
  assertSeedResult(existingCountError, 'Nhật ký hoạt động')
  if ((existingCount ?? 0) >= 50) return

  for (let i = 0; i < 50; i++) {
    // Activity logs are protected from direct client inserts in some local
    // snapshots; use the SECURITY DEFINER RPC so the same path works with the
    // production RLS policy as well.
    const action = actions[i % actions.length]
    const entityType = entityTypes[i % entityTypes.length]
    const { error } = await supabase.rpc('log_activity', {
      p_tenant_id: tenantId,
      p_user_id: userId,
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: null,
      p_entity_name: `${DEMO_MARKER} Entity ${i + 1}`,
      p_description: `${DEMO_MARKER} - Performed ${action} on ${entityType}`,
      p_old_values: null,
      p_new_values: null,
    } as any)
    assertSeedResult(error, `Nhật ký hoạt động ${i + 1}`)
  }
}

const createHotelConfiguration = async (tenantId: string, hotelId: string) => {
  const settings = {
    tenant_id: tenantId,
    hotel_id: hotelId,
    vat_rate: 8,
    service_fee_rate: 5,
    late_checkout_12_15_pct: 30,
    late_checkout_15_18_pct: 50,
    late_checkout_after18_pct: 100,
    early_checkin_before5_pct: 100,
    early_checkin_5_9_pct: 50,
    early_checkin_9_14_pct: 30,
    monthly_discounts: { monthly: 10, quarterly: 15 },
  }
  const { data: existingSettings, error: settingsLookupError } = await supabase
    .from('hotel_settings')
    .select('id')
    .eq('hotel_id', hotelId)
    .maybeSingle()
  assertSeedResult(settingsLookupError, 'Cấu hình khách sạn')

  if (existingSettings) {
    const { error } = await supabase.from('hotel_settings').update(settings as any).eq('id', existingSettings.id)
    assertSeedResult(error, 'Cập nhật cấu hình khách sạn')
  } else {
    const { error } = await supabase.from('hotel_settings').insert(settings as any)
    assertSeedResult(error, 'Tạo cấu hình khách sạn')
  }

  const pricing = {
    tenant_id: tenantId,
    hotel_id: hotelId,
    standard_checkin_time: '14:00:00',
    standard_checkout_time: '12:00:00',
    early_checkin_before_5: 100,
    early_checkin_5_9: 50,
    early_checkin_9_14: 30,
    late_checkout_12_15: 30,
    late_checkout_15_18: 50,
    late_checkout_after_18: 100,
    default_vat_rate: 8,
    default_service_fee_rate: 5,
    weekend_surcharge: 15,
    high_season_surcharge: 25,
  }
  const { data: existingPricing, error: pricingLookupError } = await supabase
    .from('room_pricing_rules')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('hotel_id', hotelId)
    .maybeSingle()
  assertSeedResult(pricingLookupError, 'Quy tắc giá phòng')

  if (existingPricing) {
    const { error } = await supabase.from('room_pricing_rules').update(pricing as any).eq('id', existingPricing.id)
    assertSeedResult(error, 'Cập nhật quy tắc giá phòng')
  } else {
    const { error } = await supabase.from('room_pricing_rules').insert(pricing as any)
    assertSeedResult(error, 'Tạo quy tắc giá phòng')
  }
}

const createDemoGuests = async (tenantId: string) => {
  const guestData = [
    { name: 'Nguyễn Minh Anh', phone: '0900001001', email: 'demo.guest01@roomqc.local', vip: 'normal' },
    { name: 'Trần Quốc Bảo', phone: '0900001002', email: 'demo.guest02@roomqc.local', vip: 'silver' },
    { name: 'Lê Thu Hà', phone: '0900001003', email: 'demo.guest03@roomqc.local', vip: 'gold' },
    { name: 'Phạm Gia Huy', phone: '0900001004', email: 'demo.guest04@roomqc.local', vip: 'normal' },
    { name: 'Đỗ Ngọc Lan', phone: '0900001005', email: 'demo.guest05@roomqc.local', vip: 'normal' },
    { name: 'Công ty ABC Travel', phone: '0900001006', email: 'demo.guest06@roomqc.local', vip: 'platinum' },
  ]

  const { data: existing, error: existingError } = await supabase
    .from('guests')
    .select('*')
    .eq('tenant_id', tenantId)
    .like('notes', `${DEMO_MARKER}-GUEST-%`)
  assertSeedResult(existingError, 'Khách demo')
  const existingByPhone = new Map((existing ?? []).map((guest) => [guest.phone, guest]))
  const created = [...(existing ?? [])]

  for (const [index, guest] of guestData.entries()) {
    if (existingByPhone.has(guest.phone)) continue
    const { data, error } = await supabase
      .from('guests')
      .insert({
        tenant_id: tenantId,
        full_name: guest.name,
        phone: guest.phone,
        email: guest.email,
        id_type: 'cccd',
        id_number: `DEMO${String(index + 1).padStart(8, '0')}`,
        nationality: 'Vietnam',
        gender: index % 2 === 0 ? 'female' : 'male',
        vip_level: guest.vip,
        notes: `${DEMO_MARKER}-GUEST-${index + 1}`,
      } as any)
      .select()
      .single()
    assertSeedResult(error, `Khách demo ${index + 1}`)
    if (data) created.push(data)
  }

  return created
}

const createDemoBookings = async (
  tenantId: string,
  hotelId: string,
  userId: string,
  rooms: any[],
  guests: any[],
) => {
  const statuses = ['checked_out', 'checked_in', 'confirmed', 'checked_out', 'cancelled', 'no_show', 'checked_in', 'confirmed']
  const sources = ['direct', 'ota', 'walk_in', 'direct', 'ota', 'direct', 'corporate', 'direct']
  const { data: existing, error: existingError } = await supabase
    .from('room_bookings')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('hotel_id', hotelId)
    .like('booking_reference', `${DEMO_MARKER}-BK-%`)
  assertSeedResult(existingError, 'Booking demo')

  const created = [...(existing ?? [])]
  for (let i = 0; i < 8; i++) {
    const reference = demoCode('BK', i)
    if (existing?.some((booking) => booking.booking_reference === reference)) continue

    const room = rooms[i % rooms.length]
    const guest = guests[i % guests.length]
    const status = statuses[i]
    const checkIn = status === 'confirmed' || status === 'no_show'
      ? addDays(new Date(), i === 2 ? 1 : 3 + i)
      : subDays(new Date(), i + 1)
    const checkOut = status === 'confirmed' || status === 'no_show'
      ? addDays(checkIn, 2)
      : status === 'checked_in'
        ? addDays(new Date(), 2)
        : subDays(new Date(), Math.max(1, i - 1))
    const nights = Math.max(1, differenceInCalendarDays(checkOut, checkIn))
    const roomPrice = Number(room.base_price || 800000)
    const subtotal = roomPrice * nights
    const serviceFee = Math.round(subtotal * 0.05)
    const vat = Math.round((subtotal + serviceFee) * 0.08)
    const total = subtotal + serviceFee + vat
    // Payments are created through the guarded RPC in the next seed step.
    // Keep the booking unpaid here so the RPC can atomically update both rows.
    const { data, error } = await supabase
      .from('room_bookings')
      .insert({
        tenant_id: tenantId,
        hotel_id: hotelId,
        room_id: room.id,
        guest_id: guest.id,
        guest_name: guest.full_name,
        guest_phone: guest.phone,
        guest_email: guest.email,
        guest_count: i % 3 + 1,
        check_in_date: checkIn.toISOString().slice(0, 10),
        check_out_date: checkOut.toISOString().slice(0, 10),
        actual_check_in: ['checked_in', 'checked_out'].includes(status) ? checkIn.toISOString() : null,
        actual_check_out: status === 'checked_out' ? checkOut.toISOString() : null,
        status,
        booking_source: sources[i],
        booking_reference: reference,
        created_by: userId,
        room_price: roomPrice,
        subtotal,
        service_charges: serviceFee,
        service_fee_rate: 5,
        service_fee_amount: serviceFee,
        vat_rate: 8,
        vat_amount: vat,
        total_amount: total,
        amount_paid: 0,
        deposit_amount: status === 'confirmed' ? Math.round(total * 0.2) : 0,
        payment_status: 'pending',
        booking_type: 'daily',
        notes: `${DEMO_MARKER}-BOOKING-${i + 1}`,
      } as any)
      .select()
      .single()
    assertSeedResult(error, `Booking demo ${i + 1}`)
    if (data) created.push(data)
  }

  return created
}

const createDemoBookingPayments = async (
  tenantId: string,
  hotelId: string,
  userId: string,
  bookings: any[],
) => {
  const { data: existing, error: existingError } = await supabase
    .from('booking_payments')
    .select('transaction_reference')
    .eq('tenant_id', tenantId)
    .like('transaction_reference', `${DEMO_MARKER}-PAY-%`)
  assertSeedResult(existingError, 'Thanh toán booking demo')
  const existingRefs = new Set((existing ?? []).map((payment) => payment.transaction_reference))

  for (const [index, booking] of bookings
    .filter((booking) => ['checked_out', 'checked_in'].includes(booking.status))
    .entries()) {
    const reference = demoCode('PAY', index)
    if (existingRefs.has(reference)) continue
    const total = Number(booking.total_amount || 0)
    const deposit = Number(booking.deposit_amount || 0)
    const targetPaid = booking.status === 'checked_out'
      ? Math.max(0, total - deposit)
      : Math.round(total * 0.5)
    let currentPaid = Number(booking.amount_paid || 0)

    // A previous seed attempt may have updated the booking before the direct
    // insert was rejected by table privileges. Reset only that known demo row
    // so rerunning the seed can repair the partial state safely.
    if (currentPaid > 0 && !existingRefs.has(reference)) {
      const { error: repairError } = await supabase
        .from('room_bookings')
        .update({ amount_paid: 0, payment_status: 'pending', paid_at: null })
        .eq('id', booking.id)
        .eq('booking_reference', booking.booking_reference)
      assertSeedResult(repairError, `Khôi phục booking demo ${index + 1}`)
      currentPaid = 0
    }

    const amount = Math.max(0, targetPaid - currentPaid)
    if (amount <= 0) continue

    const paymentMethod = index % 2 === 0 ? 'cash' : 'bank_transfer'
    const { error } = await supabase.rpc('record_booking_payment', {
      p_booking_id: booking.id,
      p_tenant_id: tenantId,
      p_hotel_id: hotelId,
      p_amount: amount,
      p_payment_method: paymentMethod,
      p_transaction_reference: reference,
      p_metadata: { source: DEMO_MARKER, demo: true },
      p_total_amount: total,
    } as any)
    assertSeedResult(error, `Thanh toán booking ${index + 1}`)
  }
}

const createDemoGuestInvoices = async (
  tenantId: string,
  hotelId: string,
  userId: string,
  bookings: any[],
  rooms: any[],
  guests: any[],
) => {
  const { data: existing, error: existingError } = await supabase
    .from('guest_invoices')
    .select('invoice_number')
    .eq('tenant_id', tenantId)
    .like('invoice_number', `${DEMO_MARKER}-INV-%`)
  assertSeedResult(existingError, 'Hóa đơn khách demo')
  const existingNumbers = new Set((existing ?? []).map((invoice) => invoice.invoice_number))

  for (const [index, booking] of bookings.filter((booking) => booking.status === 'checked_out').entries()) {
    const invoiceNumber = demoCode('INV', index)
    if (existingNumbers.has(invoiceNumber)) continue
    const guest = guests.find((item) => item.id === booking.guest_id) || guests[index % guests.length]
    const room = rooms.find((item) => item.id === booking.room_id)
    const subtotal = Number(booking.subtotal || booking.total_amount || 0)
    const vatAmount = Number(booking.vat_amount || 0)
    const serviceFeeAmount = Number(booking.service_fee_amount || booking.service_charges || 0)
    const total = Number(booking.total_amount || subtotal + vatAmount + serviceFeeAmount)
    const { error } = await supabase.from('guest_invoices').insert({
      tenant_id: tenantId,
      hotel_id: hotelId,
      booking_id: booking.id,
      invoice_number: invoiceNumber,
      guest_name: guest.full_name,
      guest_phone: guest.phone,
      guest_email: guest.email,
      room_number: room?.room_number || null,
      check_in_date: booking.check_in_date,
      check_out_date: booking.check_out_date,
      line_items: [{ description: `Phòng ${room?.room_number || ''}`, quantity: 1, unit_price: subtotal, amount: subtotal }],
      subtotal,
      vat_rate: 8,
      vat_amount: vatAmount,
      service_fee_rate: 5,
      service_fee_amount: serviceFeeAmount,
      total_amount: total,
      deposit_amount: Number(booking.deposit_amount || 0),
      amount_paid: Number(booking.amount_paid || total),
      payment_method: 'cash',
      status: 'issued',
      invoice_type: index % 2 === 0 ? 'receipt' : 'vat_request',
      vat_claim_status: index % 2 === 0 ? 'none' : 'pending',
      issued_at: booking.actual_check_out || new Date().toISOString(),
      created_by: userId,
      notes: `${DEMO_MARKER}-INVOICE-${index + 1}`,
    } as any)
    assertSeedResult(error, `Hóa đơn khách ${index + 1}`)
  }
}

const createDemoHousekeepingTasks = async (
  tenantId: string,
  hotelId: string,
  userId: string,
  rooms: any[],
  bookings: any[],
) => {
  const { data: existing, error: existingError } = await supabase
    .from('housekeeping_tasks')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('hotel_id', hotelId)
    .like('notes', `${DEMO_MARKER}-HK-%`)
  assertSeedResult(existingError, 'Công việc buồng phòng demo')
  const created = [...(existing ?? [])]
  const taskStatuses = ['pending', 'in_progress', 'completed_pending_review', 'approved', 'completed', 'rejected_rework']
  const taskTypes = ['cleaning', 'checkout_inspection', 'checkin_prep', 'amenity_request', 'other', 'cleaning']
  const priorities = ['medium', 'high', 'low', 'urgent', 'medium', 'high']

  for (let i = 0; i < 12; i++) {
    const marker = `${DEMO_MARKER}-HK-${i + 1}`
    if (existing?.some((task) => task.notes === marker)) continue
    const room = rooms[i % rooms.length]
    const booking = bookings[i % bookings.length]
    const status = taskStatuses[i % taskStatuses.length]
    const { data, error } = await supabase
      .from('housekeeping_tasks')
      .insert({
        tenant_id: tenantId,
        hotel_id: hotelId,
        room_id: room.id,
        booking_id: booking?.id || null,
        task_type: taskTypes[i % taskTypes.length],
        title: `Demo ${taskTypes[i % taskTypes.length]} phòng ${room.room_number}`,
        description: `Nhiệm vụ mẫu để kiểm thử luồng buồng phòng và QC (${marker})`,
        priority: priorities[i % priorities.length],
        assigned_to: userId,
        requested_by: userId,
        status,
        due_at: addDays(new Date(), (i % 3) - 1).toISOString(),
        started_at: ['in_progress', 'completed_pending_review', 'approved', 'completed', 'rejected_rework'].includes(status)
          ? subDays(new Date(), 1).toISOString()
          : null,
        completed_at: ['approved', 'completed'].includes(status) ? new Date().toISOString() : null,
        qc_required: status !== 'completed',
        qc_status: status === 'approved' ? 'approved' : status === 'completed_pending_review' ? 'pending' : null,
        rework_count: status === 'rejected_rework' ? 1 : 0,
        notes: marker,
      } as any)
      .select()
      .single()
    assertSeedResult(error, `Công việc buồng phòng ${i + 1}`)
    if (data) created.push(data)
  }
  return created
}

const createDemoWarehouses = async (tenantId: string, hotelId: string, items: any[]) => {
  const code = `${DEMO_MARKER}-WH-001`
  const { data: existing, error: existingError } = await supabase
    .from('warehouses')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('hotel_id', hotelId)
    .eq('code', code)
    .maybeSingle()
  assertSeedResult(existingError, 'Kho demo')

  let warehouse = existing
  if (!warehouse) {
    const { data, error } = await supabase.from('warehouses').insert({
      tenant_id: tenantId,
      hotel_id: hotelId,
      code,
      name: 'Kho trung tâm demo',
      location_type: 'warehouse',
      address: 'Tầng 1 - khu hậu cần',
      description: `${DEMO_MARKER} kho phục vụ kiểm thử`,
      is_default: true,
      is_active: true,
      sort_order: 1,
    } as any).select().single()
    assertSeedResult(error, 'Tạo kho demo')
    warehouse = data
  }
  if (!warehouse) return

  const selectedItems = items.slice(0, 12)
  const { data: existingStock, error: existingStockError } = await supabase
    .from('warehouse_stock')
    .select('item_id')
    .eq('warehouse_id', warehouse.id)
  assertSeedResult(existingStockError, 'Tồn kho kho demo')
  const existingItemIds = new Set((existingStock ?? []).map((row) => row.item_id))

  for (const [index, item] of selectedItems.entries()) {
    if (existingItemIds.has(item.id)) continue
    const { error } = await supabase.from('warehouse_stock').insert({
      warehouse_id: warehouse.id,
      item_id: item.id,
      tenant_id: tenantId,
      quantity: 20 + index * 5,
      minimum_stock: item.minimum_stock || 5,
      maximum_stock: (item.minimum_stock || 5) * 5,
    } as any)
    assertSeedResult(error, `Tồn kho kho demo ${index + 1}`)
  }
}

const createDemoSupplementsAndDistribution = async (
  tenantId: string,
  hotelId: string,
  userId: string,
  rooms: any[],
  items: any[],
) => {
  const { data: existing, error: existingError } = await supabase
    .from('supplement_requests')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('hotel_id', hotelId)
    .like('request_code', `${DEMO_MARKER}-SUP-%`)
  assertSeedResult(existingError, 'Yêu cầu bổ sung demo')
  const created = [...(existing ?? [])]
  const requests = []
  for (let i = 0; i < 3; i++) {
    const requestCode = demoCode('SUP', i)
    const existingRequest = existing?.find((request) => request.request_code === requestCode)
    if (existingRequest) {
      requests.push(existingRequest)
      continue
    }
    const item = items[(i + 1) % items.length]
    const room = rooms[(i + 4) % rooms.length]
    const requestItem = {
      item_id: item.id,
      item_name: item.name,
      item_code: item.code,
      quantity: 1,
      unit_price: Number(item.unit_price || 0),
      total_value: Number(item.unit_price || 0),
      item_type: item.item_type || 'equipment',
    }
    const { data, error } = await supabase.from('supplement_requests').insert({
      tenant_id: tenantId,
      hotel_id: hotelId,
      room_id: room.id,
      request_code: requestCode,
      status: i === 0 ? 'pending' : i === 1 ? 'approved' : 'completed',
      request_type: i === 2 ? 'damaged' : 'consumed',
      items: [requestItem],
      total_value: requestItem.total_value,
      requested_by: userId,
      approved_by: i > 0 ? userId : null,
      approved_at: i > 0 ? new Date().toISOString() : null,
      completed_at: i === 2 ? new Date().toISOString() : null,
      notes: `${DEMO_MARKER}-SUPPLEMENT-${i + 1}`,
    } as any).select().single()
    assertSeedResult(error, `Yêu cầu bổ sung ${i + 1}`)
    if (data) {
      created.push(data)
      requests.push(data)
    }
  }

  // Exercise the real distribution RPC for one pending request. It updates
  // the request status and inventory just like the production workflow.
  const pendingRequest = requests.find((request) => request.status === 'pending')
  if (pendingRequest && !pendingRequest.distribution_order_id) {
    const requestItem = (pendingRequest.items as any[])[0]
    const { data: orderResult, error: orderError } = await supabase.rpc('create_distribution_order', {
      p_tenant_id: tenantId,
      p_hotel_id: hotelId,
      p_created_by: userId,
      p_assigned_to: null,
      p_rooms: [{ room_id: pendingRequest.room_id, items: [{ item_id: requestItem.item_id, quantity: requestItem.quantity }] }],
      p_notes: `${DEMO_MARKER} distribution`,
      p_auto_release: false,
      p_supplement_request_ids: [pendingRequest.id],
    } as any)
    assertSeedResult(orderError, 'Phiếu phân phối demo')
    if (orderResult?.order_id) {
      const { error: linkError } = await supabase
        .from('distribution_orders')
        .update({ supplement_request_id: pendingRequest.id })
        .eq('id', orderResult.order_id)
        .eq('tenant_id', tenantId)
      assertSeedResult(linkError, 'Liên kết phiếu phân phối demo')
    }
  }
}

const createDemoChat = async (tenantId: string, hotelId: string, userId: string) => {
  const directKey = `${DEMO_MARKER}-CHAT-001`
  const { data: existingConversation, error: conversationLookupError } = await supabase
    .from('conversations')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('hotel_id', hotelId)
    .eq('direct_key', directKey)
    .maybeSingle()
  assertSeedResult(conversationLookupError, 'Hội thoại demo')

  let conversation = existingConversation
  if (!conversation) {
    const { data, error } = await supabase.from('conversations').insert({
      tenant_id: tenantId,
      hotel_id: hotelId,
      type: 'group',
      name: 'RoomQC Demo Operations',
      created_by: userId,
      direct_key: directKey,
      last_message_at: new Date().toISOString(),
      last_message_preview: `${DEMO_MARKER} cuộc trò chuyện kiểm thử`,
      last_sender_id: userId,
    } as any).select().single()
    assertSeedResult(error, 'Tạo hội thoại demo')
    conversation = data
  }
  if (!conversation) return

  const { data: member, error: memberLookupError } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conversation.id)
    .eq('user_id', userId)
    .maybeSingle()
  assertSeedResult(memberLookupError, 'Thành viên hội thoại demo')
  if (!member) {
    const { error } = await supabase.from('conversation_members').insert({
      conversation_id: conversation.id,
      user_id: userId,
      tenant_id: tenantId,
      role: 'admin',
    } as any)
    assertSeedResult(error, 'Thêm thành viên hội thoại demo')
  }

  const { count, error: messageCountError } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversation.id)
    .like('client_msg_id', `${DEMO_MARKER}-MSG-%`)
  assertSeedResult(messageCountError, 'Tin nhắn hội thoại demo')
  if ((count ?? 0) > 0) return

  for (let i = 0; i < 3; i++) {
    const { error } = await supabase.from('messages').insert({
      tenant_id: tenantId,
      conversation_id: conversation.id,
      sender_id: userId,
      body: `${DEMO_MARKER}: tin nhắn kiểm thử ${i + 1}`,
      client_msg_id: demoCode('MSG', i),
      mentioned_user_ids: [],
    } as any)
    assertSeedResult(error, `Tin nhắn hội thoại ${i + 1}`)
  }
}
