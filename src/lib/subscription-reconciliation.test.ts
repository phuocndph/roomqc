import { describe, expect, it } from 'vitest';
import { readReconciliationPage, reconciliationError } from './subscription-reconciliation';
const tenant='10000000-0000-4000-8000-000000000001';
const id='10000000-0000-4000-8000-000000000002';
const date='2026-10-17T00:00:00+00:00';
const row={id,tenant_id:tenant,invoice_id:null,amount:1234,currency:'VND',payment_status:'pending',
  created_at:date,invoice_number:null,invoice_status:null,flags:['missing_invoice']};
const page={rows:[row],has_more:false,next_cursor:null,checked_at:date};
describe('read-only reconciliation response',()=>{
  it('preserves server amounts and accepts diagnostic values instead of treating them as payable',()=>{
    expect(readReconciliationPage(page,tenant).rows[0].amount).toBe(1234);
    expect(readReconciliationPage({...page,rows:[{...row,amount:0,currency:'USD'}]},tenant).rows[0].amount).toBe(0);
  });
  it.each([null,{}, {...page,rows:[{...row,tenant_id:id}]}, {...page,rows:[row,row]},
    {...page,rows:[{...row,amount:NaN}]}, {...page,rows:[{...row,created_at:'bad'}]},
    {...page,has_more:true}, {...page,next_cursor:{id,created_at:date}},
    {...page,has_more:true,next_cursor:{id:tenant,created_at:date}},
    {...page,rows:Array.from({length:101},()=>row)}])('rejects malformed, mixed-tenant or ambiguous cursor response %#',value=>{
    expect(()=>readReconciliationPage(value,tenant)).toThrow();
  });
  it('requires the next cursor to match the last row',()=>{
    expect(readReconciliationPage({...page,has_more:true,next_cursor:{id,created_at:date}},tenant).has_more).toBe(true);
  });
  it('hides raw server errors and distinguishes permission/not-found',()=>{
    expect(reconciliationError({code:'42501'})).toContain('quản trị');
    expect(reconciliationError({code:'PT404'})).toContain('Không tìm thấy');
    expect(reconciliationError({message:'secret diagnostics'})).not.toContain('secret');
  });
});
