import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { 
  MapPin, 
  Phone, 
  Mail, 
  Globe, 
  User, 
  Calendar,
  Bed,
  Users,
  Package,
  Wrench,
  Shirt
} from 'lucide-react'
import { Hotel } from '@/hooks/useHotels'
import { format } from 'date-fns'

interface HotelDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hotel: Hotel | null
  onEdit: (hotel: Hotel) => void
}

export function HotelDetailDialog({ open, onOpenChange, hotel, onEdit }: HotelDetailDialogProps) {
  if (!hotel) return null

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-500/10 text-green-600 border-green-500/20'
      case 'inactive':
        return 'bg-red-500/10 text-red-600 border-red-500/20'
      case 'maintenance':
        return 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
      default:
        return 'bg-muted text-muted-foreground'
    }
  }

  const getTypeLabel = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-2xl">{hotel.name}</DialogTitle>
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline">{hotel.code}</Badge>
                <Badge variant="outline">{getTypeLabel(hotel.type)}</Badge>
                <Badge className={getStatusColor(hotel.status)}>
                  {hotel.status.toUpperCase()}
                </Badge>
              </div>
            </div>
            <Button onClick={() => onEdit(hotel)}>Edit</Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" className="flex-1 overflow-hidden flex flex-col">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-y-auto">
            <TabsContent value="overview" className="space-y-6 mt-4">
              {/* Location */}
              <div>
                <h3 className="font-semibold mb-3">Location</h3>
                <div className="space-y-2 text-sm">
                  {hotel.address && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                      <span>
                        {hotel.address}
                        {hotel.city && `, ${hotel.city}`}
                        {hotel.state && `, ${hotel.state}`}
                        {hotel.country && `, ${hotel.country}`}
                        {hotel.postal_code && ` ${hotel.postal_code}`}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Contact */}
              <div>
                <h3 className="font-semibold mb-3">Contact Information</h3>
                <div className="space-y-2 text-sm">
                  {hotel.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <span>{hotel.phone}</span>
                    </div>
                  )}
                  {hotel.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <span>{hotel.email}</span>
                    </div>
                  )}
                  {hotel.website && (
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-muted-foreground" />
                      <a 
                        href={hotel.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {hotel.website}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              {/* Manager */}
              {(hotel.manager_name || hotel.manager_email) && (
                <>
                  <div>
                    <h3 className="font-semibold mb-3">Manager</h3>
                    <div className="space-y-2 text-sm">
                      {hotel.manager_name && (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span>{hotel.manager_name}</span>
                        </div>
                      )}
                      {hotel.manager_email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span>{hotel.manager_email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <Separator />
                </>
              )}

              {/* Capacity */}
              <div>
                <h3 className="font-semibold mb-3">Capacity</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Total Rooms:</span>
                    <span className="ml-2 font-medium">{hotel.total_rooms}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Total Floors:</span>
                    <span className="ml-2 font-medium">{hotel.total_floors}</span>
                  </div>
                </div>
              </div>

              {hotel.description && (
                <>
                  <Separator />
                  <div>
                    <h3 className="font-semibold mb-3">Description</h3>
                    <p className="text-sm text-muted-foreground">{hotel.description}</p>
                  </div>
                </>
              )}

              <Separator />

              {/* Metadata */}
              <div>
                <h3 className="font-semibold mb-3">Information</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Created:</span>
                    <span>{format(new Date(hotel.created_at), 'PPP')}</span>
                  </div>
                  {hotel.inactive_at && (
                    <>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">Deactivated:</span>
                        <span>{format(new Date(hotel.inactive_at), 'PPP')}</span>
                      </div>
                      {hotel.inactive_reason && (
                        <div className="pl-6">
                          <span className="text-muted-foreground">Reason:</span>
                          <span className="ml-2">{hotel.inactive_reason}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="stats" className="space-y-6 mt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Users className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Staff Members</p>
                      <p className="text-2xl font-bold">{hotel._count?.users || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <Bed className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Rooms</p>
                      <p className="text-2xl font-bold">{hotel._count?.rooms || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-orange-500/10">
                      <Package className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Inventory Items</p>
                      <p className="text-2xl font-bold">{hotel._count?.items || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Shirt className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Laundry Batches</p>
                      <p className="text-2xl font-bold">{hotel._count?.laundry_batches || 0}</p>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-red-500/10">
                      <Wrench className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Maintenance Requests</p>
                      <p className="text-2xl font-bold">{hotel._count?.maintenance_requests || 0}</p>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
