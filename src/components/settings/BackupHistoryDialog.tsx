import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useBackupLogs, BackupLog } from '@/hooks/useBackupLogs'
import { formatDistanceToNow } from 'date-fns'
import { CheckCircle, XCircle, Clock, Download, FileArchive, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'

interface BackupHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function BackupHistoryDialog({ open, onOpenChange }: BackupHistoryDialogProps) {
  const { data: backups, isLoading } = useBackupLogs()
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const handleDownload = async (backup: BackupLog) => {
    if (!backup.file_path) return
    setDownloadingId(backup.id)
    try {
      const { data, error } = await supabase.storage
        .from('backups')
        .createSignedUrl(backup.file_path, 60)
      if (error) throw error
      window.open(data.signedUrl, '_blank')
    } catch (err: any) {
      toast.error('Không thể tải file: ' + err.message)
    } finally {
      setDownloadingId(null)
    }
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'N/A'
    const mb = bytes / (1024 * 1024)
    return `${mb.toFixed(2)} MB`
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return 'N/A'
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Backup History</DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[600px] pr-4">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-lg border p-4 space-y-2">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          ) : backups && backups.length > 0 ? (
            <div className="space-y-4">
              {backups.map((backup) => (
                <div
                  key={backup.id}
                  className="rounded-lg border p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1">
                        {backup.status === 'completed' && (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        )}
                        {backup.status === 'failed' && (
                          <XCircle className="h-5 w-5 text-destructive" />
                        )}
                        {backup.status === 'in_progress' && (
                          <Clock className="h-5 w-5 text-orange-500 animate-pulse" />
                        )}
                      </div>

                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={backup.backup_type === 'automatic' ? 'default' : 'secondary'}>
                            {backup.backup_type === 'automatic' ? 'Automatic' : 'Manual'}
                          </Badge>
                          <Badge variant="outline">
                            {backup.status}
                          </Badge>
                        </div>

                        <div className="text-sm font-medium">
                          {new Date(backup.created_at).toLocaleString('vi-VN', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>

                        <div className="text-sm text-muted-foreground">
                          {formatDistanceToNow(new Date(backup.created_at), { addSuffix: true })}
                        </div>

                        {backup.backup_scope && backup.backup_scope.length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                            <FileArchive className="h-3 w-3" />
                            {backup.backup_scope.join(', ')}
                          </div>
                        )}

                        {backup.status === 'completed' && (
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span>Size: {formatFileSize(backup.file_size_bytes)}</span>
                            <span>Duration: {formatDuration(backup.duration_seconds)}</span>
                          </div>
                        )}

                        {backup.error_message && (
                          <div className="text-sm text-destructive bg-destructive/10 rounded p-2">
                            {backup.error_message}
                          </div>
                        )}
                      </div>
                    </div>

                    {backup.status === 'completed' && backup.file_path && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDownload(backup)}
                        disabled={downloadingId === backup.id}
                      >
                        {downloadingId === backup.id
                          ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          : <Download className="h-4 w-4 mr-2" />}
                        {downloadingId === backup.id ? 'Đang tải...' : 'Download'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileArchive className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No backup history found</p>
              <p className="text-sm">Backups will appear here once created</p>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
