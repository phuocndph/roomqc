// Defensive candidate discovery, NOT an authorization proof or SQL interpreter.
// Catalog dependencies supplement name matches: PL/pgSQL and dynamic statements
// do not have a complete pg_depend graph. Never infer safe from a missing edge.
import assert from 'node:assert/strict';

const browser=['anon','authenticated'],identifier=/^[a-z_][a-z0-9_]*$/;
const key=v=>v.schema+'.'+v.name;
const functionId=v=>'function:'+v.schema+':'+v.identity;
const relationId=v=>'relation:'+key(v);
const escape=v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const sort=values=>[...values].sort((a,b)=>a.localeCompare(b,'en'));
const browserExecute=fn=>browser.filter(role=>fn.execute.some(p=>p.role===role&&p.allowed===true&&p.schemaUsage===true));

// Deliberately over-approximate quoted/unqualified names and overloads. Matches
// inside literals/comments are still only review candidates, never real calls.
function mentions(source,target,{call=false}={}){
  const expression=new RegExp('\\b(?:([a-z_][a-z0-9_]*)\\s*\\.\\s*)?'+escape(target.name)+'\\b'+(call?'\\s*\\(' : ''),'gi');
  for(const match of source.replaceAll('"','').matchAll(expression)){
    if(!match[1]||match[1].toLowerCase()===target.schema)return true;
  }
  return false;
}
function validate(input){
  assert.ok(input&&typeof input==='object');
  for(const group of ['noPolicyTables','functions','views','policies'])assert.ok(Array.isArray(input[group]),'Missing '+group);
  for(const row of [...input.noPolicyTables,...input.functions,...input.views]){
    assert.ok(identifier.test(row.schema)&&identifier.test(row.name),'Unsupported object identifier');
  }
  for(const fn of input.functions){
    assert.equal(typeof fn.identity,'string');assert.equal(typeof fn.source,'string');
    assert.equal(typeof fn.definer,'boolean');assert.ok(Array.isArray(fn.execute)&&Array.isArray(fn.config));
    if(fn.dependencies!==undefined)assert.ok(Array.isArray(fn.dependencies));
  }
  for(const view of input.views){assert.ok(Array.isArray(view.dependencies)&&Array.isArray(view.privileges));
    if(view.functionDependencies!==undefined)assert.ok(Array.isArray(view.functionDependencies));}
  for(const policy of input.policies){assert.ok(identifier.test(policy.schema)&&identifier.test(policy.table));
    assert.equal(typeof policy.name,'string');assert.ok(Array.isArray(policy.roles));}
  if(input.triggers!==undefined)assert.ok(Array.isArray(input.triggers));
  for(const trigger of input.triggers??[]){
    assert.ok(identifier.test(trigger.schema)&&identifier.test(trigger.table));assert.equal(typeof trigger.name,'string');
    assert.ok(['O','A','D','R'].includes(trigger.enabled));assert.ok(Number.isInteger(trigger.eventMask));
    assert.ok(Array.isArray(trigger.privileges));assert.equal(typeof trigger.functionIdentity,'string');
  }
}

export function buildAccessCandidateGraph(input){
  validate(input);
  const nodes=new Map(),parents=new Map(),edges=new Map(),unresolved=[];
  const put=node=>{assert.ok(!nodes.has(node.id),'Duplicate catalog identity');nodes.set(node.id,node)};
  const edge=(from,to,evidence)=>{
    assert.ok(nodes.has(from));
    if(!nodes.has(to)){unresolved.push({from,target:to,evidence});return;}
    const pair=JSON.stringify([from,to]);
    if(!edges.has(pair)){edges.set(pair,{from,to,evidence:[]});
      if(!parents.has(to))parents.set(to,[]);parents.get(to).push(from);}
    const reasons=edges.get(pair).evidence;if(!reasons.includes(evidence))reasons.push(evidence);
  };
  for(const table of input.noPolicyTables)put({id:relationId(table),kind:'table',name:key(table),browserRoles:[]});
  for(const view of input.views)put({id:relationId(view),kind:view.kind==='m'?'materialized_view':'view',name:key(view),
    browserRoles:browser.filter(role=>view.privileges.some(p=>p.role===role&&(p.table===true||p.column===true)&&p.schemaUsage!==false)),
    schemaUsageVerified:view.privileges.every(p=>typeof p.schemaUsage==='boolean'),options:view.options??[]});
  for(const fn of input.functions)put({id:functionId(fn),kind:'function',name:key(fn),identity:fn.identity,definer:fn.definer,
    returnType:fn.returnType??'unknown',sqlExecuteRoles:browserExecute(fn),
    browserRoles:['trigger','event_trigger'].includes(fn.returnType)?[]:browserExecute(fn),searchPath:fn.config.filter(c=>c.startsWith('search_path=')),
    dynamicSqlCandidate:/\bEXECUTE\b/i.test(fn.source),language:fn.language??'unknown'});
  for(const policy of input.policies)put({id:'policy:'+policy.schema+'.'+policy.table+':'+policy.name,kind:'policy',
    name:policy.schema+'.'+policy.table+':'+policy.name,
    browserRoles:browser.filter(role=>policy.roles.includes(role)||policy.roles.includes('public')),
    entryRequiresBaseTableGrants:true,operation:policy.operation});
  for(const trigger of input.triggers??[]){
    const events=[['insert',4],['delete',8],['update',16],['truncate',32]].filter(([,mask])=>(trigger.eventMask&mask)!==0).map(([event])=>event);
    put({id:'trigger:'+trigger.schema+'.'+trigger.table+':'+trigger.name,kind:'trigger',name:trigger.schema+'.'+trigger.table+':'+trigger.name,
      browserRoles:['O','A'].includes(trigger.enabled)?browser.filter(role=>trigger.privileges.some(p=>p.role===role
        &&p.schemaUsage===true&&events.some(event=>p[event]===true))):[],enabled:trigger.enabled,events,
      entryRequiresRowPolicyReview:true});
  }
  const resolveFunction=dep=>input.functions.filter(fn=>fn.schema===dep.schema
    &&(dep.identity?fn.identity===dep.identity:fn.name===dep.name));
  const dependency=(from,dep,evidence)=>{
    assert.ok(dep&&identifier.test(dep.schema)&&identifier.test(dep.name),'Malformed dependency');
    if(dep.kind==='function'){
      const found=resolveFunction(dep);if(!found.length)unresolved.push({from,target:'function:'+key(dep),evidence});
      for(const fn of found)edge(from,functionId(fn),evidence);
    }else{assert.ok(['relation',undefined].includes(dep.kind));edge(from,relationId(dep),evidence)}
  };
  for(const fn of input.functions){
    const from=functionId(fn);
    for(const dep of fn.dependencies??[])dependency(from,dep,'catalog_dependency');
    for(const target of input.functions)if(mentions(fn.source,target,{call:true}))edge(from,functionId(target),'source_name_match');
    for(const target of [...input.noPolicyTables,...input.views])if(mentions(fn.source,target))edge(from,relationId(target),'source_name_match');
  }
  for(const view of input.views){
    const from=relationId(view);
    for(const dep of view.dependencies)dependency(from,dep,'catalog_view_dependency');
    for(const dep of view.functionDependencies??[])dependency(from,{...dep,kind:'function'},'catalog_view_function');
    // Legacy captures did not retain pg_rewrite -> pg_proc. Preserve a fallback
    // candidate, but declare catalog incompleteness below.
    for(const fn of input.functions)if(mentions(view.definition??'',fn,{call:true}))edge(from,functionId(fn),'source_name_match');
  }
  for(const policy of input.policies){
    const from='policy:'+policy.schema+'.'+policy.table+':'+policy.name,source=(policy.using??'')+' '+(policy.check??'');
    for(const fn of input.functions)if(mentions(source,fn,{call:true}))edge(from,functionId(fn),'policy_name_match');
    for(const table of input.noPolicyTables)if(mentions(source,table))edge(from,relationId(table),'policy_name_match');
  }
  for(const trigger of input.triggers??[]){
    const from='trigger:'+trigger.schema+'.'+trigger.table+':'+trigger.name;
    const found=input.functions.filter(fn=>fn.schema===trigger.functionSchema&&fn.identity===trigger.functionIdentity);
    if(!found.length)unresolved.push({from,target:'function:'+trigger.functionSchema+':'+trigger.functionIdentity,evidence:'catalog_trigger_function'});
    for(const fn of found)edge(from,functionId(fn),'catalog_trigger_function');
  }
  function ancestors(target){
    const next=new Map(),seen=new Set([target]),queue=[target];
    for(let index=0;index<queue.length;index++)for(const from of sort(parents.get(queue[index])??[])){
      if(seen.has(from))continue;seen.add(from);next.set(from,queue[index]);queue.push(from);
    }
    const entries=[];
    for(const id of sort(next.keys())){
      const node=nodes.get(id);if(!node.browserRoles.length)continue;
      const path=[id],evidence=[];let current=id;
      while(current!==target){const to=next.get(current);assert.ok(to);evidence.push(sort(edges.get(JSON.stringify([current,to])).evidence));path.push(to);current=to;}
      entries.push({entry:node,path,evidence,status:'requires_semantic_and_runtime_review'});
    }
    return entries;
  }
  const tableCandidates=input.noPolicyTables.map(table=>({table:key(table),entries:ancestors(relationId(table)),
    status:'requires_explicit_caller_review'}));
  const dynamicSqlCandidates=[...nodes.values()].filter(n=>n.dynamicSqlCandidate)
    .map(node=>({function:node,entries:ancestors(node.id)}));
  return {contractVersion:1,counts:{nodes:nodes.size,edges:edges.size,tableTargets:tableCandidates.length,
    triggers:(input.triggers??[]).length,entryPaths:tableCandidates.reduce((n,t)=>n+t.entries.length,0),
    dynamicSqlFunctions:dynamicSqlCandidates.length,unresolvedDependencies:unresolved.length},tableCandidates,dynamicSqlCandidates,
    unresolvedDependencies:unresolved.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b),'en')),
    limitations:{candidateDiscoveryOnly:true,apiExposedSchemasVerified:false,
      missingFunctionCatalogDependencies:input.functions.some(fn=>fn.dependencies===undefined),
      missingFunctionReturnTypes:input.functions.some(fn=>fn.returnType===undefined),
      missingViewFunctionDependencies:input.views.some(view=>view.functionDependencies===undefined),
      missingTriggerInventory:input.triggers===undefined,policyBaseTableGrantsNotProven:true,
      implicitTriggerAndForeignKeyEffectsNotFullyModeled:true,dynamicSqlNotResolved:true,
      nameMatchesMayIncludeCommentsLiteralsAndOverloads:true,transitiveReachabilityProven:false,allSafe:false}};
}
