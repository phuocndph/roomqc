import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeBackendAdvisors} from '../../scripts/control-backend-advisors.mjs';

test('native advisor results envelope retains warning/info counts instead of claiming an exit-zero report is clean',()=>{
  const rows=[{name:'multiple_permissive_policies',level:'WARN',detail:'private raw detail'},
    {name:'unused_index',level:'INFO'},{name:'multiple_permissive_policies',level:'WARN'}];
  const expected={total:3,issues:[{key:'INFO:unused_index',count:1},{key:'WARN:multiple_permissive_policies',count:2}]};
  for(const value of [rows,{results:rows,message:'native 2.121 output'},{lints:rows},{data:rows},{result:rows}]){
    assert.deepEqual(summarizeBackendAdvisors(value),expected);
  }
  assert.ok(!JSON.stringify(summarizeBackendAdvisors({results:rows})).includes('private raw detail'));
});

test('malformed or incomplete advisor output cannot be summarized as zero findings',()=>{
  for(const value of [null,{}, {results:null}, {results:[{name:'lint',level:'UNKNOWN'}]}, {results:[{level:'ERROR'}]}]){
    assert.throws(()=>summarizeBackendAdvisors(value));
  }
  assert.deepEqual(summarizeBackendAdvisors({results:[]}),{total:0,issues:[]});
});
