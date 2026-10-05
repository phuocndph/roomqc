import { useState } from 'react'
import { Users, Activity, ClipboardList, Clock } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { StaffStatsCards } from '@/components/staff/StaffStatsCards'
import { StaffList } from '@/components/staff/StaffList'
import { StaffDetailSheet } from '@/components/staff/StaffDetailSheet'
import { StaffActivityTimeline } from '@/components/staff/StaffActivityTimeline'
import { ManagerTasksTab } from '@/components/staff/ManagerTasksTab'
import { ShiftHistoryTab } from '@/components/staff/ShiftHistoryTab'
import { useStaffStatus, useStaffStatusStats, type StaffWithStatus } from '@/hooks/useStaffStatus'
import { useRecentStaffActivities } from '@/hooks/useStaffActivity'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useUser } from '@/hooks/useUser'
import { canCreateHousekeepingTask } from '@/lib/userAccess'
import type { PresenceFilterKey } from '@/components/staff/StaffStatsCards'

export default function StaffManagementPage() {
  const [selectedStatus, setSelectedStatus] = useState<PresenceFilterKey | null>(null)
  const [selectedStaff, setSelectedStaff] = useState<StaffWithStatus | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)

  const { user } = useUser()
  const { data: staffList, isLoading } = useStaffStatus()
  const { data: recentActivities, isLoading: loadingActivities } = useRecentStaffActivities(50)
  const stats = useStaffStatusStats(staffList)

  // Check if user is manager or admin
  const canManageTasks = user ? canCreateHousekeepingTask(user) : false

  const handleViewDetail = (staff: StaffWithStatus) => {
    setSelectedStaff(staff)
    setDetailOpen(true)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Quản lý Nhân sự</h1>
        </div>
        <span className="text-sm text-muted-foreground">
          {stats.total} nhân viên
        </span>
      </div>

      {/* Stats */}
      <div className="p-4 border-b">
        <StaffStatsCards 
          stats={stats} 
          selectedStatus={selectedStatus}
          onStatusClick={(status) => setSelectedStatus(status)}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="list" className="flex-1 flex flex-col min-h-0">
        <TabsList className="mx-4 mt-2 w-fit">
          <TabsTrigger value="list" className="gap-1.5 data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-b-none">
            <Users className="h-4 w-4" />
            Danh sách
          </TabsTrigger>
          <TabsTrigger value="activity" className="gap-1.5 data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-b-none">
            <Activity className="h-4 w-4" />
            Hoạt động
          </TabsTrigger>
          {canManageTasks && (
            <TabsTrigger value="tasks" className="gap-1.5 data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-b-none">
              <ClipboardList className="h-4 w-4" />
              Công việc
            </TabsTrigger>
          )}
          {canManageTasks && (
            <TabsTrigger value="shifts" className="gap-1.5 data-[state=active]:text-primary data-[state=active]:font-semibold data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:rounded-b-none">
              <Clock className="h-4 w-4" />
              Ca làm việc
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="list" className="flex-1 m-0 mt-2 min-h-0">
          <div className="h-full border-t">
            <StaffList 
              staff={staffList}
              isLoading={isLoading}
              filterStatus={selectedStatus}
              onViewDetail={handleViewDetail}
            />
          </div>
        </TabsContent>

        <TabsContent value="activity" className="flex-1 m-0 mt-2 min-h-0">
          <div className="h-full border-t">
            <ScrollArea className="h-full">
              <div className="p-4">
                <h3 className="text-sm font-medium mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Hoạt động gần đây
                </h3>
                {loadingActivities ? (
                  <div className="text-sm text-muted-foreground">Đang tải...</div>
                ) : (
                  <StaffActivityTimeline 
                    activities={recentActivities?.all || []} 
                    showUserName 
                  />
                )}
              </div>
            </ScrollArea>
          </div>
        </TabsContent>

        {canManageTasks && (
          <TabsContent value="tasks" className="flex-1 m-0 mt-2 min-h-0">
            <div className="h-full border-t">
              <ManagerTasksTab />
            </div>
          </TabsContent>
        )}

        {canManageTasks && (
          <TabsContent value="shifts" className="flex-1 m-0 mt-2 min-h-0">
            <div className="h-full border-t">
              <ShiftHistoryTab />
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Detail Sheet */}
      <StaffDetailSheet 
        staff={selectedStaff}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  )
}
