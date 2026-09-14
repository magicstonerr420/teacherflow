import { createServer } from 'vite';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const server = await createServer({ configFile: false, cacheDir: '.local-runtime/comparison-vite', server: { middlewareMode: true }, resolve: { alias: { '@': path.resolve('src') } } });
try {
  const { generateStructured } = await server.ssrLoadModule('/src/lib/ai-service.server.ts');
  const prompts = await server.ssrLoadModule('/src/config/teacherflow-prompt.ts');
  const schemas = await server.ssrLoadModule('/src/lib/lesson-schema.ts');
  const request = { subject: 'English', topic: 'Present Perfect: life experiences', studentAge: '14-16', level: 'B1', durationMinutes: 60, mainSkill: 'Speaking', secondarySkill: 'Grammar', learningObjective: 'Students will ask and answer questions about life experiences using have you ever and follow up in the past simple.', numberOfStudents: '24', technologyAvailable: 'Projector / screen', groupWorkEnabled: false, studentsPerGroup: null };
  let lesson = {};
  let completed = [];
  try {
    const saved = JSON.parse(await readFile('comparison/sonnet-lesson.json', 'utf8'));
    if (JSON.stringify(saved.request) === JSON.stringify(request)) {
      lesson = saved.lesson;
      completed = saved.completed ?? (lesson.overview ? ['foundation'] : []);
    }
  } catch {}
  await mkdir('comparison', { recursive: true });
  for (const stage of ['foundation', 'materials', 'assessment', 'differentiation']) {
    if (completed.includes(stage)) { console.log('Reusing validated', stage); continue; }
    console.log('Generating', stage);
    const input = `${prompts.renderLessonContext(request)}\nALREADY DESIGNED: ${JSON.stringify(lesson)}\n${prompts.STAGE_PROMPTS[stage]}`;
    const result = await generateStructured({ schema: schemas[`${stage}Schema`], schemaName: `teacherflow_${stage}`, system: prompts.MASTER_SYSTEM_PROMPT, input });
    Object.assign(lesson, result);
    completed.push(stage);
    await writeFile('comparison/sonnet-lesson.json', JSON.stringify({ request, lesson, completed }, null, 2));
    console.log('Validated', stage);
  }
  process.env.OPENROUTER_MODEL = 'openai/gpt-4o-mini';
  console.log('Generating mini comparison worksheet');
  const baseline = await generateStructured({ schema: schemas.SECTION_SCHEMAS.worksheet, schemaName: 'worksheet_comparison', system: prompts.MASTER_SYSTEM_PROMPT, input: `${prompts.renderLessonContext(request)}\n${prompts.STAGE_PROMPTS.materials}\nReturn ONLY the worksheet and answerKey fields in the provided schema. Use this lesson overview: ${JSON.stringify(lesson.overview)}` });
  await writeFile('comparison/mini-worksheet.json', JSON.stringify(baseline, null, 2));
  console.log('Comparison complete');
} finally { await server.close(); }
