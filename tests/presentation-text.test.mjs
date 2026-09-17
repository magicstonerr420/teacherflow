import test from 'node:test';
import assert from 'node:assert/strict';
import { capitalizeHeading, presentationParagraphs } from '../src/lib/presentation-text.ts';
import { americanEnglish, americanEnglishContent } from '../src/lib/american-english.ts';
import { youngSlidePages, youngSlideRows } from '../src/lib/young-slides.ts';

test('headings use sentence case without changing acronyms or the remaining capitalization', () => {
  for (const [input, expected] of [['ball','Ball'], ['“my favorite toy”','“My favorite toy”'], ['1. question about NASA','1. Question about NASA'], ['iPhone and LEGO','IPhone and LEGO'], ['', '']])
    assert.equal(capitalizeHeading(input), expected);
});

test('separates complete instructions, questions and statements without splitting decimals', () => {
  assert.deepEqual(presentationParagraphs('Today we ask for a toy. Look.\nListen.\nSay the toy.'),
    ['Today we ask for a toy.', 'Look.', 'Listen.', 'Say the toy.']);
  assert.deepEqual(presentationParagraphs('Does it cost $2.50? Yes, it does.'), ['Does it cost $2.50?', 'Yes, it does.']);
  assert.deepEqual(presentationParagraphs('Yes, I have. / No, I haven’t.'), ['Yes, I have. / No, I haven’t.']);
  assert.deepEqual(presentationParagraphs('I have never... / I have already...'), ['I have never... / I have already...']);
});

test('logical paragraphs have extra space; wrapped lines stay together and inside the panel', () => {
  const slide = {title:'toys',layout:'content',studentText:'Today we ask for a toy. Look. Listen. Say the toy.',bullets:[],vocabulary:[],interaction:'Point to the toy.',teacherNote:'Keep this note.'};
  const pages = youngSlidePages(slide);
  const rows = youngSlideRows(pages[0].studentText);
  assert.equal(rows.length, 4);
  for (let i=1; i<rows.length; i++) assert.ok(rows[i].offset - rows[i-1].offset > 0.5);
  const long = {...slide, studentText:Array.from({length:12}, (_,i)=>`Question ${i+1}: Which toy would you like to play with today?`).join(' ')};
  const snapshot = JSON.stringify(long);
  const full = youngSlidePages(long);
  assert.ok(full.length > 1);
  assert.equal(full.map(p=>p.studentText).join(' ').replace(/\s+/g,' '),long.studentText);
  for (const page of full) {
    const lines = youngSlideRows(page.studentText);
    assert.ok(lines.at(-1).offset + 0.32 <= 2.45);
    assert.equal(page.teacherNote,slide.teacherNote);
  }
  const wrapped = youngSlideRows('A sentence wraps\nto this line.\n\nA new thought.');
  assert.equal(wrapped[1].offset,0.34);
  assert.ok(wrapped[2].offset - wrapped[1].offset > 0.5);
  assert.equal(full.at(-1).interaction,slide.interaction);
  assert.equal(JSON.stringify(long),snapshot);
});

test('American spelling covers inflections and case without broad suffix replacement', () => {
  assert.equal(americanEnglish('Practise. He practises. We practised. PRACTISING.'), 'Practice. He practices. We practiced. PRACTICING.');
  assert.equal(americanEnglish('My favourite colour. Recognise organised behaviour. We travelled.'), 'My favorite color. Recognize organized behavior. We traveled.');
  assert.equal(americanEnglish('Exercise, surprise, promise, practice.'),'Exercise, surprise, promise, practice.');
  assert.equal(americanEnglish('https://school.test/practise colour@example.com'),'https://school.test/practise colour@example.com');
});

test('new content uses consistent spelling while saved data, image cache keys and quotes remain intact', () => {
  const source={presentation:{slides:[{title:'Practise',interaction:'Practise together.',highlightWords:['practise'],imagePrompt:'Children practising with colourful toys.'}]},worksheet:{items:['Practise spelling.'],answers:['practised']},quote:'original colour',id:'practise'};
  const snapshot=JSON.stringify(source);
  const output=americanEnglishContent(source);
  assert.equal(output.presentation.slides[0].interaction,'Practice together.');
  assert.deepEqual(output.presentation.slides[0].highlightWords,['practice']);
  assert.equal(output.presentation.slides[0].imagePrompt,source.presentation.slides[0].imagePrompt);
  assert.deepEqual(output.worksheet,{items:['Practice spelling.'],answers:['practiced']});
  assert.equal(output.quote,source.quote);
  assert.equal(output.id,source.id);
  assert.equal(JSON.stringify(source),snapshot);
});
