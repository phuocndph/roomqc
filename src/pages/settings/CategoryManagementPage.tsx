import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Package, Building2, Wrench, Ruler, Shirt, Settings2 } from 'lucide-react'
import { ItemCategoriesList } from '@/components/settings/categories/ItemCategoriesList'
import { RoomTypesList } from '@/components/settings/categories/RoomTypesList'
import { MaintenanceCategoriesList } from '@/components/settings/categories/MaintenanceCategoriesList'
import { ItemUnitsList } from '@/components/settings/categories/ItemUnitsList'
import { LaundryCategoriesList } from '@/components/settings/categories/LaundryCategoriesList'
import { ItemClassificationTool } from '@/components/settings/categories/ItemClassificationTool'

export default function CategoryManagementPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const allowedTabs = ['items', 'rooms', 'maintenance', 'units', 'laundry', 'classification']
  const requestedTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(
    requestedTab && allowedTabs.includes(requestedTab) ? requestedTab : 'items',
  )

  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    const next = new URLSearchParams(searchParams)
    next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Quản lý danh mục</h2>
        <p className="text-muted-foreground">
          Quản lý danh mục cho tài sản, loại phòng, bảo trì và các phân loại khác
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="items" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">Danh mục tài sản</span>
          </TabsTrigger>
          <TabsTrigger value="rooms" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Loại phòng</span>
          </TabsTrigger>
          <TabsTrigger value="maintenance" className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            <span className="hidden sm:inline">Bảo trì</span>
          </TabsTrigger>
          <TabsTrigger value="units" className="flex items-center gap-2">
            <Ruler className="h-4 w-4" />
            <span className="hidden sm:inline">Đơn vị tính</span>
          </TabsTrigger>
          <TabsTrigger value="laundry" className="flex items-center gap-2">
            <Shirt className="h-4 w-4" />
            <span className="hidden sm:inline">Giặt là</span>
          </TabsTrigger>
          <TabsTrigger value="classification" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Phân loại</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-6">
          <ItemCategoriesList />
        </TabsContent>

        <TabsContent value="rooms" className="mt-6">
          <RoomTypesList />
        </TabsContent>

        <TabsContent value="maintenance" className="mt-6">
          <MaintenanceCategoriesList />
        </TabsContent>

        <TabsContent value="units" className="mt-6">
          <ItemUnitsList />
        </TabsContent>

        <TabsContent value="laundry" className="mt-6">
          <LaundryCategoriesList />
        </TabsContent>

        <TabsContent value="classification" className="mt-6">
          <ItemClassificationTool />
        </TabsContent>
      </Tabs>
    </div>
  )
}
