import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { navigateBack } from '@/lib/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useLaundryVendor, useCreateVendor, useUpdateVendor } from '@/hooks/useLaundryVendors';

const vendorSchema = z.object({
  name: z.string().min(2, 'Tên đơn vị phải có ít nhất 2 ký tự'),
  type: z.enum(['external', 'in_house']),
  address: z.string().min(5, 'Địa chỉ phải có ít nhất 5 ký tự'),
  phone: z.string().min(10, 'Số điện thoại không hợp lệ'),
  email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
  contact_person: z.string().min(2, 'Tên người liên hệ phải có ít nhất 2 ký tự'),
  notes: z.string().optional()
});

type VendorFormValues = z.infer<typeof vendorSchema>;

export function VendorFormPage() {
  const { t } = useTranslation(['laundry', 'common']);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isEdit = !!id;
  
  const { data: vendor, isLoading } = useLaundryVendor(id);
  const { mutate: createVendor, isPending: isCreating } = useCreateVendor();
  const { mutate: updateVendor, isPending: isUpdating } = useUpdateVendor();
  
  const form = useForm<VendorFormValues>({
    resolver: zodResolver(vendorSchema),
    defaultValues: {
      name: '',
      type: 'external',
      address: '',
      phone: '',
      email: '',
      contact_person: '',
      notes: ''
    }
  });
  
  useEffect(() => {
    if (vendor) {
      form.reset({
        name: vendor.name,
        type: vendor.type as 'external' | 'in_house',
        address: vendor.address || '',
        phone: vendor.phone || '',
        email: vendor.email || '',
        contact_person: vendor.contact_person || '',
        notes: vendor.notes || ''
      });
    }
  }, [vendor, form]);
  
  const onSubmit = (data: VendorFormValues) => {
    if (isEdit && id) {
      updateVendor({ id, data: data as any }, {
        onSuccess: () => navigate(`/laundry/vendors/${id}`)
      });
    } else {
      createVendor(data as any, {
        onSuccess: () => navigate('/laundry/vendors')
      });
    }
  };
  
  if (isLoading) {
    return <div>{t('messages.loading')}</div>;
  }
  
  return (
    <div className="space-y-6">
      <PageHeader 
        title={isEdit ? t('vendorForm.editTitle') : t('vendorForm.addTitle')} 
        description={isEdit ? vendor?.name : t('vendorForm.addDescription')}
      >
        <Button variant="outline" onClick={() => navigateBack(navigate, '/laundry/vendors')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common:back')}
        </Button>
      </PageHeader>
      
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{t('vendorForm.basicInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField 
                  control={form.control} 
                  name="name" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('vendorForm.name')} *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="VD: ABC Laundry" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} 
                />
                
                <FormField 
                  control={form.control} 
                  name="type" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('vendorForm.type')} *</FormLabel>
                      <FormControl>
                        <RadioGroup 
                          onValueChange={field.onChange} 
                          defaultValue={field.value} 
                          className="flex gap-4"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="external" id="external" />
                            <label htmlFor="external" className="cursor-pointer">
                              {t('vendorForm.typeExternal')}
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="in_house" id="in_house" />
                            <label htmlFor="in_house" className="cursor-pointer">
                              {t('vendorForm.typeInHouse')}
                            </label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} 
                />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>{t('vendorForm.contactInfo')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField 
                control={form.control} 
                name="address" 
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('vendorForm.address')} *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="123 Đường ABC, Quận 1, TP.HCM" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} 
              />
              
              <div className="grid gap-4 md:grid-cols-2">
                <FormField 
                  control={form.control} 
                  name="phone" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('vendorForm.phone')} *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="0901234567" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} 
                />
                
                <FormField 
                  control={form.control} 
                  name="email" 
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('vendorForm.email')}</FormLabel>
                      <FormControl>
                        <Input {...field} type="email" placeholder="contact@example.com" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )} 
                />
              </div>
              
              <FormField 
                control={form.control} 
                name="contact_person" 
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('vendorForm.contactPerson')} *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Nguyễn Văn A" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} 
              />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>{t('vendorForm.notes')}</CardTitle>
            </CardHeader>
            <CardContent>
              <FormField 
                control={form.control} 
                name="notes" 
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Textarea {...field} placeholder={t('vendorForm.notesPlaceholder')} rows={4} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} 
              />
            </CardContent>
          </Card>
          
          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => navigateBack(navigate, '/laundry/vendors')}>
              {t('common:cancel')}
            </Button>
            <Button type="submit" disabled={isCreating || isUpdating}>
              {isCreating || isUpdating 
                ? t('vendorForm.processing') 
                : isEdit 
                  ? t('vendorForm.update') 
                  : t('vendorForm.create')
              }
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
