import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generationAccess, generationRequiresInvitation } from '../src/lib/generation-access.server.ts';
import { BetaStore } from '../src/lib/beta-store.server.ts';
import { checkGoogleProvider } from '../src/lib/google-auth.server.ts';
import { safeAuthPath, googleReturnUrl } from '../src/lib/auth-redirect.ts';

test('Google identity alone cannot buy lessons, images, reading or audio; owner control is independent of profile metadata', async () => {
  const vars=['NODE_ENV','TEACHERFLOW_BETA','TEACHERFLOW_OWNER_USER_ID','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY'];
  const before=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
  const originalFetch=globalThis.fetch,dir=mkdtempSync(join(tmpdir(),'teacherflow-google-access-'));
  const store=new BetaStore(join(dir,'beta.sqlite'));
  let paidCalls=0;
  const never=async()=>{paidCalls++;throw Error('Unauthorized paid callback');};
  const request=token=>new Request('https://teacherflow.test',{headers:token?{authorization:'Bearer '+token}: {}});
  try {
    Object.assign(process.env,{NODE_ENV:'production',TEACHERFLOW_BETA:'true',TEACHERFLOW_OWNER_USER_ID:'owner-id',SUPABASE_URL:'https://identity.example.test',SUPABASE_PUBLISHABLE_KEY:'public-test'});
    globalThis.fetch=async(input,init)=>{
      assert.ok(String(input).startsWith('https://identity.example.test/auth/v1/user'));
      const token=new Headers(init?.headers??input.headers).get('authorization');
      if(token==='Bearer expired')return Response.json({message:'Expired',code:'bad_jwt'},{status:401});
      return Response.json({id:token==='Bearer owner'?'owner-id':'google-teacher',email:'teacher@example.test',app_metadata:{provider:'google'},user_metadata:{role:'owner',betaAccess:true}});
    };
    await assert.rejects(generationAccess(request()),/Sign in/);
    await assert.rejects(generationAccess(request('expired')),/expired/);
    const access=await generationAccess(request('google'));
    assert.deepEqual(access,{user:'google-teacher',limited:true});
    await assert.rejects(store.stage(access.user,{},'foundation',never),/inactive/);
    await assert.rejects(store.image(access.user,{},'picture',never),/inactive/);
    await assert.rejects(store.recording(access.user,{},'fingerprint','standard',never,never),/inactive/);
    assert.throws(()=>store.readingLesson(access.user,{}),/inactive/);
    assert.equal(store.administration().seats.length,0,'Signing in never creates an invitation');
    assert.equal(paidCalls,0);
    const [code]=store.issue();store.claim(access.user,code);
    let allowedCalls=0;
    await store.stage(access.user,{topic:'Invited'},'foundation',async()=>{allowedCalls++;return {overview:'Kept'};});
    assert.equal(allowedCalls,1);assert.equal(store.status(access.user).remaining,2);
    const seat=store.administration().seats[0];
    store.manageSeat('owner-id',{seat:1,revision:seat.revision,user:access.user,action:'deactivate'});
    await assert.rejects(store.stage(access.user,{topic:'Another'},'foundation',never),/inactive/);
    assert.deepEqual(await generationAccess(request('owner')),{user:'owner-id',limited:false});
    for(const flag of ['false','',undefined]){
      if(flag===undefined)delete process.env.TEACHERFLOW_BETA;else process.env.TEACHERFLOW_BETA=flag;
      assert.equal(generationRequiresInvitation(),true);
      await assert.rejects(generationAccess(request('google')),/paused/);
      await assert.rejects(generationAccess(request('owner')),/paused/);
      await assert.rejects(generationAccess(request()),/paused/);
    }
    assert.equal(paidCalls,0);
    process.env.NODE_ENV='development';assert.equal(generationRequiresInvitation(),false);
    assert.deepEqual(await generationAccess(request()),{user:'local',limited:false});
  } finally {
    globalThis.fetch=originalFetch;store.db.close();rmSync(dir,{recursive:true,force:true});
    for(const key of vars){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
  }
});

test('Google readiness distinguishes provider configuration from temporary connection failures',async()=>{
  const redirect=location=>async(url,options)=>{
    assert.equal(url.origin,'https://identity.example.test');
    assert.equal(url.searchParams.get('provider'),'google');
    assert.equal(options.redirect,'manual');
    assert.ok(url.searchParams.get('redirect_to').startsWith('https://teacherflow-beta.onrender.com/auth'));
    return new Response(null,{status:302,headers:{location}});
  };
  assert.equal(await checkGoogleProvider('https://identity.example.test',redirect('https://accounts.google.com/o/oauth2/v2/auth?client_id=test')),true);
  assert.equal(await checkGoogleProvider('https://identity.example.test',redirect('https://accounts.google.com.attacker.test/login')),false);
  assert.equal(await checkGoogleProvider('https://identity.example.test',async()=>Response.json({msg:'missing OAuth secret'},{status:400})),false);
  assert.equal(await checkGoogleProvider('https://identity.example.test',async()=>{throw Error('Network failure');}),null);
  for (const status of [408, 429, 500, 502, 503, 504]) {
    assert.equal(await checkGoogleProvider('https://identity.example.test',async()=>new Response('Unavailable',{status})),null);
  }
});

test('sign-in callbacks preserve local destinations and reject external redirects',()=>{
  for(const bad of [undefined,'https://attacker.test','//attacker.test','/\\attacker.test','/\n/attacker.test'])assert.equal(safeAuthPath(bad),'/builder');
  assert.equal(safeAuthPath('/profile'),'/profile');
  assert.equal(safeAuthPath('/builder?example=true#access_token=private'),'/builder?example=true');
  assert.equal(googleReturnUrl('https://teacherflow.test','/builder?example=true'),'https://teacherflow.test/auth?redirect=%2Fbuilder%3Fexample%3Dtrue');
});
