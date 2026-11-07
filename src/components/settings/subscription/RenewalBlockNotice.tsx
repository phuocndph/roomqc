import { Mail, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ROOMQC_CONTACT_EMAIL } from '@/lib/contact';
import { RENEWAL_BLOCK_MESSAGES, type RenewalBlock } from '@/lib/subscription-checkout';

/** Explains why this tenant cannot renew online (approval, cancellation or admin suspension). */
export function RenewalBlockNotice({ block }: { block: RenewalBlock }) {
  const message = RENEWAL_BLOCK_MESSAGES[block];
  return (
    <Alert role="status" className="border-amber-500/50 bg-amber-500/10">
      <Info className="h-4 w-4 text-amber-700" />
      <AlertTitle className="text-amber-900">{message.title}</AlertTitle>
      <AlertDescription className="space-y-1 text-amber-900">
        <p>{message.body}</p>
        <p className="flex items-center gap-1 font-medium">
          <Mail className="h-4 w-4" />
          <a className="underline" href={`mailto:${ROOMQC_CONTACT_EMAIL}`}>{ROOMQC_CONTACT_EMAIL}</a>
        </p>
      </AlertDescription>
    </Alert>
  );
}
