import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BetaStore } from '../src/lib/beta-store.server.ts';

const phases=['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation'];
test('private beta enforces invitations, quotas, durable retries and image limits', async t=>{
  const dir=mkdtempSync(join(tmpdir(),'teacherflow-beta-'));
  const file=join(dir,'beta.sqlite');
  let store=new BetaStore(file);
  let calls=0;
  const generate=async()=>{calls++;return {ok:true};};
  const complete=async(user,request)=>{for(const phase of phases)await store.stage(user,request,phase,phase==='presentation'?async()=>({presentation:{slides:Array.from({length:7},(_,i)=>({layout:'content',imagePrompt:`image ${i}`,vocabulary:[]}))}}):generate);};
  try {
    const codes=store.issue();
    await t.test('exactly three single-use seats; one account cannot claim two',()=>{
      assert.equal(codes.length,3);assert.throws(()=>store.issue(),/already exist/);
      store.claim('teacher1',codes[0]);
      store.claim('teacher1',codes[0]);
      assert.throws(()=>store.claim('other',codes[0]),/already claimed/);
      assert.throws(()=>store.claim('teacher1',codes[1]),/already has/);
      store.claim('teacher2',codes[1]);store.claim('teacher3',codes[2]);
    });
    await t.test('uninvited users and out-of-order stages cannot call AI',async()=>{
      await assert.rejects(store.stage('stranger',{},'foundation',generate),/invitation/);
      await assert.rejects(store.stage('teacher1',{},'teacher',generate),/first lesson/);
      assert.equal(calls,0);
    });
    await t.test('concurrent duplicate requests make only one paid call',async()=>{
      let resolve;const hold=new Promise(r=>resolve=r);
      const first=store.stage('teacher1',{topic:'one'},'foundation',async()=>{await hold;return {overview:'saved'};});
      await assert.rejects(store.stage('teacher1',{topic:'one'},'foundation',generate),/already running/);
      resolve();await first;
      assert.deepEqual(await store.stage('teacher1',{topic:'one'},'foundation',generate),{overview:'saved'});
      assert.equal(calls,0);
    });
    await t.test('failed stage keeps slot and earlier server-owned progress',async()=>{
      await assert.rejects(store.stage('teacher1',{topic:'one'},'student',async()=>{throw Error('upstream');}),/upstream/);
      assert.equal(store.status('teacher1').remaining,2);
      await store.stage('teacher1',{topic:'one'},'student',async prior=>{assert.equal(prior.overview,'saved');return {worksheet:{student:{title:'kept'}}};});
      await complete('teacher1',{topic:'one'});
      assert.equal(store.status('teacher1').completed,1);
    });
    await t.test('three teachers can each complete three lessons; fourth is blocked',async()=>{
      for(const user of ['teacher1','teacher2','teacher3']){
        for(const topic of ['one','two','three'])await complete(user,{topic});
        assert.equal(store.status(user).completed,3);
        assert.equal(store.status(user).remaining,0);
        await assert.rejects(store.stage(user,{topic:'four'},'foundation',generate),/three beta lesson/);
      }
    });
    await t.test('restart preserves quotas and completed stages are free to reopen',async()=>{
      store.db.close();store=new BetaStore(file);const before=calls;
      await complete('teacher1',{topic:'one'});
      assert.equal(calls,before);assert.equal(store.status('teacher1').completed,3);
    });
    await t.test('six authorized images, cached exports, no arbitrary prompts or foreign lessons',async()=>{
      let imageCalls=0;const image=async()=>{imageCalls++;return 'data:image/png;base64,test';};
      for(let i=0;i<6;i++)await store.image('teacher1',{topic:'one'},`image ${i}`,image);
      await store.image('teacher1',{topic:'one'},'image 0',image);assert.equal(imageCalls,6);
      await assert.rejects(store.image('teacher1',{topic:'one'},'image 6',image),/first six/);
      await assert.rejects(store.image('teacher1',{topic:'not-my-lesson'},'image 0',image),/own lesson/);
      await assert.rejects(store.image('stranger',{topic:'one'},'image 0',image),/invitation/);
      assert.equal(imageCalls,6);
    });
    await t.test('failed image attempts are capped without extra charges on blocked retries',async()=>{
      let failures=0;const fail=async()=>{failures++;throw Error('upstream');};
      for(let i=0;i<2;i++)await assert.rejects(store.image('teacher1',{topic:'two'},'image 0',fail),/upstream/);
      await assert.rejects(store.image('teacher1',{topic:'two'},'image 0',fail),/retry limit/);assert.equal(failures,2);
    });
  }finally{store.db.close();rmSync(dir,{recursive:true,force:true});}
});
