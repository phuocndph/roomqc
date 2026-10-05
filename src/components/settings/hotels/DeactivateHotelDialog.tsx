import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { Hotel, useDeactivateHotel } from '@/hooks/useHotels'

interface DeactivateHotelDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hotel: Hotel | null
}

export function DeactivateHotelDialog({ open, onOpenChange, hotel }: DeactivateHotelDialogProps) {
  const [reason, setReason] = useState('')
  const deactivateHotel = useDeactivateHotel()

  const handleDeactivate = async () => {
    if (!hotel || !reason.trim()) return

    await deactivateHotel.mutateAsync({
      id: hotel.id,
      reason: reason.trim(),
      effectiveDate: new Date().toISOString(),
    })

    setReason('')
    onOpenChange(false)
  }

  const handleClose = () => {
    setReason('')
    onOpenChange(false)
  }

  if (!hotel) return null

  const impact = {
    staff: hotel._count?.users || 0,
    rooms: hotel._count?.rooms || 0,
    items: hotel._count?.items || 0,
    batches: hotel._count?.laundry_batches || 0,
    maintenance: hotel._count?.maintenance_requests || 0,
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Deactivate Hotel</DialogTitle>
          <DialogDescription>
            You are about to deactivate <strong>{hotel.name}</strong>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Warning:</strong> Deactivating this hotel will have the following impact:
              <ul className="mt-2 space-y-1 list-disc list-inside">
                {impact.staff > 0 && (
                  <li>{impact.staff} staff members will need reassignment</li>
                )}
                {impact.rooms > 0 && (
                  <li>{impact.rooms} rooms will become unavailable</li>
                )}
                {impact.items > 0 && (
                  <li>{impact.items} items in inventory</li>
                )}
                {impact.batches > 0 && (
                  <li>{impact.batches} active laundry batches</li>
                )}
                {impact.maintenance > 0 && (
                  <li>{impact.maintenance} pending maintenance requests</li>
                )}
              </ul>
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="reason">
              Reason for deactivation <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              placeholder="Please provide a reason for deactivating this hotel..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-sm text-muted-foreground">
              This information will be recorded for audit purposes.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDeactivate}
            disabled={!reason.trim() || deactivateHotel.isPending}
          >
            {deactivateHotel.isPending ? 'Deactivating...' : 'Deactivate Hotel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
