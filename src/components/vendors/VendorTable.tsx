import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Vendor } from '@/types/vendor.types';
import { PermissionGate } from '@/components/auth/PermissionGate'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Star, Eye, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useUpdateVendor, useDeleteVendor } from '@/hooks/useVendors'

interface VendorTableProps {
  vendors: Vendor[];
  selectedVendors: string[];
  onSelectionChange: (ids: string[]) => void;
}

export function VendorTable({ vendors, selectedVendors, onSelectionChange }: VendorTableProps) {
  const { t } = useTranslation(['vendors', 'common'])
  const navigate = useNavigate();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showStatusDialog, setShowStatusDialog] = useState(false)
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null)
  const updateVendor = useUpdateVendor()
  const deleteVendor = useDeleteVendor()

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(vendors.map(v => v.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedVendors, id]);
    } else {
      onSelectionChange(selectedVendors.filter(v => v !== id));
    }
  };
  
  const handleToggleStatus = (vendor: Vendor) => {
    setSelectedVendor(vendor)
    setShowStatusDialog(true)
  }
  
  const confirmStatusToggle = () => {
    if (!selectedVendor) return
    
    const newStatus = selectedVendor.status === 'active' ? 'inactive' : 'active'
    updateVendor.mutate(
      { id: selectedVendor.id, status: newStatus },
      {
        onSuccess: () => {
          setShowStatusDialog(false)
          setSelectedVendor(null)
        }
      }
    )
  }
  
  const handleDelete = (vendor: Vendor) => {
    setSelectedVendor(vendor)
    setShowDeleteDialog(true)
  }
  
  const confirmDelete = () => {
    if (!selectedVendor) return
    
    deleteVendor.mutate(selectedVendor.id, {
      onSuccess: () => {
        setShowDeleteDialog(false)
        setSelectedVendor(null)
      }
    })
  }

  const getCategoryLabel = (category: string) => {
    return t(`category.${category}`, { defaultValue: category })
  }

  const getStatusLabel = (status: string) => {
    return t(`status.${status}`, { defaultValue: status })
  }

  return (
    <>
      <div className="rounded-md border">
        <div className="overflow-x-auto">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">
                <Checkbox
                  checked={selectedVendors.length === vendors.length}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead>{t('table.vendor')}</TableHead>
              <TableHead>{t('table.type')}</TableHead>
              <TableHead>{t('table.contact')}</TableHead>
              <TableHead className="text-center">{t('table.rating')}</TableHead>
              <TableHead className="text-right">{t('table.orders')}</TableHead>
              <TableHead className="text-right">{t('table.totalValue')}</TableHead>
              <TableHead className="text-center">{t('table.onTime')}</TableHead>
              <TableHead className="text-center">{t('table.status')}</TableHead>
              <TableHead className="text-right">{t('table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {vendors.map((vendor) => (
              <TableRow key={vendor.id}>
                <TableCell>
                  <Checkbox
                    checked={selectedVendors.includes(vendor.id)}
                    onCheckedChange={(checked) => handleSelectOne(vendor.id, checked as boolean)}
                  />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={vendor.logo_url} />
                      <AvatarFallback>
                        {vendor.name.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="font-medium">{vendor.name}</div>
                      <div className="text-xs text-muted-foreground">{vendor.code}</div>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={
                    vendor.category === 'supplier' ? 'default' :
                    vendor.category === 'service_provider' ? 'secondary' : 'outline'
                  }>
                    {getCategoryLabel(vendor.category)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="text-sm">
                    <div>{vendor.contact_person}</div>
                    <div className="text-muted-foreground">{vendor.phone}</div>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                    <span className="font-medium">{vendor.rating.toFixed(1)}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right font-medium">
                  {vendor.total_orders}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(vendor.total_value)}
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={
                    vendor.on_time_delivery_rate >= 95 ? 'default' :
                    vendor.on_time_delivery_rate >= 90 ? 'secondary' : 'destructive'
                  }>
                    {vendor.on_time_delivery_rate}%
                  </Badge>
                </TableCell>
                <TableCell className="text-center">
                  <Badge variant={
                    vendor.status === 'active' ? 'default' :
                    vendor.status === 'inactive' ? 'secondary' : 'destructive'
                  }>
                    {getStatusLabel(vendor.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => navigate(`/vendors/${vendor.id}`)}>
                        <Eye className="mr-2 w-4 h-4" />
                        {t('actions.viewDetail')}
                      </DropdownMenuItem>
                      <PermissionGate module="vendors" action="update">
                        <DropdownMenuItem onClick={() => navigate(`/vendors/${vendor.id}/edit`)}>
                          <Edit className="mr-2 w-4 h-4" />
                          {t('actions.edit')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggleStatus(vendor)}>
                          {vendor.status === 'active' ? t('actions.deactivate') : t('actions.activate')}
                        </DropdownMenuItem>
                      </PermissionGate>
                      <PermissionGate module="vendors" action="delete">
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          onClick={() => handleDelete(vendor)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 w-4 h-4" />
                          {t('actions.delete')}
                        </DropdownMenuItem>
                      </PermissionGate>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
    </div>
    <AlertDialog open={showStatusDialog} onOpenChange={setShowStatusDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('dialogs.statusTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('dialogs.statusDescription', { 
              action: selectedVendor?.status === 'active' ? t('actions.deactivate').toLowerCase() : t('actions.activate').toLowerCase(),
              name: selectedVendor?.name 
            })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('dialogs.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmStatusToggle}
            disabled={updateVendor.isPending}
          >
            {updateVendor.isPending ? t('dialogs.processing') : t('dialogs.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    
    <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('dialogs.deleteTitle')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('dialogs.deleteDescription', { name: selectedVendor?.name })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('dialogs.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={confirmDelete}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={deleteVendor.isPending}
          >
            {deleteVendor.isPending ? t('dialogs.deleting') : t('dialogs.confirm')}
          </AlertDialogAction>
        </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}