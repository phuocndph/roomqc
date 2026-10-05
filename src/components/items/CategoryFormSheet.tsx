import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Shirt, Sparkles, Tv, Sofa, Droplets, Package } from 'lucide-react'
import type { CategoryWithStats, CategoryFormData } from '@/types/items.types'

interface CategoryFormSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: CategoryWithStats | null
  onSubmit: (data: CategoryFormData) => void
  isSubmitting?: boolean
}

const ICONS = [
  { icon: 'shirt', label: 'shirt', Component: Shirt },
  { icon: 'sparkles', label: 'cleaning', Component: Sparkles },
  { icon: 'tv', label: 'electronics', Component: Tv },
  { icon: 'sofa', label: 'furniture', Component: Sofa },
  { icon: 'spray', label: 'hygiene', Component: Droplets },
  { icon: 'package', label: 'other', Component: Package },
]

export function CategoryFormSheet({
  open,
  onOpenChange,
  category,
  onSubmit,
  isSubmitting = false,
}: CategoryFormSheetProps) {
  const { t } = useTranslation(['items', 'common'])
  
  const COLORS = [
    { value: '#3B82F6', label: t('items:colors.blue') },
    { value: '#10B981', label: t('items:colors.green') },
    { value: '#F59E0B', label: t('items:colors.orange') },
    { value: '#EF4444', label: t('items:colors.red') },
    { value: '#8B5CF6', label: t('items:colors.purple') },
    { value: '#EC4899', label: t('items:colors.pink') },
    { value: '#6B7280', label: t('items:colors.gray') },
  ]

  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    name_en: '',
    description: '',
    icon: 'package',
    color: '#3B82F6',
    sort_order: 0,
  })
  
  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        name_en: category.name_en || '',
        description: category.description || '',
        icon: category.icon || 'package',
        color: category.color || '#3B82F6',
        sort_order: category.sort_order || 0,
      })
    } else {
      setFormData({
        name: '',
        name_en: '',
        description: '',
        icon: 'package',
        color: '#3B82F6',
        sort_order: 0,
      })
    }
  }, [category, open])
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(formData)
  }
  
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[85vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {category ? t('items:categories.editCategory') : t('items:categories.addCategory')}
          </SheetTitle>
        </SheetHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6 mt-6">
          {/* Name */}
          <div>
            <Label htmlFor="name" className="text-base">{t('items:categories.fields.name')} *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder={t('items:categories.form.namePlaceholder')}
              required
              className="h-12 mt-2 text-base"
            />
          </div>
          
          {/* English Name */}
          <div>
            <Label htmlFor="name_en" className="text-base">{t('items:categories.fields.nameEn')}</Label>
            <Input
              id="name_en"
              value={formData.name_en}
              onChange={(e) => setFormData(prev => ({ ...prev, name_en: e.target.value }))}
              placeholder={t('items:categories.form.nameEnPlaceholder')}
              className="h-12 mt-2 text-base"
            />
          </div>
          
          {/* Description */}
          <div>
            <Label htmlFor="description" className="text-base">{t('items:categories.fields.description')}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder={t('items:categories.form.descriptionPlaceholder')}
              rows={3}
              className="mt-2 text-base"
            />
          </div>
          
          {/* Icon */}
          <div>
            <Label className="text-base">{t('items:categories.fields.icon')}</Label>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {ICONS.map(({ icon, label, Component }) => (
                <button
                  key={icon}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, icon }))}
                  className={`
                    flex flex-col items-center justify-center gap-2 p-4 rounded-lg border-2 transition-all
                    ${formData.icon === icon 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                    }
                  `}
                >
                  <Component className="h-6 w-6" />
                  <span className="text-xs">{t(`items:categories.icons.${label}`)}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Color */}
          <div>
            <Label className="text-base">{t('items:categories.fields.color')}</Label>
            <div className="grid grid-cols-4 gap-2 mt-2">
              {COLORS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, color: value }))}
                  className={`
                    flex items-center gap-2 p-3 rounded-lg border-2 transition-all
                    ${formData.color === value 
                      ? 'border-primary ring-2 ring-primary/20' 
                      : 'border-border hover:border-primary/50'
                    }
                  `}
                >
                  <div
                    className="h-6 w-6 rounded-full shrink-0"
                    style={{ backgroundColor: value }}
                  />
                  <span className="text-xs truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>
          
          {/* Sort Order */}
          <div>
            <Label htmlFor="sort_order" className="text-base">{t('items:categories.fields.sortOrder')}</Label>
            <Input
              id="sort_order"
              type="number" min={0}
              value={formData.sort_order}
              onChange={(e) => setFormData(prev => ({ 
                ...prev, 
                sort_order: parseInt(e.target.value) || 0 
              }))}
              className="h-12 mt-2 text-base"
            />
          </div>
          
          {/* Actions */}
          <div className="flex gap-3 pt-4 sticky bottom-0 bg-background pb-safe">
            <Button
              type="button"
              variant="outline"
              className="flex-1 h-12"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              {t('common:cancel')}
            </Button>
            <Button
              type="submit"
              className="flex-1 h-12"
              disabled={isSubmitting || !formData.name}
            >
              {isSubmitting ? t('common:saving') : category ? t('common:update') : t('common:addNew')}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
