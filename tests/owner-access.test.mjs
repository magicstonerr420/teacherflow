import test from 'node:test';
import assert from 'node:assert/strict';
import {isOwner} from '../src/lib/beta-auth.server.ts';
import {BetaStore} from '../src/lib/beta-store.server.ts';
test('owner permission matches only the server-configured verified user ID',()=>{
 const previous=process.env.TEACHERFLOW_OWNER_USER_ID;
 try{
  delete process.env.TEACHERFLOW_OWNER_USER_ID;
  assert.equal(isOwner(''),false);assert.equal(isOwner('teacher'),false);
  process.env.TEACHERFLOW_OWNER_USER_ID='owner-user';
  assert.equal(isOwner('owner-user'),true);assert.equal(isOwner('teacher'),false);
  assert.equal(isOwner('OWNER-USER'),false);assert.equal(isOwner(''),false);
 }finally{if(previous===undefined)delete process.env.TEACHERFLOW_OWNER_USER_ID;else process.env.TEACHERFLOW_OWNER_USER_ID=previous;}
});
test('allowance reset preserves cached lessons and grants exactly three fresh slots',async()=>{
 const s=new BetaStore(':memory:');
 try{
  const codes=s.issue();s.claim('teacher',codes[0]);
  const phases=['foundation','student','teacher','studentB','teacherB','presentation','activity','assessment','differentiation'];
  for(const p of phases)await s.stage('teacher',{topic:'old'},p,async()=>({saved:true}));
  assert.equal(s.status('teacher').remaining,2);
  s.resetAllowance('teacher');assert.equal(s.status('teacher').remaining,3);assert.equal(s.status('teacher').completed,0);
  assert.equal(s.status('teacher').lessons.length,1);
  await s.stage('teacher',{topic:'old'},'foundation',async()=>assert.fail('Must reuse completed output'));
  for(let i=0;i<3;i++)await s.stage('teacher',{topic:'new'+i},'foundation',async()=>({saved:true}));
  await assert.rejects(s.stage('teacher',{topic:'fourth'},'foundation',async()=>({})),/three beta lesson/);
  assert.throws(()=>s.resetAllowance('teacher'),/pending/);
 }finally{s.db.close();}
});
