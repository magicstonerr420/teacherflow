import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {UsageStore} from '../src/lib/usage-store.server.ts';
import {BetaStore} from '../src/lib/beta-store.server.ts';
import {AccessRequestStore} from '../src/lib/access-request-store.server.ts';
import {deliverApprovalEmails, approvalEmailConfiguration} from '../src/lib/approval-email.server.ts';
import {TeacherToolsStore} from '../src/lib/teacher-tools-store.server.ts';

const DAY=86400000;
function setup() {
 const dir=mkdtempSync(join(tmpdir(),'tf-growth-')), beta=new BetaStore(join(dir,'beta.sqlite')), requests=new AccessRequestStore(beta);
 return {dir,beta,requests,close(){beta.db.close();rmSync(dir,{recursive:true,force:true});}};
}
function approve(f) {
 f.requests.submit({name:'Test Teacher',email:'teacher@example.test',teaching:'Adult English beginners',consent:true,website:''},'fixture');
 const row=f.requests.list('pending').requests[0];
 f.requests.review('owner',row.id,row.revision,'approved');
 return row;
}
test('usage deduplicates sessions, persists first milestones, waits for mature cohorts and prunes daily data',()=>{
 const dir=mkdtempSync(join(tmpdir(),'tf-usage-')); let s;const now=20000*DAY;
 try {
  s=new UsageStore(join(dir,'usage.sqlite'),now-12*DAY);
  s.event('browser','visit','',now);s.event('browser','visit','',now);s.event('browser','preview','weather-and-clothes',now);
  s.teacher('a','active',now-8*DAY);s.teacher('a','saved',now-7*DAY);s.teacher('a','saved',now);
  s.teacher('b','active',now-8*DAY);s.teacher('b','active',now); // Returning on day eight is outside the seven-day window.
  s.teacher('recent','active',now-2*DAY);
  let r=s.report(7,now);assert.equal(r.counts.visit,1);assert.deepEqual({...r.retention},{eligible:2,returned:1});
  assert.equal(s.db.prepare('SELECT saved FROM usage_people WHERE saved IS NOT NULL').get().saved,19993);
  assert.equal(r.previews[0].views,1);assert.equal(r.previews[0].downloads,0);
  s.event('old','visit','',now-100*DAY);s.report(30,now);
  assert.equal(s.db.prepare('SELECT COUNT(*) AS n FROM usage_events WHERE day<19910').get().n,0);
  const records=JSON.stringify(s.db.prepare('SELECT * FROM usage_people').all());assert.ok(!records.includes('recent'));
  s.db.close();s=new UsageStore(join(dir,'usage.sqlite'),now);assert.equal(s.report(30,now).started,now-12*DAY);
 }finally{s?.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('approval and email queue are atomic and retry-safe; missing configuration never attempts delivery',async()=>{
 const f=setup(), oldKey=process.env.RESEND_API_KEY,oldFrom=process.env.TEACHERFLOW_ALERT_FROM;
 try {
  process.env.RESEND_API_KEY='';process.env.TEACHERFLOW_ALERT_FROM='';
  const row=approve(f);f.requests.review('owner',row.id,row.revision,'approved');
  assert.equal(f.beta.db.prepare('SELECT COUNT(*) AS n FROM approval_email_outbox').get().n,1);
  let calls=0;await deliverApprovalEmails(f.beta,async()=>{calls++;throw Error('No send');});
  assert.equal(calls,0);assert.equal(f.requests.list('approved').requests[0].emailStatus,'queued');
  assert.equal(approvalEmailConfiguration().configured,false);
 }finally{if(oldKey===undefined)delete process.env.RESEND_API_KEY;else process.env.RESEND_API_KEY=oldKey;if(oldFrom===undefined)delete process.env.TEACHERFLOW_ALERT_FROM;else process.env.TEACHERFLOW_ALERT_FROM=oldFrom;f.close();}
});
test('ambiguous email response retries stable payload/key, accepts once and never includes invitation secrets',async()=>{
 const f=setup();const old={...process.env};
 try {
  process.env.RESEND_API_KEY='fixture';process.env.TEACHERFLOW_ALERT_FROM='beta@example.test';
  const row=approve(f), sent=[],now=Date.now();
  const sender=async(url,init)=>{sent.push(init);if(sent.length===1)throw Error('Response lost');return Response.json({id:'mail-receipt'});};
  await deliverApprovalEmails(f.beta,sender,now);
  process.env.TEACHERFLOW_ALERT_FROM='changed@example.test';
  await deliverApprovalEmails(f.beta,sender,now+61000);
  await deliverApprovalEmails(f.beta,sender,now+120000);
  assert.equal(sent.length,2);assert.equal(sent[0].body,sent[1].body);
  assert.equal(sent[0].headers['Idempotency-Key'],sent[1].headers['Idempotency-Key']);
  const body=JSON.parse(sent[0].body);assert.deepEqual(body.to,['teacher@example.test']);assert.ok(body.text.includes('/request-access'));
  const code=f.beta.transact(state=>state.invites[0].code);assert.ok(!body.text.includes(code));
  assert.equal(f.requests.list('approved').requests[0].emailStatus,'accepted');
  assert.equal(f.beta.db.prepare('SELECT provider_id FROM approval_email_outbox WHERE id=?').get(row.id).provider_id,'mail-receipt');
 }finally{process.env.RESEND_API_KEY=old.RESEND_API_KEY||'';process.env.TEACHERFLOW_ALERT_FROM=old.TEACHERFLOW_ALERT_FROM||'';f.close();}
});
test('removed invitations are canceled and old ambiguous emails stop before provider deduplication expires',async()=>{
 const f=setup(),old={...process.env};
 try {
  process.env.RESEND_API_KEY='fixture';process.env.TEACHERFLOW_ALERT_FROM='beta@example.test';
  const row=approve(f);let calls=0;
  f.beta.db.prepare('UPDATE approval_email_outbox SET first_attempt=?').run(Date.now()-23*3600000);
  await deliverApprovalEmails(f.beta,async()=>{calls++;return Response.json({id:'bad'});});
  assert.equal(calls,0);assert.equal(f.requests.list('approved').requests[0].emailStatus,'review');
  f.beta.db.prepare("UPDATE approval_email_outbox SET status='queued',first_attempt=NULL").run();
  f.beta.transact(state=>{state.invites[0].deactivatedAt=new Date().toISOString();});
  await deliverApprovalEmails(f.beta,async()=>{calls++;return Response.json({id:'bad'});});
  assert.equal(calls,0);assert.equal(f.requests.list('approved').requests[0].emailStatus,'canceled');
 }finally{process.env.RESEND_API_KEY=old.RESEND_API_KEY||'';process.env.TEACHERFLOW_ALERT_FROM=old.TEACHERFLOW_ALERT_FROM||'';f.close();}
});
test('feedback remains compatible with older records and cached clients without inventing answers',()=>{
 const dir=mkdtempSync(join(tmpdir(),'tf-feedback-')), s=new TeacherToolsStore(join(dir,'beta.sqlite'));
 const input={lessonId:'11111111-1111-4111-8111-111111111111',usedInClass:'yes',editing:'a_little',comment:''}, context={topic:'Weather',level:'A1',teacher:'test@example.test'};
 try {
  s.saveFeedback('teacher',input,context);
  assert.equal(s.feedback('teacher',input.lessonId).timeSaved,null);
  s.saveFeedback('teacher',{...input,timeSaved:'minutes_30_59',wouldPay:'maybe'},context);
  s.saveFeedback('teacher',{...input,comment:'Updated from an older tab'},context);
  const result=s.feedback('teacher',input.lessonId);
  assert.equal(result.timeSaved,'minutes_30_59');assert.equal(result.wouldPay,'maybe');
  assert.throws(()=>s.saveFeedback('teacher',{...input,wouldPay:'definitely-for-$20'},context));
  assert.equal(s.feedback('other',input.lessonId),null);
 }finally{s.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('public usage rejects cross-site requests, oversized bodies and unapproved event targets',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'tf-usage-endpoint-')), previous=process.env.TEACHERFLOW_USAGE_DB;
 process.env.TEACHERFLOW_USAGE_DB=join(dir,'usage.sqlite');
 const {submitUsage}=await import('../src/lib/usage.server.ts'),{usageStore}=await import('../src/lib/usage-store.server.ts');
 try {
  const body={session:'11111111-1111-4111-8111-111111111111',event:'visit',target:''};
  const request=(data=body,headers={})=>new Request('https://teacherflow.example/api/usage',{method:'POST',headers:{origin:'https://teacherflow.example','content-type':'application/json',...headers},body:JSON.stringify(data)});
  assert.equal((await submitUsage(request(body,{origin:'https://other.example'}))).status,403);
  assert.equal((await submitUsage(request({...body,target:'x'.repeat(2048)}))).status,413);
  assert.equal((await submitUsage(request({...body,event:'preview',target:'private-lesson-id'}))).status,400);
  assert.equal((await submitUsage(request({...body,event:'download',target:'pdf'}))).status,400);
  assert.equal((await submitUsage(request())).status,204);
  assert.equal((await submitUsage(request({...body,event:'preview',target:'weather-and-clothes'},{dnt:'1'}))).status,204);
  const report=usageStore().report(7);assert.equal(report.counts.visit,1);assert.equal(report.counts.preview,undefined);
 }finally{usageStore().db.close();if(previous===undefined)delete process.env.TEACHERFLOW_USAGE_DB;else process.env.TEACHERFLOW_USAGE_DB=previous;rmSync(dir,{recursive:true,force:true});}
});
