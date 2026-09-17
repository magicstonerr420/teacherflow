import test from 'node:test';
import assert from 'node:assert/strict';
import { worksheetPictureKey, worksheetPictureIssues, worksheetItemPrompt, pictureSvg } from '../src/lib/young-learners.ts';

test('every item needs its own clue; the first picture cannot cover the section', () => {
  const doc = { sections: [{ label: 'A', instructions: 'Look at each picture. Circle one word.', items:
    ['sun','rain','shirt','shoes','hat'].map((visual,i) => ({ number: i+1, prompt: 'What do you see?', visual: i ? '' : visual, choices: ['Sun','Rain'] })) }] };
  const issues = worksheetPictureIssues(doc);
  assert.equal(issues.length, 4);
  for (let i=2;i<=5;i++) assert.ok(issues.some(s=>s.includes(`item ${i}:`)));
  doc.sections[0].items.forEach((item,i) => item.visual=['sun','rain','shirt','shoes','hat'][i]);
  assert.deepEqual(worksheetPictureIssues(doc), []);
});

test('legacy Picture cues become real images, including false Yes/No statements', () => {
  for (const visual of ['sun','rain','shirt','shoes','hat']) {
    const item = { prompt: `Picture: ${visual}. The weather is sunny. Is this right?`, visual: '' };
    assert.equal(worksheetPictureKey(item), visual);
    assert.ok(pictureSvg(worksheetPictureKey(item)));
    assert.equal(worksheetItemPrompt(item), 'The weather is sunny. Is this right?');
    assert.deepEqual(worksheetPictureIssues({sections:[{items:[item]}]}), []);
  }
  const missing = { prompt: 'Picture: umbrella. Is this right?', choices: ['sun','rain'], visual: '' };
  assert.equal(worksheetPictureKey(missing), '');
  assert.match(worksheetPictureIssues({sections:[{items:[missing]}]}).join(' '), /missing picture/);
  assert.equal(worksheetPictureKey({prompt:'What do you see?',choices:['sun','rain']}), '');
  assert.match(worksheetPictureIssues({sections:[{items:[{prompt:'Picture: sun. Is this right?',visual:'rain'}]}]}).join(' '), /does not match/);
});

test('text and drawing tasks stay valid without decorative pictures', () => {
  for (const prompt of ['Read: It is raining. Circle the weather word.', 'Draw a picture of a hat.', 'Look. Circle the word "hat": hat / rain.', 'What can you see from your classroom window?']) {
    assert.deepEqual(worksheetPictureIssues({sections:[{items:[{prompt}]}]}), []);
  }
  const item = { prompt: 'Is this a sun?', visual: 'rain' };
  assert.equal(worksheetPictureKey(item), 'rain', 'Never replace the visual with the statement being evaluated');
  assert.equal(worksheetItemPrompt(item), item.prompt);
});
