import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { BetaBudget, budgetFetch, withBetaBudget } from '../src/lib/beta-budget.server.ts';
import { BetaStore } from '../src/lib/beta-store.server.ts';

const directory = () => mkdtempSync(join(tmpdir(), 'teacherflow-budget-'));
const chat = (text = 'Hello') => ({ method: 'POST', body: JSON.stringify({ model: 'openai/gpt-5.4-mini', messages: [{role:'user',content:text}], max_tokens: 12000, stream: false }) });
const url = 'https://openrouter.ai/api/v1/chat/completions';
const worker = (file) => new Promise(resolve => {
  const source = `import {BetaBudget} from './src/lib/beta-budget.server.ts'; const b=new BetaBudget(process.argv[1]); try { b.reserve('teacher','key-'+process.pid,'text','test',6);console.log('reserved');} catch {console.log('blocked');} finally{b.close();}`;
  const child=spawn(process.execPath,['--input-type=module','-e',source,file],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']}); let out='';child.stdout.on('data',v=>out+=v);child.on('close',()=>resolve(out.trim()));
});

test('US$10 round persists; competing processes cannot overspend; unknown costs stay reserved', async () => {
  const file=join(directory(),'budget.sqlite');
  const first=new BetaBudget(file);assert.equal(first.status().limitUsd,10);first.close();
  assert.deepEqual((await Promise.all([worker(file),worker(file)])).sort(),['blocked','reserved']);
  const b=new BetaBudget(file);assert.equal(b.status().remainingUsd,4);
  const id=b.reserve('t','uncertain','audio','test',1);b.settle(id);assert.equal(b.status().reservedUsd,7);
  assert.throws(()=>b.reserve('t','uncertain','audio','test',1),/uncertain/);
  b.settle(id,.25);b.settle(id,.1);assert.equal(b.status().accountedUsd,.25);
  const over=b.reserve('t','over','text','test',.1);b.settle(over,.2);assert.equal(b.status().paused,true);
  assert.throws(()=>b.reserve('t','paused','text','test',.1),/no room/);b.close();
});

test('all paid transports reserve before fetch; owner bypass, price checks, failures and zero-charge rejections', async () => {
  const original=globalThis.fetch, previous=process.env.TEACHERFLOW_BUDGET_DB;
  process.env.TEACHERFLOW_BUDGET_DB=join(directory(),'budget.sqlite');
  let paid=0;const bodies=[];
  const mp3=new Uint8Array(2048);mp3.set([73,68,51]);
  globalThis.fetch=async (target, options) => {
    if(String(target).endsWith('/endpoints')) {
      if(String(target).includes('/images/')) return Response.json({endpoints:[{provider_tag:'google-ai-studio',pricing:[{billable:'output_image',unit:'token',cost_usd:.00006}]}]});
      return Response.json({data:{endpoints:[{tag:'azure',pricing:{prompt:.000022,completion:0}}]}});
    }
    paid++;const body=JSON.parse(options.body);bodies.push(body);
    if(String(target).endsWith('/speech'))return new Response(mp3,{headers:{'Content-Type':'audio/mpeg'}});
    return Response.json({usage:{cost:.02},choices:[],data:[]});
  };
  try {
    await budgetFetch(url,chat('owner'));assert.equal(bodies[0].provider,undefined);
    const b=new BetaBudget();assert.equal(b.status().accountedUsd,0);
    await withBetaBudget('teacher',()=>budgetFetch(url,chat()));
    assert.equal(bodies[1].provider.allow_fallbacks,true);
    assert.deepEqual(bodies[1].provider.max_price,{prompt:1.5,completion:9,request:0});assert.equal(b.status().accountedUsd,.02);
    await withBetaBudget('teacher',()=>budgetFetch('https://openrouter.ai/api/v1/images',{method:'POST',body:JSON.stringify({model:'google/gemini-3.1-flash-image-preview',n:1,resolution:'1K',prompt:'A red ball'})}));
    assert.deepEqual(bodies[2].provider,{only:['google-ai-studio'],allow_fallbacks:false});assert.equal(b.status().accountedUsd,.04);
    await withBetaBudget('teacher',()=>budgetFetch('https://openrouter.ai/api/v1/audio/speech',{method:'POST',body:JSON.stringify({model:'microsoft/mai-voice-2',input:'Hello',provider:{only:['azure']}})}));
    assert.equal(b.status().accountedUsd,.04011);
    const count=paid;
    await assert.rejects(()=>withBetaBudget('teacher',()=>budgetFetch(url,{method:'POST',body:JSON.stringify({model:'expensive/new-model',max_tokens:100})})),/not been approved/);assert.equal(paid,count);
    globalThis.fetch=async()=>{paid++;return new Response('',{status:402});};
    await withBetaBudget('teacher',()=>budgetFetch(url,chat('billing')));assert.equal(b.status().reservedUsd,0);
    globalThis.fetch=async()=>{paid++;throw Error('Timeout');};
    await assert.rejects(()=>withBetaBudget('teacher',()=>budgetFetch(url,chat('network'))),/charge is uncertain/);
    const networkCalls=paid;assert.ok(b.status().reservedUsd>0);
    await assert.rejects(()=>withBetaBudget('teacher',()=>budgetFetch(url,chat('network'))),/uncertain/);assert.equal(paid,networkCalls);
    globalThis.fetch=async()=>{paid++;return Response.json({choices:[]});};
    await withBetaBudget('teacher',()=>budgetFetch(url,chat('missing cost')));
    const missingCalls=paid;await assert.rejects(()=>withBetaBudget('teacher',()=>budgetFetch(url,chat('missing cost'))),/uncertain/);assert.equal(paid,missingCalls);
    const remaining=b.status().remainingUsd;const full=b.reserve('t','fill','text','test',remaining);b.settle(full,remaining);
    const before=paid;await assert.rejects(()=>withBetaBudget('teacher',()=>budgetFetch(url,chat('over ceiling'))),/no room/);assert.equal(paid,before);
    await budgetFetch(url,chat('owner after teacher cap'));assert.equal(paid,before+1);b.close();
  } finally {globalThis.fetch=original;previous===undefined?delete process.env.TEACHERFLOW_BUDGET_DB:process.env.TEACHERFLOW_BUDGET_DB=previous;}
});

test('one recording per lesson: voices, clicks, restart, old recordings and retry cache share the same slot',async()=>{
  const file=join(directory(),'beta.sqlite');let store=new BetaStore(file);const codes=store.issue();store.claim('teacher',codes[0]);
  const phases=['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation'];
  const create=async request=>{for(const p of phases)await store.stage('teacher',request,p,async()=>p==='differentiation'?{listening:{status:'ready',fingerprint:request.topic,value:{script:'Saved script'}}}:{});};
  const request={topic:'lesson-one'};await create(request);let calls=0,loadCalls=0;const saved=new Map();
  const load=id=>{loadCalls++;if(!saved.has(id))throw Error('Could not load');return saved.get(id);};
  let release;const hold=new Promise(r=>release=r);
  const generate=async choice=>{calls++;await hold;const result={audio:{id:choice,choice,accent:'en-US'},dataUrl:'saved mp3'};saved.set(choice,result);return result;};
  const first=store.recording('teacher',request,'lesson-one','standard',load,generate);
  await assert.rejects(()=>store.recording('teacher',request,'lesson-one','economy',load,generate),/already running/);
  release();const a=await first;assert.equal(calls,1);
  store.db.close();store=new BetaStore(file);
  const b=await store.recording('teacher',request,'lesson-one','economy',load,generate);assert.deepEqual(a,b);assert.equal(calls,1);assert.equal(loadCalls,1);
  await assert.rejects(()=>store.recording('stranger',request,'lesson-one','standard',load,generate),/invitation/);
  await assert.rejects(()=>store.recording('teacher',request,'different','standard',load,generate),/listening activity/);
  await assert.rejects(()=>store.recording('teacher',request,'lesson-one','economy',()=>{throw Error('Load failed');},generate),/Load failed/);assert.equal(calls,1);
  // Pre-deploy recording consumes this same allowance without generating again.
  const old={topic:'old'};await create(old);store.retainReading('teacher',old,l=>({...l,listening:{...l.listening,audio:a.audio}}));
  assert.deepEqual(await store.recording('teacher',old,'old','economy',load,generate),a);assert.equal(calls,1);
  // A retry after interruption keeps the first selected voice, allowing the existing audio cache to recover.
  const retry={topic:'retry'};await create(retry);const choices=[];let fail=true;
  const recover=async choice=>{choices.push(choice);if(fail){fail=false;throw Error('Interrupted');}return a;};
  await assert.rejects(()=>store.recording('teacher',retry,'retry','standard',load,recover),/Interrupted/);
  await store.recording('teacher',retry,'retry','economy',load,recover);assert.deepEqual(choices,['standard','standard']);
  assert.equal(store.status('teacher').remaining,0);store.db.close();
});
