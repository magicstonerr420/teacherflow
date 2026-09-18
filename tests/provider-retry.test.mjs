import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { retryRateLimited, ProviderRateLimitError } from '../src/lib/provider-retry.server.ts';
import { BetaBudget, budgetFetch, withBetaBudget } from '../src/lib/beta-budget.server.ts';

const options = extra => ({signal:new AbortController().signal,random:()=>0,wait:async()=>{},...extra});
const limited = value => new Response('private provider diagnostic',{status:429,headers:value===undefined?{}:{'Retry-After':value}});

test('429 retries only the rejected call, with bounded exponential backoff and jitter',async()=>{
  let calls=0;const waits=[],events=[];
  const response=await retryRateLimited(async()=>++calls<3?limited():Response.json({ok:true}),options({
    random:()=>.5,wait:async ms=>waits.push(ms),onRetry:async(a,ms)=>events.push([a,ms]),
  }));
  assert.deepEqual(await response.json(),{ok:true});assert.equal(calls,3);
  assert.deepEqual(waits,[2250,4250]);assert.deepEqual(events,[[1,2250],[2,4250]]);
});

test('Retry-After seconds and HTTP dates are honored; malformed and past values use backoff',async()=>{
  const now=Date.UTC(2026,8,18,12,0,0);
  for(const [header,expected] of [['12',12000],['30',30000],['0',2000],['-5',2000],['invalid',2000],
    [new Date(now+9000).toUTCString(),9000],[new Date(now-1000).toUTCString(),2000]]){
    let calls=0;const waits=[];
    await retryRateLimited(async()=>++calls===1?limited(header):new Response(),options({now:()=>now,wait:async ms=>waits.push(ms)}));
    assert.deepEqual(waits,[expected]);assert.equal(calls,2);
  }
});

test('persistent throttling stops after three calls; long cooldown never retries early',async()=>{
  for(const [header,maxCalls,maxWaits] of [[undefined,3,2],['61',1,0],['3600',1,0]]){
    let calls=0,waits=0;
    await assert.rejects(retryRateLimited(async()=>{calls++;return limited(header);},options({wait:async()=>{waits++;}})),
      e=>e instanceof ProviderRateLimitError&&/existing lesson is retained/.test(e.message)&&!e.message.includes('private'));
    assert.equal(calls,maxCalls);assert.equal(waits,maxWaits);
  }
});

test('billing, auth, provider faults, partial success and uncertain connections are never replayed',async()=>{
  for(const status of [200,400,401,402,403,404,422,500,502,503]){
    let calls=0;
    const response=await retryRateLimited(async()=>{calls++;return new Response('',{status});},options({wait:async()=>assert.fail('Unexpected retry')}));
    assert.equal(response.status,status);assert.equal(calls,1);
  }
  let calls=0;const failure=new Error('uncertain paid connection');
  await assert.rejects(retryRateLimited(async()=>{calls++;throw failure;},options()),e=>e===failure);
  assert.equal(calls,1);
});

test('an overall timeout or cancellation stops the retry before another paid request',async()=>{
  const controller=new AbortController();let calls=0;
  const reason=new DOMException('Timed out','TimeoutError');
  await assert.rejects(retryRateLimited(async()=>{calls++;return limited();},options({
    signal:controller.signal,wait:async()=>controller.abort(reason),
  })),e=>e===reason);assert.equal(calls,1);
  const before=new AbortController();before.abort();
  await assert.rejects(retryRateLimited(async()=>assert.fail('Aborted before fetch'),options({signal:before.signal})),/abort/i);
});

test('beta retries release rejected reservations and keep the same model, price cap and successful charge',async()=>{
  const originalFetch=globalThis.fetch,previous=process.env.TEACHERFLOW_BUDGET_DB;
  process.env.TEACHERFLOW_BUDGET_DB=join(mkdtempSync(join(tmpdir(),'teacherflow-rate-limit-')),'budget.sqlite');
  let calls=0;
  const url='https://openrouter.ai/api/v1/chat/completions';
  const init={method:'POST',body:JSON.stringify({model:'deepseek/deepseek-v4-flash-0731',max_tokens:6000,stream:false,provider:{require_parameters:true}})};
  const budget=new BetaBudget();
  try{
    globalThis.fetch=async(_url,options)=>{
      const body=JSON.parse(options.body);
      assert.equal(body.model,'deepseek/deepseek-v4-flash-0731');assert.equal(body.models,undefined);
      assert.deepEqual(body.provider,{require_parameters:true,allow_fallbacks:true,max_price:{prompt:.44,completion:1.32,request:0}});
      assert.ok(budget.status().reservedUsd>0);
      return ++calls<3?limited():Response.json({usage:{cost:.002},choices:[]});
    };
    await withBetaBudget('teacher',()=>retryRateLimited(()=>budgetFetch(url,init),options({wait:async()=>{
      assert.equal(budget.status().reservedUsd,0);assert.equal(budget.status().accountedUsd,0);
    }})));
    assert.equal(calls,3);assert.equal(budget.status().accountedUsd,.002);assert.equal(budget.status().reservedUsd,0);
    assert.equal(budget.db.prepare('SELECT COUNT(*) AS n FROM budget_calls WHERE charged=0').get().n,2);
  }finally{
    budget.close();globalThis.fetch=originalFetch;
    previous===undefined?delete process.env.TEACHERFLOW_BUDGET_DB:process.env.TEACHERFLOW_BUDGET_DB=previous;
  }
});
