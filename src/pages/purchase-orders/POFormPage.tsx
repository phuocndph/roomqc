import React from 'react';
import { useBreakpoint } from '@/lib/breakpoints';
import POForm from '@/components/purchase-orders/POForm';
import { MobilePOForm } from '@/components/purchase-orders/MobilePOForm';

const POFormPage: React.FC = () => {
  const { isMobile } = useBreakpoint();
  
  if (isMobile) {
    return <MobilePOForm />;
  }
  
  return <POForm />;
};

export default POFormPage;
