import test from 'node:test';
import assert from 'node:assert/strict';
import { lessonParagraphs } from '../src/lib/lesson-text.ts';
const normalized=text=>text.replace(/\s+/g,' ').trim();
test('authored paragraphs and dialogue turns have identical shared boundaries',()=>{
 assert.deepEqual(lessonParagraphs('First idea.\r\n\r\nSecond idea.\nMaya: Hello.\nLeo: Hi.'),['First idea.','Second idea.','Maya: Hello.','Leo: Hi.']);
});
test('old dense prose gains paragraphs without rewriting words or punctuation',()=>{
 const text=('The class reviewed several ideas about our local community before discussing them together. Each group explained its opinion and listened carefully to the other students. Their teacher recorded the questions for a later discussion. ').repeat(5);
 const paragraphs=lessonParagraphs(text);
 assert.ok(paragraphs.length>1);assert.equal(normalized(paragraphs.join(' ')),normalized(text));
});
test('short prompts, alternatives, decimals and deliberately authored paragraphs are retained',()=>{
 for(const text of ['Yes, I have. / No, I have not.','It costs 3.50 dollars.','A'.repeat(750)])assert.deepEqual(lessonParagraphs(text),[text]);
 const long='A long paragraph. '.repeat(50).trim();
 assert.deepEqual(lessonParagraphs(long+'\n\nA short ending.'),[long,'A short ending.']);
 assert.deepEqual(lessonParagraphs('  \n '),[]);
});
