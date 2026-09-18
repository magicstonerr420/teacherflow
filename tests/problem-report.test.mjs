import test from 'node:test';
import assert from 'node:assert/strict';
import { problemReport } from '../src/lib/problem-report.ts';
import { CONTACT_EMAIL } from '../src/config/contact.ts';

test('problem reports go to the contact mailbox and exclude automatic invitation and login secrets',()=>{
  const report=problemReport({category:'Listening or audio',description:'Audio does not play & cannot rewind.',steps:'Open lesson → Listening.',pageUrl:'https://teacherflow.test/auth?code=private-code&invite=private-key#access_token=private-token'});
  const url=new URL(report.href);
  assert.equal(url.pathname,CONTACT_EMAIL);
  assert.equal(url.searchParams.get('body'),report.body);
  assert.match(report.body,/Page: https:\/\/teacherflow.test\/auth/);
  assert.doesNotMatch(report.text,/private-code|private-key|private-token|access_token|invite=/);
  assert.match(report.body,/does not play & cannot rewind/);
  assert.match(report.text,/Steps to reproduce/);
});

test('reports keep recipient and subject fixed even when inputs contain email headers',()=>{
  const report=problemReport({category:'Bcc: someone@example.test',description:'A\nBcc: someone@example.test',steps:'',pageUrl:'not a url'});
  const url=new URL(report.href);
  assert.equal(url.pathname,CONTACT_EMAIL);
  assert.equal(url.searchParams.get('subject'),'TeacherFlow problem: Something else');
  assert.equal(url.searchParams.has('bcc'),false);
  assert.match(report.body,/Page: TeacherFlow/);
});
