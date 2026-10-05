import React, { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useVendor, useCreateVendor, useUpdateVendor } from '@/hooks/useVendors';
import { useUser } from '@/hooks/useUser';
import { Button } from '@/components/ui/button';
import { navigateBack } from '@/lib/navigation';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  Building, 
  Phone, 
  Mail, 
  MapPin, 
  CreditCard, 
  FileText,
  X,
  Plus
} from 'lucide-react';
import { toast } from 'sonner';

type VendorFormData = {
  name: string;
  category: 'supplier' | 'service_provider' | 'contractor';
  products_services: string[];
  address: string;
  phone: string;
  email?: string;
  contact_person: string;
  payment_terms: string;
  notes?: string;
  status: 'active' | 'inactive' | 'suspended';
};

const VendorFormPage: React.FC = () => {
  const { t } = useTranslation('vendors');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;
  const { user: currentUser } = useUser();

  const { data: vendor } = useVendor(id || '');
  const createVendor = useCreateVendor();
  const updateVendor = useUpdateVendor();

  const productServiceOptions = useMemo(() => [
    { key: 'fabric', label: t('form.productOptions.fabric') },
    { key: 'electrical', label: t('form.productOptions.electrical') },
    { key: 'amenities', label: t('form.productOptions.amenities') },
    { key: 'laundry', label: t('form.productOptions.laundry') },
    { key: 'maintenance', label: t('form.productOptions.maintenance') },
  ], [t]);

  const vendorSchema = useMemo(() => z.object({
    name: z.string().min(3, t('validation.nameMin')),
    category: z.enum(['supplier', 'service_provider', 'contractor']),
    products_services: z.array(z.string()).min(1, t('validation.productsMin')),
    address: z.string().min(10, t('validation.addressMin')),
    phone: z.string().regex(/^[\d\s+\-()]+$/, t('validation.phoneInvalid')),
    email: z.string().email(t('validation.emailInvalid')).optional().or(z.literal('')),
    contact_person: z.string().min(3, t('validation.contactMin')),
    payment_terms: z.string(),
    notes: z.string().optional(),
    status: z.enum(['active', 'inactive', 'suspended']).default('active')
  }), [t]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors }
  } = useForm<VendorFormData>({
    resolver: zodResolver(vendorSchema),
    defaultValues: vendor || {
      category: 'supplier',
      products_services: [],
      status: 'active',
      payment_terms: '30_days'
    }
  });

  const selectedCategory = watch('category');
  const productsServices = watch('products_services') || [];

  const onSubmit = async (data: VendorFormData) => {
    if (!currentUser?.tenant_id || !currentUser?.id) {
      toast.error(t('validation.userNotFound'));
      return;
    }

    try {
      const vendorData = {
        name: data.name,
        category: data.category,
        products_services: data.products_services,
        address: data.address,
        phone: data.phone,
        email: data.email || '',
        contact_person: data.contact_person,
        payment_terms: data.payment_terms,
        notes: data.notes || '',
        rating: 0,
        total_orders: 0,
        total_value: 0,
        on_time_delivery_rate: 100,
        documents: [],
        status: data.status,
        tenant_id: currentUser.tenant_id,
        created_by: currentUser.id
      };

      if (isEdit && id) {
        await updateVendor.mutateAsync({ id, ...vendorData });
        toast.success(t('messages.updateSuccess'));
        navigate(`/vendors/${id}`);
      } else {
        const result = await createVendor.mutateAsync(vendorData);
        toast.success(t('messages.createSuccess'));
        navigate(`/vendors/${result.id}`);
      }
    } catch (error) {
      toast.error(t('validation.errorOccurred'));
    }
  };

  const toggleProductService = (service: string) => {
    const current = productsServices;
    if (current.includes(service)) {
      setValue('products_services', current.filter(s => s !== service));
    } else {
      setValue('products_services', [...current, service]);
    }
  };

  return (
    <div className="p-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 max-w-4xl mx-auto">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">
            {isEdit ? t('form.editTitle') : t('form.addTitle')}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isEdit ? t('form.editDescription') : t('form.addDescription')}
          </p>
        </div>

        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="w-5 h-5" />
              {t('form.basicInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">{t('form.companyName')} <span className="text-red-500">{t('form.required')}</span></Label>
              <Input id="name" placeholder={t('form.companyNamePlaceholder')} {...register('name')} />
              {errors.name && <p className="text-sm text-red-500">{errors.name.message}</p>}
            </div>

            <div className="space-y-2">
              <Label>{t('form.vendorType')} <span className="text-red-500">{t('form.required')}</span></Label>
              <RadioGroup value={selectedCategory} onValueChange={(value) => setValue('category', value as any)} className="grid grid-cols-3 gap-4">
                <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="supplier" id="supplier" />
                  <Label htmlFor="supplier" className="cursor-pointer flex-1">
                    <div className="font-medium">{t('form.typeSupplier')}</div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="service_provider" id="service_provider" />
                  <Label htmlFor="service_provider" className="cursor-pointer flex-1">
                    <div className="font-medium">{t('form.typeService')}</div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-4 cursor-pointer hover:bg-accent">
                  <RadioGroupItem value="contractor" id="contractor" />
                  <Label htmlFor="contractor" className="cursor-pointer flex-1">
                    <div className="font-medium">{t('form.typeContractor')}</div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>{t('form.productsServices')} <span className="text-red-500">{t('form.required')}</span></Label>
              <div className="flex flex-wrap gap-2">
                {productServiceOptions.map((service) => (
                  <Badge
                    key={service.key}
                    variant={productsServices.includes(service.key) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() => toggleProductService(service.key)}
                  >
                    {service.label}
                    {productsServices.includes(service.key) && (
                      <X className="w-3 h-3 ml-1" />
                    )}
                  </Badge>
                ))}
              </div>
              {errors.products_services && <p className="text-sm text-red-500">{errors.products_services.message}</p>}
            </div>
          </CardContent>
        </Card>

        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="w-5 h-5" />
              {t('form.contactInfo')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="address">{t('fields.address')} <span className="text-red-500">{t('form.required')}</span></Label>
                <Textarea id="address" placeholder={t('form.addressPlaceholder')} {...register('address')} />
                {errors.address && <p className="text-sm text-red-500">{errors.address.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">{t('fields.phone')} <span className="text-red-500">{t('form.required')}</span></Label>
                <Input id="phone" placeholder={t('form.phonePlaceholder')} {...register('phone')} />
                {errors.phone && <p className="text-sm text-red-500">{errors.phone.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">{t('fields.email')}</Label>
                <Input id="email" type="email" placeholder={t('form.emailPlaceholder')} {...register('email')} />
                {errors.email && <p className="text-sm text-red-500">{errors.email.message}</p>}
              </div>

              <div className="space-y-2">
                <Label htmlFor="contact_person">{t('fields.contactPerson')} <span className="text-red-500">{t('form.required')}</span></Label>
                <Input id="contact_person" placeholder={t('form.contactPersonPlaceholder')} {...register('contact_person')} />
                {errors.contact_person && <p className="text-sm text-red-500">{errors.contact_person.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Terms */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              {t('form.termsSection')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="payment_terms">{t('form.paymentTerms')} <span className="text-red-500">{t('form.required')}</span></Label>
              <Select value={watch('payment_terms')} onValueChange={(value) => setValue('payment_terms', value)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('form.paymentTermsPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="immediate">{t('form.paymentImmediate')}</SelectItem>
                  <SelectItem value="7_days">{t('form.payment7Days')}</SelectItem>
                  <SelectItem value="15_days">{t('form.payment15Days')}</SelectItem>
                  <SelectItem value="30_days">{t('form.payment30Days')}</SelectItem>
                  <SelectItem value="45_days">{t('form.payment45Days')}</SelectItem>
                  <SelectItem value="60_days">{t('form.payment60Days')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">{t('fields.notes')}</Label>
              <Textarea id="notes" placeholder={t('form.notesPlaceholder')} rows={4} {...register('notes')} />
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => navigateBack(navigate, '/laundry/vendors')}>
            {t('form.cancel')}
          </Button>
          <Button type="submit" disabled={createVendor.isPending || updateVendor.isPending}>
            {createVendor.isPending || updateVendor.isPending ? t('form.saving') : t('form.save')}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default VendorFormPage;
