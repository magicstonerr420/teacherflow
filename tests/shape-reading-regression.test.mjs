import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { '@': path.resolve('src') } }, server: { middlewareMode: true, watch: null, hmr: false } });
try {
  const { colorShapeResources, extendNewShapePresentation } = await server.ssrLoadModule('/src/lib/color-shape-resources.ts');
  const { prepareShapeWorksheet } = await server.ssrLoadModule('/src/lib/worksheet-shapes.ts');
  const { prepareReadingVisuals, readingShapeScene, readingSceneSvg, missingReadingReference } = await server.ssrLoadModule('/src/lib/reading-visuals.ts');
  const { applyReading, prepareLessonReading } = await server.ssrLoadModule('/src/lib/reading.ts');
  const { pictureSvg, worksheetPictureIssues } = await server.ssrLoadModule('/src/lib/young-learners.ts');
  const { flashcardsFor } = await server.ssrLoadModule('/src/lib/pptx.ts');
  const fixture = JSON.parse(await readFile('.local-runtime/beginner-audit/colors-and-shapes/lesson.json', 'utf8'));
  const { request, lesson } = fixture;
  const before = JSON.stringify(lesson);
  assert.equal(colorShapeResources(request, lesson.presentation).words.length, 6, 'Existing presentation stays unchanged');
  for (const [age, shapeCount, colorCount, cards] of [['5-7',4,4,10],['8-9',6,6,14],['14-16',6,6,14],['Adults',6,6,14]]) {
    const presentation = extendNewShapePresentation(lesson.presentation, { ...request, studentAge: age });
    const r = colorShapeResources(request, presentation);
    assert.equal(r.colors.length, colorCount); assert.equal(r.shapes.length, shapeCount); assert.equal(r.words.length, cards);
    assert.ok(r.boards.every(b => b.length <= 6));
    assert.equal(flashcardsFor({ ...lesson, presentation }, request).length, cards);
    assert.equal(extendNewShapePresentation(presentation, request), presentation, 'Retry does not duplicate introductions');
    for (const word of r.words) assert.ok(pictureSvg(word), word);
  }
  assert.equal(JSON.stringify(lesson), before);
  assert.equal(extendNewShapePresentation(lesson.presentation, { ...request, requiredVocabulary: 'Cat, Dog' }), lesson.presentation);
  const doc = { title: 'Match the clue', instructions: '', sections: [{ label: 'Section A', title: 'Match', format: 'short-answer', instructions: 'Listen. Write the word.', passage: '', wordBank: ['red','blue','green','circle','square'], items: [
    { number: 1, prompt: 'This color is on the grass.', visual: 'green', choices: [], answerLines: 1 },
    { number: 2, prompt: 'This shape has no corners.', visual: 'circle', choices: [], answerLines: 1 },
    { number: 3, prompt: 'This color is in the sky.', visual: 'blue', choices: [], answerLines: 1 },
    { number: 4, prompt: 'This shape has four equal sides.', visual: 'square', choices: [], answerLines: 1 },
    { number: 5, prompt: 'This color is on a stop sign.', visual: 'red', choices: [], answerLines: 1 },
  ] }] };
  for (const studentAge of ['5-7','8-9','10-12','14-16','Adults']) for (const level of ['A1','A2','B1','B2','C1','C2']) for (const version of ['A','B']) {
    const out = prepareShapeWorksheet(structuredClone(doc), { ...request, studentAge, level });
    assert.deepEqual(out.sections[0].items.map(i => i.visual), ['green circle','red circle','blue square','blue square','red circle']);
    assert.deepEqual(worksheetPictureIssues(out), [], `${studentAge}/${level}/${version}`);
    assert.deepEqual(prepareShapeWorksheet(out, request), out, 'Idempotent preview/PDF processing');
  }
  const coloring = structuredClone(doc); coloring.sections[0].instructions = 'Color the shapes.';
  assert.deepEqual(prepareShapeWorksheet(coloring, request), coloring, 'Coloring tasks retain outlines');
  const text = 'Look at the shapes. This is a circle. It is red. This is a square. It is blue. Look at the green circle. It is green. The green square is here. Point to the red circle. Point to the blue square. The green circle is next to the red circle.';
  const reading = { cefr: 'A1', title: 'Colors and Shapes: Red, Blue, Green', purpose: 'Identify colors and shapes.', word_count: 50, text, instructions: 'Read and answer.', questions: [{ type: 'supporting_details', question: 'What color is the circle?', choices: ['blue','green','red'], evidence: 'It is red.', answerExplanation: 'Red.' }], answers: ['red'], activity: 'Point to the red circle.', assessment: 'Find the colors.' };
  assert.deepEqual(readingShapeScene(text).words, ['red circle','green circle','blue square','green square']);
  const fixed = prepareReadingVisuals(reading);
  assert.deepEqual(fixed.answers, ['circle','square','circle and square']);
  assert.equal(fixed.questions[2].question, 'Which shapes are green?');
  assert.ok(readingSceneSvg(text).includes('#e53935'));
  assert.equal(readingShapeScene('The red circle is not next to the blue square.'), null, 'Do not invent contradictory scenes');
  assert.equal(readingShapeScene('Two red circles are above the blue square.'), null);
  assert.equal(missingReadingReference('Look at the picture. What animal is this?'), true);
  assert.equal(missingReadingReference(text), false);
  const updated = prepareLessonReading(applyReading(lesson, { status: 'ready', value: reading, fingerprint: 'fixture' }));
  for (const key of ['student','studentB']) {
    const section = updated.worksheet[key].sections.find(s => s.label === 'Reading • DeepSeek');
    assert.equal(section.passage, text); assert.equal(section.items[2].prompt, 'Which shapes are green?');
  }
  assert.deepEqual(updated.worksheet.teacher.sections.find(s => s.label === 'Reading • DeepSeek').answers, fixed.answers);
  assert.deepEqual(updated.worksheet.teacherB.find(s => s.label === 'Reading • DeepSeek').answers, fixed.answers);
  assert.equal(JSON.stringify(lesson), before);
  updated.worksheet.student.sections[0] = doc.sections[0]; updated.worksheet.studentB.sections[0] = doc.sections[0];
  const dir = '.local-runtime/shape-reading-review'; await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/existing.json`, JSON.stringify({ request, lesson: updated }));
  await writeFile(`${dir}/future.json`, JSON.stringify({ request: { ...request, studentAge: '8-9' }, lesson: { ...updated, presentation: extendNewShapePresentation(lesson.presentation, { ...request, studentAge: '8-9' }) } }));
  console.log('PASS: future-only 4/6 shapes and colors; A/B picture parity across 5 ages × 6 levels; reference layout, unambiguous questions and matching teacher keys; saved lesson unchanged.');
} finally { await server.close(); }
