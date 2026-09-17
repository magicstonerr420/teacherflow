import test from 'node:test';
import assert from 'node:assert/strict';
import { worksheetPictureKey, worksheetPictureIssues, worksheetItemPrompt, pictureSvg } from '../src/lib/young-learners.ts';

test('every item needs its own clue; the first picture cannot cover the section', () => {
  const doc = { sections: [{ label: 'A', instructions: 'Look at each picture. Circle one word.', items:
    ['sun','rain','shirt','shoes','hat'].map((visual,i) => ({ number: i+1, prompt: 'What do you see?', visual: i ? '' : visual, choices: [visual, visual === 'sun' ? 'Rain' : 'Sun'] })) }] };
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

test('School Supplies has exact printable pictures without relying on emoji fonts', () => {
  const words = ['pencil','book','paper','eraser','bag'];
  const pictures = words.map(pictureSvg);
  assert.equal(new Set(pictures).size, words.length);
  for (const svg of pictures) { assert.match(svg, /<svg/); assert.doesNotMatch(svg, /<text|<script/); }
  const doc = { sections: [{ label:'Section A', instructions:'Look at each picture. Circle the correct word.', items:words.map((visual,i)=>({number:i+1,visual,prompt:'Look at the picture. Circle the correct word.',choices:[visual,words[(i+1)%5]]})) }] };
  assert.deepEqual(worksheetPictureIssues(doc), []);
  doc.sections[0].items[4].visual = 'school';
  assert.match(worksheetPictureIssues(doc).join(' '), /item 5:.*absent from the answer choices/);
});

test('missing target words in picture naming are rejected, but false Yes/No statements are valid', () => {
  const naming={label:'Section B',instructions:'Look at each picture. Write the word.',wordBank:['pencil','book','paper','eraser','bag'],items:[{number:1,visual:'school',prompt:'Write the word: ______',choices:[]}]};
  assert.match(worksheetPictureIssues({sections:[naming]}).join(' '),/absent from the answer choices or word bank/);
  const yesNo={instructions:'Look at the picture. Circle Yes or No.',items:[{number:1,visual:'eraser',prompt:'This is a book.',choices:['Yes','No']}]};
  assert.deepEqual(worksheetPictureIssues({sections:[yesNo]}),[]);
});
