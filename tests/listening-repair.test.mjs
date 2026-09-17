import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const server = await createServer({configFile:false,server:{middlewareMode:true,watch:null}});
const savedFetch=globalThis.fetch, savedEnv={...process.env};
try {
  process.env.OPENROUTER_API_KEY='test-only';
  process.env.TEACHERFLOW_LISTENING_DB=path.join(await mkdtemp(path.join(tmpdir(),'tf-listening-repair-')),'test.sqlite');
  const { generateListening }=await server.ssrLoadModule('/src/lib/listening.server.ts');
  const { validateListening }=await server.ssrLoadModule('/src/lib/listening.ts');
  for (const [studentAge,level] of [['5-7','A1'],['8-9','A2']]) {
    const script=('I run in the park. My sister can jump. We stop by a tree. Then we sit on a bench. We stand up and walk home together. ').repeat(7).trim();
    const questions=[
      {question:'Where do I run?',choices:['In the park','At home'],answer:'In the park',evidence:'I run in the park.',explanation:'The narrator names the place.'},
      {question:'Who can jump?',choices:['My sister','My dad'],answer:'My sister',evidence:'My sister can jump.',explanation:'The narrator names the person.'},
      {question:'Where do we sit?',choices:['On a bench','On the grass'],answer:'On a bench',evidence:'Then we sit on a bench.',explanation:'The narrator says where they sit.'},
    ];
    const draft={cefr:level,title:'Actions in the park',purpose:'Follow actions.',instructions:'Listen and choose.',script,teacherGuidance:'Read twice.',questions:questions.map(q=>({...q,evidence:q.evidence.replace(/\bI\b/g,'The child').replace('My sister','His sister').replace('we','they')}))};
    assert.throws(()=>validateListening(draft,level,studentAge),/supporting quote/);
    const calls=[];
    globalThis.fetch=async(url,options)=>{
      assert.ok(url.endsWith('/chat/completions'),'No audio or extra services should be called');
      const body=JSON.parse(options.body),name=body.response_format.json_schema.name;calls.push(name);
      let value=draft;
      if(name==='teacherflow_listening_questions_repair'){
        const allowed=body.response_format.json_schema.schema.properties.questions.items.properties.evidence.enum;
        assert.ok(questions.every(q=>allowed.includes(q.evidence)));
        assert.ok(allowed.every(quote=>script.includes(quote)),'Every allowed quote must occur in the fixed script');
        value={questions};
      }
      return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(value)}}]});
    };
    const request={topic:'Daily Actions',studentAge,level,mainSkill:'Listening',learningObjective:'Follow action commands.',requiredVocabulary:'Run, Jump, Sit, Stand, Stop'};
    const result=await generateListening(request,{},studentAge);
    assert.equal(result.status,'ready');assert.equal(result.value.script,script);assert.deepEqual(result.value.questions,questions);
    assert.deepEqual(calls,studentAge==='5-7'?['teacherflow_listening','teacherflow_listening_review','teacherflow_listening_questions_repair']:['teacherflow_listening','teacherflow_listening_questions_repair']);
    await generateListening(request,{},studentAge);assert.equal(calls.length,studentAge==='5-7'?3:2,'Replay uses the saved result');
  }
  console.log('PASS: invalid draft reaches young-learner review; bounded question-only repair preserves script, selects exact evidence, validates answers and caches success across A1/A2.');
}finally{
  globalThis.fetch=savedFetch;
  for(const k of ['OPENROUTER_API_KEY','TEACHERFLOW_LISTENING_DB'])savedEnv[k]===undefined?delete process.env[k]:process.env[k]=savedEnv[k];
  await server.close();
}
