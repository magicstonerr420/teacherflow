// Opt-in paid integration check. Results are cached locally; never run as part of an ordinary build.
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const dir = '.local-runtime/listening-review';
await mkdir(dir, { recursive: true });
process.env.TEACHERFLOW_LISTENING_DB = path.resolve(dir, 'live.sqlite');
process.env.TEACHERFLOW_READING_DB = path.resolve(dir, 'reading-live.sqlite');
const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, resolve: { alias: { '@': path.resolve('src') } } });
try {
  const { generateListening, generateListeningAudio } = await server.ssrLoadModule('/src/lib/listening.server.ts');
  const { generateReading } = await server.ssrLoadModule('/src/lib/reading.server.ts');
  const fixture = JSON.parse(await readFile('comparison/budget-lesson.json', 'utf8'));
  const samples = [];
  for (const [studentAge, level, topic, objective] of [
    ['5-7', 'A1', 'My body', 'Identify head, hands, arms, legs and eyes in simple spoken instructions.'],
    ['13-15', 'B1', 'A school garden', 'Identify the sequence and reasons for a school gardening project.'],
    ['Adults', 'A1', 'A community class', 'Identify when and where an adult attends a community class.'],
    ['16-18', 'C2', 'Shared community spaces', 'Identify contrasting views and implied attitudes about a shared community space.'],
  ]) {
    const request = { ...fixture.request, studentAge, level, topic, mainSkill: 'Listening', secondarySkill: 'Reading', learningObjective: objective,
      requiredVocabulary: '', technologyAvailable: 'Projector / screen', previousKnowledge: 'Language appropriate to the requested level.' };
    const lesson = { ...fixture.lesson, overview: { ...fixture.lesson.overview, topic, learningObjective: objective, keyLanguage: [], successCriteria: [objective] },
      lessonPlan: { totalMinutes: 30, stages: [{ time: 30, stage: 'Listen and read', teacherActions: 'Use the supplied materials.', studentActions: 'Listen and answer focused questions.', materials: 'Worksheet and recording', purpose: objective }] } };
    const listening = await generateListening(request, lesson, 'live-review');
    assert.equal(listening.status, 'ready');
    const reading = await generateReading(request, lesson, 'live-review');
    assert.equal(reading.status, 'ready', reading.error);
    const sample = { request, lesson, listening, reading };
    samples.push(sample);
    await writeFile(`${dir}/samples.json`, JSON.stringify(samples, null, 2));
    console.log(JSON.stringify({ studentAge, level, listeningWords: listening.value.script.split(/\s+/).length, readingWords: reading.value.word_count }));
  }
  const first = samples[0];
  const result = await generateListeningAudio(first.listening.fingerprint, 'live-review', 'standard');
  await writeFile(`${dir}/full-listening.mp3`, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
  first.listening.audio = result.audio;
  await writeFile(`${dir}/samples.json`, JSON.stringify(samples, null, 2));
  assert.deepEqual(await generateListeningAudio(first.listening.fingerprint, 'live-review', 'standard'), result);
  console.log('Four age/level script and reading cases passed; full Grok recording generated and cache replay matched without another request.');
} finally { await server.close(); }
