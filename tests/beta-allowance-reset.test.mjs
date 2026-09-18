import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {BetaStore} from '../src/lib/beta-store.server.ts';
import {BetaBudget} from '../src/lib/beta-budget.server.ts';
const phases=['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation'];
test('owner reset gives three fresh slots, retains lessons and charges, and safely retries a lost response',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'tf-allowance-'));let store=new BetaStore(join(dir,'beta.sqlite'));
  const budget=new BetaBudget(join(dir,'budget.sqlite'));
  const complete=async(topic)=>{for(const stage of phases)await store.stage('teacher',{topic},stage,async()=>({[stage]:topic}));};
  try {
    const [code]=store.issue();store.claim('teacher',code,'teacher@example.test');
    await complete('first');await complete('second');
    const charge=budget.reserve('teacher','charge','text','test',0.2);budget.settle(charge,0.1);const originalBudget=budget.status();
    const seat=store.administration().seats[0];assert.equal(seat.remaining,1);assert.equal(seat.completed,2);
    const input={seat:1,user:'teacher',revision:seat.revision,allowanceRevision:seat.allowanceRevision,operation:randomUUID()};
    const before=store.transact(s=>JSON.parse(JSON.stringify(s.teachers.teacher.runs)));
    store.resetTeacherAllowance('owner',input);
    assert.equal(store.status('teacher').remaining,3);assert.equal(store.status('teacher').completed,0);
    assert.equal(store.status('teacher').lessons.length,2);assert.equal(store.administration().seats[0].user,'teacher');
    const after=store.transact(s=>s.teachers.teacher.runs);
    for(const key of Object.keys(before)){assert.equal(after[key].credited,true);delete after[key].credited;assert.deepEqual(after[key],before[key]);}
    // Reopening a credited lesson uses its cached content and does not take another slot.
    await store.stage('teacher',{topic:'first'},'foundation',async()=>assert.fail('Must reuse saved content'));
    assert.equal(store.status('teacher').remaining,3);
    await complete('third');assert.equal(store.status('teacher').remaining,2);
    store.db.close();store=new BetaStore(join(dir,'beta.sqlite'));
    store.resetTeacherAllowance('owner',input);assert.equal(store.status('teacher').remaining,2,'Lost response retry cannot reset newly consumed slots');
    assert.throws(()=>store.resetTeacherAllowance('owner',{...input,operation:randomUUID()}),/allowance changed/);
    const audit=store.transact(s=>s.accessHistory.filter(e=>e.action==='reset-allowance'));assert.equal(audit.length,1);
    assert.deepEqual(budget.status(),originalBudget);
    const updated=store.administration().seats[0];
    await store.stage('teacher',{topic:'unfinished'},'foundation',async()=>({overview:'retained'}));
    assert.throws(()=>store.resetTeacherAllowance('owner',{...input,allowanceRevision:updated.allowanceRevision,operation:randomUUID()}),/allowance changed/);
    const pending=store.administration().seats[0];assert.equal(pending.pending,1);
    assert.throws(()=>store.resetTeacherAllowance('owner',{...input,allowanceRevision:pending.allowanceRevision,operation:randomUUID()}),/pending/);
    assert.throws(()=>store.resetTeacherAllowance('',input),/Owner/);
  }finally{store.db.close();budget.db.close();rmSync(dir,{recursive:true,force:true});}
});
test('used email cannot restart beta through a new account, including after email change or removal',()=>{
  const dir=mkdtempSync(join(tmpdir(),'tf-email-trial-'));let store=new BetaStore(join(dir,'beta.sqlite'));
  try{
    const codes=store.issue();store.claim('original',codes[0],'Teacher@Example.test');
    assert.throws(()=>store.claim('different-id',codes[1],' teacher@example.test '),/already been used/);
    assert.throws(()=>store.claim('original',codes[1],'Teacher@Example.test'),/already has/);
    store.status('original','new@example.test');
    assert.throws(()=>store.claim('different-id',codes[1],'teacher@example.test'),/already been used/);
    assert.throws(()=>store.claim('different-id',codes[1],'new@example.test'),/already been used/);
    const seat=store.administration().seats[0];store.manageSeat('owner',{seat:1,revision:seat.revision,user:'original',action:'replace'});
    store.db.close();store=new BetaStore(join(dir,'beta.sqlite'));
    assert.throws(()=>store.claim('different-id',codes[1],'TEACHER@example.test'),/already been used/);
    store.claim('new-teacher',codes[1],'another@example.test');assert.equal(store.status('new-teacher').remaining,3);
    // Old databases without an email registry are seeded from existing teacher records.
    store.transact(s=>delete s.usedEmails);
    assert.throws(()=>store.claim('clone',codes[2],'new@example.test'),/already been used/);
  }finally{store.db.close();rmSync(dir,{recursive:true,force:true});}
});
