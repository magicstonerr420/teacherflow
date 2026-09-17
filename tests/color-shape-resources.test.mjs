import assert from 'node:assert/strict';
import { createServer } from 'vite';
import path from 'node:path';
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [] }, resolve: { alias: { '@': path.resolve('src') } }, server: { middlewareMode: true, watch: null, hmr: false } });
try {
  const { colorShapeResources, colorShapeResourceInstructions } = await server.ssrLoadModule('/src/lib/color-shape-resources.ts');
  const { flashcardsFor } = await server.ssrLoadModule('/src/lib/pptx.ts');
  const { pictureSvg } = await server.ssrLoadModule('/src/lib/young-learners.ts');
  const { renderLessonContext } = await server.ssrLoadModule('/src/config/teacherflow-prompt.ts');
  const request = { subject: 'English', topic: 'Colors and Shapes', learningObjective: 'Identify and match basic colors with geometric shapes.', studentAge: '5-7', level: 'A1', durationMinutes: 60, mainSkill: 'Listening', technologyAvailable: 'Projector / screen', requiredVocabulary: 'Red, Blue, Green, Circle, Square', previousKnowledge: 'Red, blue, yellow; same and different.' };
  const words = ['red circle', 'blue circle', 'green circle', 'red square', 'blue square', 'green square'];
  const lesson = { overview: { materialsNeeded: ['Picture cards'] }, presentation: { slides: [{ vocabulary: ['circle', 'square', 'green', 'red', 'blue'].map(word => ({ word, imagePrompt: `Old ${word} picture` })) }] } };
  const before = JSON.stringify(lesson);
  const cards = flashcardsFor(lesson, request);
  assert.deepEqual(cards.map(c => c.word), words, 'The old five isolated cards become all six combinations');
  assert.deepEqual(cards.map(c => c.visual), words);
  assert.ok(cards.every(c => !c.imagePrompt), 'Exact teaching diagrams do not need paid image prompts');
  assert.equal(JSON.stringify(lesson), before, 'Saved lesson data remains intact');
  const pictures = cards.map(c => pictureSvg(c.visual));
  assert.equal(new Set(pictures).size, 6);
  pictures.forEach((svg, i) => {
    assert.match(svg, i < 3 ? /<circle cx="50"/ : /<rect x="17"/);
    assert.match(svg, new RegExp(['#e53935', '#2575d6', '#2e9c54'][i % 3]));
    assert.doesNotMatch(svg, /#edf1f5|<text|<script|href=/);
  });
  assert.match(renderLessonContext(request), /supplies 6 colored picture-front\/phrase-back cards/);
  assert.match(colorShapeResourceInstructions(request), /same shape in different colors AND the same color on different shapes/);
  assert.deepEqual(colorShapeResources({ requiredVocabulary: 'Blue circle; RED square' }).words, ['red circle', 'blue circle', 'red square', 'blue square']);
  assert.equal(colorShapeResources({ requiredVocabulary: 'Red, Blue, Green' }), null, 'Color-only teaching keeps its color cards');
  assert.equal(colorShapeResources({ requiredVocabulary: 'Circle, Square' }), null, 'Shape-only teaching does not acquire arbitrary colors');
  assert.equal(colorShapeResources({ requiredVocabulary: 'Sun, Rain, Shirt' }), null);
  assert.deepEqual(flashcardsFor({ overview: {}, presentation: { slides: [] } }, request).map(c => c.word), words, 'Complete matching resources do not depend on a model remembering the word flashcards');
  const mixed = flashcardsFor(lesson, { ...request, requiredVocabulary: request.requiredVocabulary + ', Book' });
  assert.equal(mixed.length, 7);
  assert.ok(mixed.some(c => c.word === 'Book'), 'Preserve other explicitly required vocabulary');
  for (const studentAge of ['5-7', '8-9', '14-16', 'Adults']) for (const level of ['A1', 'A2', 'B1']) assert.deepEqual(flashcardsFor(lesson, { ...request, studentAge, level }).map(c => c.word), words);
  console.log('PASS: complete color/shape coverage, exact colored geometry, future generation instructions, saved lesson compatibility, other vocabulary retained, no paid pictures.');
} finally { await server.close(); }
