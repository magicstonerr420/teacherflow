import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {BetaStore} from '../src/lib/beta-store.server.ts';
import {BetaBudget} from '../src/lib/beta-budget.server.ts';
import {betaAdministrator} from '../src/lib/beta-admin.server.ts';

test('owner removal restores three unused invitations, preserves records and charges, and rejects stale actions',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'tf-beta-admin-')),file=join(dir,'beta.sqlite');
  let store=new BetaStore(file);
  const budget=new BetaBudget(join(dir,'budget.sqlite'));
  try {
    const codes=store.issue();
    // Existing deployments only stored digests. Loading them must not change any link.
    store.transact(s=>s.invites.forEach(i=>delete i.code));
    assert.equal(store.administration().seats.filter(s=>s.code).length,0);
    store.claim('teacher-1',codes[0],'teacher@example.test','Original Name');
    store.status('teacher-1','teacher@example.test','Updated Name');
    assert.equal(store.administration().seats[0].name,'Updated Name');
    await store.stage('teacher-1',{topic:'Saved lesson'},'foundation',async()=>({overview:'Keep this lesson'}));
    const before=store.transact(s=>structuredClone(s.teachers['teacher-1'].runs));
    const charge=budget.reserve('teacher-1','request-1','text','test',0.2);
    budget.settle(charge,0.1);
    const originalBudget=budget.status();
    const stale=store.administration().seats[0];
    const replacement={seat:stale.seat,revision:stale.revision,user:stale.user,action:'replace'};
    store.manageSeat('owner',replacement);
    const after=store.administration();
    assert.equal(after.seats.filter(s=>!s.user).length,3);
    assert.equal(after.removed[0].email,'teacher@example.test');
    assert.equal(after.removed[0].name,'Updated Name');
    assert.equal(store.status('teacher-1').claimed,false);
    assert.equal(store.status('teacher-1').revoked,true);
    assert.deepEqual(store.transact(s=>s.teachers['teacher-1'].runs),before);
    assert.deepEqual(budget.status(),originalBudget);
    const never=async()=>assert.fail('Removed access must never call a provider');
    await assert.rejects(store.stage('teacher-1',{},'foundation',never),/inactive/);
    await assert.rejects(store.image('teacher-1',{},'picture',never),/inactive/);
    await assert.rejects(store.recording('teacher-1',{},'fingerprint','voice',never,never),/inactive/);
    await assert.rejects(store.repairAlternate('teacher-1',{},never),/inactive/);
    assert.throws(()=>store.readingLesson('teacher-1',{}),/inactive/);
    assert.throws(()=>store.claim('stranger',codes[0]),/invalid/);
    assert.throws(()=>store.claim('teacher-1',after.seats[0].code),/removed/);
    assert.throws(()=>store.manageSeat('owner',replacement),/changed/);
    // A stale owner screen cannot remove a different teacher who claims this seat later.
    const unused=after.seats[0];
    store.claim('teacher-2',unused.code,'next@example.test');
    assert.throws(()=>store.manageSeat('owner',{seat:1,revision:unused.revision,user:null,action:'replace'}),/changed/);
    assert.equal(store.status('teacher-2').remaining,3);
    assert.equal(store.administration().seats[0].code,null);
    store.claim('teacher-3',codes[1]);store.claim('teacher-4',codes[2]);
    assert.equal(store.administration().seats.filter(s=>s.user).length,3,'Other original links still work');
    assert.throws(()=>store.manageSeat('teacher-2',{seat:1,revision:unused.revision,user:'teacher-2',action:'replace'}),/owner account/);
    store.db.close();store=new BetaStore(file);
    assert.equal(store.status('teacher-1').revoked,true);
    assert.equal(store.administration().removed.length,1);
    assert.deepEqual(budget.status(),originalBudget);
  }finally{store.db.close();budget.db.close();rmSync(dir,{recursive:true,force:true});}
});

test('rotation survives a lost response and a paid request finishing after removal stays saved',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'tf-beta-admin-flight-')),file=join(dir,'beta.sqlite');
  let store=new BetaStore(file);
  try{
    const codes=store.issue();store.claim('teacher',codes[0]);
    let finish;const pending=new Promise(resolve=>finish=resolve);
    const work=store.stage('teacher',{topic:'Running lesson'},'foundation',()=>pending);
    const seat=store.administration().seats[0];
    store.manageSeat('owner',{seat:1,revision:seat.revision,user:'teacher',action:'replace'});
    finish({overview:'Paid result'});await work;
    assert.equal(Object.values(store.transact(s=>s.teachers.teacher.runs))[0].parts.foundation.value.overview,'Paid result');
    const newCode=store.administration().seats[0].code;
    assert.ok(newCode && !codes.includes(newCode));
    store.db.close();store=new BetaStore(file);
    assert.equal(store.administration().seats[0].code,newCode,'Recover replacement link without issuing another');
    store.claim('new-teacher',newCode);assert.equal(store.status('new-teacher').remaining,3);
  }finally{store.db.close();rmSync(dir,{recursive:true,force:true});}
});

test('admin boundary verifies Supabase identity and denies unsigned, expired, non-owner and disabled access before opening the store',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'tf-beta-admin-auth-')),file=join(dir,'beta.sqlite');
  const vars=['TEACHERFLOW_BETA','TEACHERFLOW_BETA_DB','TEACHERFLOW_OWNER_USER_ID','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'];
  const before=Object.fromEntries(vars.map(k=>[k,process.env[k]])), originalFetch=globalThis.fetch;
  let authenticatedCalls=0,ownerStore;
  try {
    Object.assign(process.env,{TEACHERFLOW_BETA:'true',TEACHERFLOW_BETA_DB:file,TEACHERFLOW_OWNER_USER_ID:'owner-id',SUPABASE_URL:'https://identity.example.test',SUPABASE_PUBLISHABLE_KEY:'public-test'});
    globalThis.fetch=async(input,init)=>{
      authenticatedCalls++;
      const auth=new Headers(init?.headers??input.headers).get('authorization');
      const owner=auth==='Bearer owner-token';
      if(auth==='Bearer expired-token')return new Response(JSON.stringify({message:'Expired',code:'bad_jwt'}),{status:401,headers:{'Content-Type':'application/json'}});
      return new Response(JSON.stringify({id:owner?'owner-id':'teacher-id',email:'verified@example.test',user_metadata:{role:'owner'}}),{headers:{'Content-Type':'application/json'}});
    };
    const request=token=>new Request('https://teacherflow.example.test',{headers:token?{authorization:'Bearer '+token}: {}});
    await assert.rejects(betaAdministrator(request()),/Sign in/);assert.equal(authenticatedCalls,0);
    await assert.rejects(betaAdministrator(request('teacher-token')),/Only the owner/);
    await assert.rejects(betaAdministrator(request('expired-token')),/expired/);
    assert.equal(existsSync(file),false,'No state is opened or leaked before authorization');
    const admin=await betaAdministrator(request('owner-token'));ownerStore=admin.store;
    assert.equal(admin.actor,'owner-id');assert.equal(existsSync(file),true);
    process.env.TEACHERFLOW_BETA='false';
    await assert.rejects(betaAdministrator(request('owner-token')),/not enabled/);
  }finally{
    globalThis.fetch=originalFetch;ownerStore?.db.close();
    for(const key of vars){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
    rmSync(dir,{recursive:true,force:true});
  }
});

test('owner can add keys idempotently, deactivate unused and claimed keys, and reactivate with a fresh link',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'tf-beta-admin-keys-')),file=join(dir,'beta.sqlite');
  let store=new BetaStore(file);
  const budget=new BetaBudget(join(dir,'budget.sqlite'));
  try{
    store.issue();const operation=randomUUID();
    store.createInvitation('owner',operation);store.createInvitation('owner',operation);
    assert.equal(store.administration().seats.length,4,'Retry does not create extra keys');
    const fourth=store.administration().seats[3],code=fourth.code;
    store.manageSeat('owner',{seat:4,revision:fourth.revision,user:null,action:'deactivate'});
    let disabled=store.administration().seats[3];
    assert.equal(disabled.active,false);assert.equal(disabled.code,null);
    assert.equal(store.administration().seats.filter(s=>s.active&&!s.user).length,3);
    assert.throws(()=>store.claim('new-teacher',code),/deactivated/);
    assert.throws(()=>store.manageSeat('owner',{seat:4,revision:fourth.revision,user:null,action:'replace'}),/changed/);
    store.manageSeat('owner',{seat:4,revision:disabled.revision,user:null,action:'replace'});
    const renewed=store.administration().seats[3];assert.equal(renewed.active,true);assert.notEqual(renewed.code,code);
    assert.throws(()=>store.claim('new-teacher',code),/invalid/);
    store.claim('new-teacher',renewed.code,'new@example.test');
    await store.stage('new-teacher',{topic:'Kept'},'foundation',async()=>({overview:'Saved'}));
    store.manageSeat('owner',{seat:4,revision:renewed.revision,user:'new-teacher',action:'deactivate'});
    assert.equal(store.status('new-teacher').revoked,true);
    assert.equal(store.administration().removed[0].savedLessons,1);
    assert.equal(store.administration().seats.length,4,'Deactivation does not make an extra seat');
    assert.equal(store.administration().seats.filter(s=>s.active).length,3);
    store.db.close();store=new BetaStore(file);
    store.createInvitation('owner',operation);
    assert.equal(store.administration().seats.length,4,'Idempotency persists over restarts');
    store.createInvitation('owner',randomUUID());assert.equal(store.administration().seats.length,5);
    assert.equal(budget.status().limitUsd,10);assert.equal(budget.status().remainingUsd,10);
  }finally{store.db.close();budget.db.close();rmSync(dir,{recursive:true,force:true});}
});
