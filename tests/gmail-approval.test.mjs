import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash, createHmac, randomUUID} from 'node:crypto';
import {readFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import vm from 'node:vm';
import {BetaStore} from '../src/lib/beta-store.server.ts';
import {AccessRequestStore} from '../src/lib/access-request-store.server.ts';
import {approvalEmailConfiguration, deliverApprovalEmails} from '../src/lib/approval-email.server.ts';

const secret = 'a'.repeat(64), from = 'teacherflow-test@gmail.com';
const envKeys = ['TEACHERFLOW_APPROVAL_EMAIL_PROVIDER','TEACHERFLOW_GMAIL_SCRIPT_URL','TEACHERFLOW_GMAIL_SCRIPT_SECRET','TEACHERFLOW_ALERT_FROM','RESEND_API_KEY'];
function configure() {
  const old = envKeys.map(key => [key,process.env[key]]);
  Object.assign(process.env,{TEACHERFLOW_APPROVAL_EMAIL_PROVIDER:'gmail-script',TEACHERFLOW_GMAIL_SCRIPT_URL:'https://script.google.com/macros/s/TEST_DEPLOYMENT/exec',TEACHERFLOW_GMAIL_SCRIPT_SECRET:secret,TEACHERFLOW_ALERT_FROM:from});
  return () => old.forEach(([key,value]) => value === undefined ? delete process.env[key] : process.env[key]=value);
}
function relay() {
  const properties = new Map([['TEACHERFLOW_GMAIL_SCRIPT_SECRET',secret],['TEACHERFLOW_ALERT_FROM',from]]);
  const state = {sent:[],quota:100,locked:false,failSend:false,failReceipt:false};
  const context = vm.createContext({console:{log(){}},
    PropertiesService:{getScriptProperties:()=>({getProperty:key=>properties.get(key)||null,setProperty(key,value){if(state.failReceipt && key.startsWith('delivery_') && JSON.parse(value).state==='accepted')throw Error('record write lost');properties.set(key,value);}})},
    Utilities:{getUuid:randomUUID,Charset:{UTF_8:'utf8'},DigestAlgorithm:{SHA_256:'sha256'},computeHmacSha256Signature:(text,key)=>[...createHmac('sha256',key).update(text).digest()],computeDigest:(algo,text)=>[...createHash(algo).update(text).digest()]},
    MailApp:{getRemainingDailyQuota:()=>state.quota,sendEmail(mail){if(state.failSend)throw Error('send uncertain');state.sent.push(mail);state.quota--;}},
    LockService:{getScriptLock:()=>({tryLock(){if(state.locked)return false;state.locked=true;return true;},releaseLock(){state.locked=false;}})},
    ContentService:{MimeType:{JSON:'json'},createTextOutput:text=>({setMimeType:()=>text})},
  });
  vm.runInContext(readFileSync(new URL('../scripts/gmail-approval-relay.gs',import.meta.url),'utf8'),context);
  return {state,properties,post:body=>JSON.parse(context.doPost({postData:{contents:typeof body==='string'?body:JSON.stringify(body)}})),context};
}
function signed(overrides={}) {
  const request = {key:`teacherflow-approval/${randomUUID()}`,timestamp:Date.now(),firstAttempt:Date.now(),payload:JSON.stringify({from,to:['teacher@example.test'],subject:'Your TeacherFlow beta access is approved',text:'Sign in at https://teacherflow-beta.onrender.com/request-access'}),...overrides};
  request.signature=createHmac('sha256',secret).update(`${request.key}\n${request.firstAttempt}\n${request.timestamp}\n${request.payload}`).digest('hex');
  return request;
}
function fixture() {
  const directory=mkdtempSync(join(tmpdir(),'tf-gmail-')),beta=new BetaStore(join(directory,'beta.sqlite')), requests=new AccessRequestStore(beta);
  requests.submit({name:'Test Teacher',email:'teacher@example.test',teaching:'Beginner English adults',consent:true,website:''},'test');
  const row=requests.list('pending').requests[0]; requests.review('owner',row.id,row.revision,'approved');
  return {beta,requests,row,close(){beta.db.close();rmSync(directory,{recursive:true,force:true});}};
}

test('Gmail config rejects non-Google endpoints, missing secrets and unknown providers without leaking credentials',()=>{
  const restore=configure();
  try {
    assert.equal(approvalEmailConfiguration().configured,true);
    assert.ok(!JSON.stringify(approvalEmailConfiguration()).includes(secret));
    assert.ok(!JSON.stringify(approvalEmailConfiguration()).includes('TEST_DEPLOYMENT'));
    for(const url of ['http://script.google.com/macros/s/id/exec','https://script.google.com.attacker.test/macros/s/id/exec','https://script.google.com/macros/s/id/exec?redirect=1']) {
      process.env.TEACHERFLOW_GMAIL_SCRIPT_URL=url;assert.equal(approvalEmailConfiguration().configured,false);
    }
    process.env.TEACHERFLOW_GMAIL_SCRIPT_URL='https://script.google.com/macros/s/id/exec';process.env.TEACHERFLOW_GMAIL_SCRIPT_SECRET='short';assert.equal(approvalEmailConfiguration().configured,false);
    process.env.TEACHERFLOW_APPROVAL_EMAIL_PROVIDER='unknown';assert.equal(approvalEmailConfiguration().configured,false);
  } finally {restore();}
});
test('public relay rejects forged, stale, oversized, multi-recipient and wrong-sender messages',()=>{
  const r=relay(), request=signed();
  assert.equal(r.post({...request,signature:'b'.repeat(64)}).code,'unauthorized');
  assert.equal(r.post(signed({timestamp:Date.now()-600000})).code,'invalid');
  assert.equal(r.post(signed({firstAttempt:Date.now()-23*3600000})).code,'invalid');
  assert.equal(r.post('x'.repeat(13000)).code,'invalid');
  for(const fields of [{to:['one@example.test','two@example.test']},{to:['one@example.test,two@example.test']},{from:'imposter@gmail.com'}]) {
    assert.equal(r.post(signed({payload:JSON.stringify({...JSON.parse(request.payload),...fields})})).code,'invalid-mail');
  }
  assert.equal(r.state.sent.length,0);
});
test('relay deduplicates accepted messages, rejects changed payloads and retains only hashed delivery records',()=>{
  const r=relay(),request=signed();
  const first=r.post(request);assert.equal(first.status,'accepted');assert.deepEqual(r.post(request),first);
  assert.equal(r.state.sent.length,1);
  assert.equal(r.post(signed({...request,payload:JSON.stringify({...JSON.parse(request.payload),text:'Changed https://teacherflow-beta.onrender.com/request-access'})})).code,'conflict');
  const records=[...r.properties].filter(([key])=>key.startsWith('delivery_'));assert.equal(records.length,1);assert.ok(!JSON.stringify(records).includes('teacher@example.test'));
});
test('quota and lock contention do not send, and uncertain sends/receipt failures are never blindly repeated',()=>{
  const r=relay(),request=signed();r.state.quota=0;assert.equal(r.post(request).code,'quota');assert.equal(r.state.sent.length,0);
  r.state.quota=100;r.state.locked=true;assert.equal(r.post(request).code,'busy');r.state.locked=false;
  r.state.failReceipt=true;assert.equal(r.post(request).code,'uncertain');assert.equal(r.state.sent.length,1);
  r.state.failReceipt=false;assert.equal(r.post(request).code,'uncertain');assert.equal(r.state.sent.length,1);
  const failed=relay();failed.state.failSend=true;assert.equal(failed.post(request).code,'uncertain');failed.state.failSend=false;assert.equal(failed.post(request).code,'uncertain');assert.equal(failed.state.sent.length,0);
});
test('real queue and relay protocol recover a lost HTTP receipt without a duplicate email',async()=>{
  const restore=configure(),f=fixture(),r=relay(),now=Date.now(),envelopes=[];
  try {
    const send=async(url,init)=>{assert.match(url,/^https:\/\/script.google.com\//);envelopes.push(JSON.parse(init.body));const result=r.post(init.body);if(envelopes.length===1)throw Error('Lost HTTP response');return Response.json(result);};
    await deliverApprovalEmails(f.beta,send,now);assert.equal(f.requests.list('approved').requests[0].emailStatus,'queued');
    await deliverApprovalEmails(f.beta,send,now+61000);await deliverApprovalEmails(f.beta,send,now+122000);
    assert.equal(f.requests.list('approved').requests[0].emailStatus,'accepted');assert.equal(envelopes.length,2);assert.equal(r.state.sent.length,1);
    assert.equal(envelopes[0].key,envelopes[1].key);assert.equal(envelopes[0].payload,envelopes[1].payload);assert.equal(envelopes[0].firstAttempt,envelopes[1].firstAttempt);assert.notEqual(envelopes[0].signature,envelopes[1].signature);
    const invitation=f.beta.transact(state=>state.invites[0].code);assert.ok(!r.state.sent[0].body.includes(invitation));
  } finally {restore();f.close();}
});
test('queue pauses quota failures, marks uncertain results for review and never switches attempted providers/endpoints',async()=>{
  const restore=configure(),f=fixture(),now=Date.now();let calls=0;
  try {
    await deliverApprovalEmails(f.beta,async()=>{calls++;return Response.json({status:'retry',code:'quota'});},now);
    let row=f.beta.db.prepare('SELECT * FROM approval_email_outbox').get();assert.equal(row.status,'queued');assert.equal(row.next,now+3600000);assert.equal(row.first_attempt,null,'A proven quota rejection can wait for the next daily allowance');
    process.env.TEACHERFLOW_GMAIL_SCRIPT_URL='https://script.google.com/macros/s/NEW/exec';
    await deliverApprovalEmails(f.beta,async()=>{calls++;throw Error('Must not send');},now+3600001);assert.equal(calls,1);assert.equal(f.requests.list('approved').requests[0].emailStatus,'review');
    f.beta.db.prepare("UPDATE approval_email_outbox SET status='queued',endpoint=NULL,provider=NULL").run(); // Simulate a legacy attempted Resend row.
    await deliverApprovalEmails(f.beta,async()=>{calls++;throw Error('Must not switch old Resend mail');},now+3600002);assert.equal(calls,1);assert.equal(f.requests.list('approved').requests[0].emailStatus,'review');
  } finally {restore();f.close();}
});
test('old outbox migrations preserve existing approvals and setup/test functions do not read inboxes',()=>{
  const directory=mkdtempSync(join(tmpdir(),'tf-gmail-migration-')),beta=new BetaStore(join(directory,'beta.sqlite'));
  try {
    beta.db.exec("CREATE TABLE approval_email_outbox (id TEXT PRIMARY KEY,status TEXT,created INTEGER,attempts INTEGER,next INTEGER,lease INTEGER,first_attempt INTEGER,payload TEXT,error TEXT,provider_id TEXT); INSERT INTO approval_email_outbox(id,status,created) VALUES ('old','accepted',123)");
    new AccessRequestStore(beta);new AccessRequestStore(beta);
    const record=beta.db.prepare('SELECT * FROM approval_email_outbox').get();assert.equal(record.status,'accepted');assert.equal(record.provider,null);
    const r=relay();r.context.initializeTeacherFlow();assert.equal(r.state.sent.length,0);assert.equal(r.properties.get('TEACHERFLOW_GMAIL_SCRIPT_SECRET'),secret);r.context.sendTeacherFlowTest();assert.equal(r.state.sent[0].to,from);
    const manifest=JSON.parse(readFileSync(new URL('../scripts/gmail-approval-appsscript.json',import.meta.url),'utf8'));assert.deepEqual(manifest.oauthScopes,['https://www.googleapis.com/auth/script.send_mail']);
  } finally {beta.db.close();rmSync(directory,{recursive:true,force:true});}
});
