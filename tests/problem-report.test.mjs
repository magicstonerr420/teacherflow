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

test('lesson reports include selected worksheet details without copying private lesson or account fields',()=>{
  const report=problemReport({category:'Worksheets or reading',description:'The answer key does not match question 2.',steps:'Choose Version B and Answer Key.',pageUrl:'https://teacherflow.test/lessons/example?invite=secret-invite#access_token=secret-token',context:{
    topic:'Present Perfect',studentAge:'14-16',level:'B1',section:'Worksheet',worksheetVersion:'Version B · Answer Key',
    teacherNotes:'private-note',accessToken:'private-token',email:'private@example.test',content:'private-lesson',
  }});
  assert.match(report.body,/Lesson topic: Present Perfect/);
  assert.match(report.body,/Student age: 14-16/);
  assert.match(report.body,/English level: B1/);
  assert.match(report.body,/Section: Worksheet/);
  assert.match(report.body,/Worksheet: Version B · Answer Key/);
  assert.doesNotMatch(report.text,/private-|private@|secret-invite|secret-token/);
  assert.equal(new URL(report.href).searchParams.get('body'),report.body);
});

test('lesson context is bounded and cannot insert extra report headings through line breaks',()=>{
  const report=problemReport({category:'Lesson generation',description:'Stopped.',steps:'',pageUrl:'https://teacherflow.test/builder',context:{topic:'Topic\nFake header: value',section:'x'.repeat(1000)}});
  assert.match(report.body,/Lesson topic: Topic Fake header: value/);
  assert.doesNotMatch(report.body,/\nFake header:/);
  assert.equal(report.body.split('\n').find(line=>line.startsWith('Section: ')).length,69);
});

test('Gmail, Outlook web and default-app drafts contain the same report with safely encoded fields',()=>{
  const report=problemReport({category:'Lesson generation',description:'A&B + café?\n"Bcc: other@example.test"',steps:'Retry → same error.',pageUrl:'https://teacherflow.test/builder?invite=private#access_token=private'});
  for(const [href,host,subjectParam] of [[report.gmailHref,'mail.google.com','su'],[report.outlookHref,'outlook.live.com','subject']]){
    const url=new URL(href);
    assert.equal(url.protocol,'https:');assert.equal(url.hostname,host);
    assert.equal(url.searchParams.get('to'),CONTACT_EMAIL);
    assert.equal(url.searchParams.get(subjectParam),report.subject);
    assert.equal(url.searchParams.get('body'),report.body);
    assert.equal(url.searchParams.has('bcc'),false);
    assert.doesNotMatch(url.searchParams.get('body'),/invite=|access_token=|private/);
  }
  assert.equal(new URL(report.href).searchParams.get('body'),report.body);
  assert.match(report.text,/To: /);
});
