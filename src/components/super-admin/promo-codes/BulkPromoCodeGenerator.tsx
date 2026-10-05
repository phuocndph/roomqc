import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Copy, Download } from 'lucide-react';
import { getFriendlyError } from '@/lib/errorMessage'

const bulkSchema = z.object({
  prefix: z.string().min(2).max(10),
  quantity: z.number().min(1).max(1000),
  discount_type: z.enum(['percentage', 'fixed_amount']),
  discount_value: z.number().min(0),
  valid_from: z.string(),
  valid_until: z.string(),
  max_uses_per_code: z.number().min(1),
});

type BulkFormValues = z.infer<typeof bulkSchema>;

interface BulkPromoCodeGeneratorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkPromoCodeGenerator({ open, onOpenChange }: BulkPromoCodeGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedCodes, setGeneratedCodes] = useState<string[]>([]);
  const { toast } = useToast();

  const form = useForm<BulkFormValues>({
    resolver: zodResolver(bulkSchema),
    defaultValues: {
      prefix: 'PROMO',
      quantity: 10,
      discount_type: 'percentage',
      discount_value: 10,
      valid_from: new Date().toISOString().split('T')[0],
      valid_until: '',
      max_uses_per_code: 1,
    },
  });

  const generateCode = (prefix: string) => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = prefix;
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const onSubmit = async (data: BulkFormValues) => {
    setIsGenerating(true);
    const codes: string[] = [];
    
    try {
      // Generate unique codes
      for (let i = 0; i < data.quantity; i++) {
        let code = generateCode(data.prefix);
        while (codes.includes(code)) {
          code = generateCode(data.prefix);
        }
        codes.push(code);
      }

      // Insert codes into database
      const promoCodesToInsert = codes.map((code) => ({
        code,
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        max_uses: data.max_uses_per_code,
        valid_from: data.valid_from,
        valid_until: data.valid_until,
        is_active: true,
      }));

      const { error } = await supabase
        .from('promotional_codes')
        .insert(promoCodesToInsert);

      if (error) throw error;

      setGeneratedCodes(codes);
      
      toast({
        title: 'Codes Generated',
        description: `Successfully generated ${codes.length} promotional codes.`,
      });
    } catch (error: any) {
      toast({
        title: 'Error Generating Codes',
        description: getFriendlyError(error),
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadCodes = () => {
    const csv = generatedCodes.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `promo-codes-${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedCodes.join('\n'));
    toast({
      title: 'Copied',
      description: 'Codes copied to clipboard',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Generate Promo Codes</DialogTitle>
        </DialogHeader>

        {generatedCodes.length === 0 ? (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="prefix"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Code Prefix</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="PROMO"
                          {...field}
                          onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                        />
                      </FormControl>
                      <FormDescription>
                        Codes will be PREFIX + random chars
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Quantity</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="1"
                          max="1000"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormDescription>
                        Max 1000 codes per batch
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="discount_type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discount Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="percentage">Percentage (%)</SelectItem>
                          <SelectItem value="fixed_amount">Fixed Amount ($)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="discount_value"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Discount Value</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          {...field}
                          onChange={(e) => field.onChange(Number(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="valid_from"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valid From</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="valid_until"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Valid Until</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="max_uses_per_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Max Uses Per Code</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="1"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      How many times each code can be used
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isGenerating}>
                  {isGenerating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Generate Codes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        ) : (
          <div className="space-y-4">
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-green-800 font-medium">
                ✅ Successfully generated {generatedCodes.length} codes
              </p>
            </div>

            <Textarea
              value={generatedCodes.join('\n')}
              readOnly
              rows={12}
              className="font-mono text-sm"
            />

            <DialogFooter>
              <Button variant="outline" onClick={copyToClipboard}>
                <Copy className="h-4 w-4 mr-2" />
                Copy to Clipboard
              </Button>
              <Button variant="outline" onClick={downloadCodes}>
                <Download className="h-4 w-4 mr-2" />
                Download CSV
              </Button>
              <Button onClick={() => {
                setGeneratedCodes([]);
                onOpenChange(false);
              }}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
