import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const paragraphs = [
  'My name is Mia. I am six years old. I feel happy today. I say hello to my class. My teacher says hello to me.',
  'My mom is at the door. I wave to her. She smiles and waves to me. I put my bag near my chair and sit down.',
  'My dad is at home with our baby. The baby is my little brother. He likes to smile. I smile when I think about him today.',
  'My sister is eight years old. She is in another class. We walk to school together. We say hello to our friends when we get here.',
  'My teacher asks us to count. We say one, two, three, four, and five. Then we say six, seven, eight, nine, and ten. I like counting.',
  'My friend is next to me. She says her name is Ana. Ana is six years old, too. I say hello to Ana. We both smile.',
  'Our teacher asks how we feel today. Ana says she feels happy. I feel happy, too. We say our names again and show six fingers together.',
  'Now it is time to say bye. I wave to Ana and my teacher. My mom is at the door again. I tell her about my day.',
];
const questions = [
  { question: 'What is my name?', choices: ['Mia', 'Ana'], answer: 'Mia', evidence: 'My name is Mia.', explanation: 'The narrator says her name is Mia.' },
  { question: 'How old am I?', choices: ['Six', 'Eight'], answer: 'Six', evidence: 'I am six years old.', explanation: 'The narrator says she is six.' },
  { question: 'How do I feel today?', choices: ['Happy', 'Sad'], answer: 'Happy', evidence: 'I feel happy today.', explanation: 'The narrator says she feels happy.' },
];
const words = s => s.trim().split(/\s+/u).length;
const shortScript = paragraphs.join(' ').split(/\s+/u).slice(0, 114).join(' ');
const draft = { cefr: 'A1', title: 'Hello, I am Mia', purpose: 'State a name, age and feeling.', instructions: 'Listen and choose.', script: shortScript, teacherGuidance: 'Read aloud twice.', questions };
const request = { topic: 'All About Me', studentAge: '5-7', level: 'A1', mainSkill: 'Vocabulary', learningObjective: 'Students can state their name, age, and how they feel today.', requiredVocabulary: 'Mom, Dad, Brother, Sister, Baby', technologyAvailable: 'No technology', teachingStyle: 'Communicative' };
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null } });
const savedFetch = globalThis.fetch, savedEnv = { ...process.env };
try {
  process.env.OPENROUTER_API_KEY = 'test-only';
  process.env.TEACHERFLOW_LISTENING_DB = path.join(await mkdtemp(path.join(tmpdir(), 'tf-listening-length-')), 'test.sqlite');
  const { generateListening } = await server.ssrLoadModule('/src/lib/listening.server.ts');
  const { validateListening } = await server.ssrLoadModule('/src/lib/listening.ts');
  assert.equal(words(shortScript), 114);
  assert.throws(() => validateListening(draft, 'A1'), /114 spoken words/);
  assert.ok(paragraphs.every(p => words(p) >= 25 && words(p) <= 30));

  for (const scenario of ['short', 'long', 'changed-evidence', 'paragraph-variety', 'malformed-repair', 'provider-credits', 'older']) {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      assert.ok(url.endsWith('/chat/completions'), 'No speech or image generation');
      const body = JSON.parse(options.body), name = body.response_format.json_schema.name;
      calls.push(name);
      let value = { ...draft, script: scenario === 'long' ? paragraphs.join(' ').repeat(2) : shortScript };
      if (name === 'teacherflow_listening_script_repair') {
        if (scenario === 'provider-credits') return new Response('', { status: 402 });
        const schema = body.response_format.json_schema.schema;
        assert.deepEqual(Object.keys(schema.properties), ['paragraphs']);
        assert.equal(schema.properties.paragraphs.minItems, 8);
        assert.equal(schema.properties.paragraphs.maxItems, 8);
        const pattern = new RegExp(schema.properties.paragraphs.items.pattern);
        assert.ok(paragraphs.every(p => pattern.test(p)));
        assert.ok(!pattern.test('This is too short.'));
        assert.ok(!pattern.test(Array(31).fill('word').join(' ')));
        value = { paragraphs: paragraphs.map(p => scenario === 'changed-evidence' ? p.replace('My name is Mia.', 'My name is Mia!') : p) };
        if (scenario === 'paragraph-variety') value = { paragraphs: [paragraphs.slice(0, 2).join(' '), ...paragraphs.slice(2)] };
        if (scenario === 'malformed-repair') value = { paragraphs: Array(8).fill('This story is too short.') };
      } else if (name === 'teacherflow_listening_questions_repair') {
        assert.equal(scenario, 'changed-evidence');
        const evidence = body.response_format.json_schema.schema.properties.questions.items.properties.evidence.enum;
        assert.ok(evidence.includes('My name is Mia!'));
        assert.ok(!evidence.includes('My name is Mia.'));
        value = { questions: questions.map(q => ({ ...q, evidence: q.evidence.replace('My name is Mia.', 'My name is Mia!') })) };
      }
      return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });
    };
    const input = scenario === 'older' ? { ...request, studentAge: '8-9' } : request;
    if (scenario === 'malformed-repair') {
      await assert.rejects(() => generateListening(input, {}, scenario), error => {
        assert.match(error.message, /could not finish checking/);
        assert.doesNotMatch(error.message, /Rewrite|spoken words|regex|paragraphs|Zod/);
        return true;
      });
      assert.equal(calls.length, 3, 'Stop after the bounded length repair rather than repeatedly spending credits');
    } else if (scenario === 'provider-credits') {
      await assert.rejects(() => generateListening(input, {}, scenario), /needs credits/);
      assert.equal(calls.length, 3, 'Do not retry billing failures');
    } else {
      const result = await generateListening(input, {}, scenario);
      assert.equal(result.status, 'ready');
      assert.ok(words(result.value.script) >= 200 && words(result.value.script) <= 240);
      validateListening(result.value, 'A1', input.studentAge);
      assert.equal(result.value.script.replace(/\s+/gu, ' '), paragraphs.join(' ').replace('My name is Mia.', scenario === 'changed-evidence' ? 'My name is Mia!' : 'My name is Mia.'));
      assert.equal(result.value.questions[1].answer, 'Six');
      assert.equal(result.value.questions[2].answer, 'Happy');
      assert.doesNotMatch(result.value.teacherGuidance, /play|recording/);
      const expected = ['teacherflow_listening', ...(scenario === 'older' ? [] : ['teacherflow_listening_review']), 'teacherflow_listening_script_repair', ...(scenario === 'changed-evidence' ? ['teacherflow_listening_questions_repair'] : [])];
      assert.deepEqual(calls, expected);
      await generateListening(input, {}, scenario);
      assert.deepEqual(calls, expected, 'Saved success is reused without another provider call');
    }
  }
  console.log('PASS: 114-word and overlong scripts repaired to 200–240 words; evidence repaired against final script; A1 age handling, no-tech guidance, bounded failures, billing errors and free cache reuse.');
} finally {
  globalThis.fetch = savedFetch;
  for (const key of ['OPENROUTER_API_KEY', 'TEACHERFLOW_LISTENING_DB']) savedEnv[key] === undefined ? delete process.env[key] : process.env[key] = savedEnv[key];
  await server.close();
}
