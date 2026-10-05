import { useState, useMemo } from 'react';
import { Plus, Pencil, Trash2, Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/super-admin/shared/PageHeader';
import {
  ANNOUNCEMENT_KIND_LABEL,
  ANNOUNCEMENT_PLACEMENT_LABEL,
  ANNOUNCEMENT_AUDIENCE_LABEL,
  type Announcement,
  type AnnouncementKind,
} from '@/types/announcement.types';
import {
  useAnnouncementsAdmin,
  useDeleteAnnouncement,
} from '@/hooks/announcements/useAnnouncementsAdmin';
import { AnnouncementFormDialog } from './AnnouncementFormDialog';
import { useEnsureVersionDraft } from '@/hooks/announcements/useEnsureVersionDraft';

const KIND_TABS: Array<{ value: AnnouncementKind | 'all'; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'promo_popup', label: 'Popup chương trình' },
  { value: 'version_update', label: 'Cập nhật phiên bản' },
  { value: 'ad_banner', label: 'Banner quảng cáo' },
  { value: 'system_notice', label: 'Thông báo hệ thống' },
];

function statusBadge(a: Announcement) {
  const now = new Date();
  if (!a.is_active)
    return <span className="text-muted-foreground text-xs">Đã tắt</span>;
  if (a.ends_at && new Date(a.ends_at) < now)
    return <span className="text-muted-foreground text-xs">Hết hạn</span>;
  if (a.starts_at && new Date(a.starts_at) > now)
    return <span className="text-amber-600 text-xs">Chờ chạy</span>;
  return <span className="text-green-600 text-xs font-medium">Đang hiển thị</span>;
}

export function AnnouncementsManagement() {
  const { data = [], isLoading } = useAnnouncementsAdmin();
  const del = useDeleteAnnouncement();
  const { draft: versionDraft, appVersion } = useEnsureVersionDraft();
  const [activeTab, setActiveTab] = useState<AnnouncementKind | 'all'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Announcement | null>(null);

  const filtered = useMemo(
    () => (activeTab === 'all' ? data : data.filter((a) => a.kind === activeTab)),
    [data, activeTab],
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Thông báo & Banner"
        description="Quản lý popup chương trình, thông báo phiên bản và banner quảng cáo hiển thị trong app."
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            Tạo thông báo
          </Button>
        }
      />

      {/* Banner phiên bản hiện tại */}
      <div className="border rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap bg-muted/30">
        <div className="space-y-0.5">
          <div className="text-xs text-muted-foreground">Phiên bản hệ thống hiện tại</div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium">v{appVersion}</span>
            {versionDraft ? (
              versionDraft.is_active ? (
                <span className="text-xs font-medium text-green-600">Đang phát thông báo</span>
              ) : (
                <span className="text-xs font-medium text-amber-600">Đang chờ bật</span>
              )
            ) : (
              <span className="text-xs text-muted-foreground">Đang chuẩn bị draft...</span>
            )}
          </div>
        </div>
        {versionDraft && (
          <Button
            size="sm"
            variant={versionDraft.is_active ? 'outline' : 'default'}
            onClick={() => {
              setEditing(versionDraft);
              setFormOpen(true);
            }}
          >
            {versionDraft.is_active ? 'Chỉnh sửa' : 'Chỉnh sửa & bật'}
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AnnouncementKind | 'all')}>
        <TabsList className="flex-wrap h-auto">
          {KIND_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="text-xs">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="border rounded-lg">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tiêu đề</TableHead>
                <TableHead className="hidden md:table-cell">Loại</TableHead>
                <TableHead className="hidden md:table-cell">Vị trí</TableHead>
                <TableHead className="hidden lg:table-cell">Đối tượng</TableHead>
                <TableHead className="hidden sm:table-cell">Trạng thái</TableHead>
                <TableHead className="hidden lg:table-cell">Ưu tiên</TableHead>
                <TableHead className="text-right">Hành động</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-sm">
                    Đang tải...
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-sm">
                    <Megaphone className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    Chưa có thông báo nào. Nhấn "Tạo thông báo" để thêm mới.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium text-sm">{a.title}</div>
                      {a.body && (
                        <div className="text-xs text-muted-foreground line-clamp-1">{a.body}</div>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs">
                      <Badge variant="secondary">{ANNOUNCEMENT_KIND_LABEL[a.kind]}</Badge>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                      {ANNOUNCEMENT_PLACEMENT_LABEL[a.placement]}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                      {ANNOUNCEMENT_AUDIENCE_LABEL[a.audience]}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">{statusBadge(a)}</TableCell>
                    <TableCell className="hidden lg:table-cell text-xs">{a.priority}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setEditing(a);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-red-600 hover:text-red-700"
                        onClick={() => setConfirmDelete(a)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AnnouncementFormDialog open={formOpen} onOpenChange={setFormOpen} editing={editing} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xoá thông báo?</AlertDialogTitle>
            <AlertDialogDescription>
              Thông báo "{confirmDelete?.title}" sẽ bị xoá vĩnh viễn. Hành động này không thể hoàn
              tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (confirmDelete) del.mutate(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Xoá
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
