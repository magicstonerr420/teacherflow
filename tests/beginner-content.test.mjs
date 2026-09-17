import test from 'node:test';
import assert from 'node:assert/strict';
import {pictureSvg,PICTURE_KEYS,youngWorksheetIssues,youngPresentationIssues,worksheetPictureIssues} from '../src/lib/young-learners.ts';
test('remaining beginner topics have distinct printable native pictures',()=>{
 const words=['mom','dad','brother','sister','baby','family','apple','banana','carrot','milk','bread','red','blue','green','circle','square','run','jump','sit','stand','stop','happy','sad','okay'];
 assert.equal(new Set(PICTURE_KEYS).size,PICTURE_KEYS.length);
 const pictures=words.map(pictureSvg);assert.equal(new Set(pictures).size,words.length);
 pictures.forEach(p=>{assert.match(p,/<svg/);assert.doesNotMatch(p,/<text|<script|href=/)});
 for(const color of ['red','blue','green'])for(const shape of ['circle','square'])assert.ok(pictureSvg(`${color} ${shape}`));
 assert.notEqual(pictureSvg('red circle'),pictureSvg('blue circle'));
});

test('group naming needs a group picture and false feeling statements retain the true clue',()=>{
 const section={label:'D',instructions:'Look at the picture.',items:[{number:1,prompt:'Say three family words.',visual:'mom'}]};
 assert.match(worksheetPictureIssues({sections:[section]}).join(' '),/complete supplied family picture/);
 section.items[0].visual='family';
 assert.deepEqual(worksheetPictureIssues({sections:[section]}),[]);
 const feelings={label:'D',instructions:'Read. Circle Yes or No.',passage:'Tom feels happy today.',items:[{number:1,prompt:'Tom feels sad today.',visual:'sad',choices:['Yes','No']}]};
 assert.match(worksheetPictureIssues({sections:[feelings]}).join(' '),/contradicts/);
 feelings.items[0].visual='happy';
 assert.deepEqual(worksheetPictureIssues({sections:[feelings]}),[]);
 feelings.items[0].prompt='Mia feels happy today.';
 assert.match(worksheetPictureIssues({sections:[feelings]}).join(' '),/never states Mia/);
});
test('reject ambiguous self-report checklists, family guesses, and unrelated feeling pictures',()=>{
 const items=[{prompt:'My name is ____. I feel ____. Write yes or no.'},{prompt:'The kind woman = ____'},{prompt:'A boy in my family = ____'},{prompt:'Write your age again.'},{prompt:'I feel sad.',visual:'heart'}];
 assert.equal(youngWorksheetIssues({sections:[{label:'A',items}]}).length,5);
 assert.deepEqual(youngWorksheetIssues({sections:[{label:'A',passage:'I am Ben. Sam is my brother.',items:[{prompt:'Who is Sam in my family?',visual:''}]}]}),[]);
 assert.deepEqual(youngWorksheetIssues({sections:[{label:'A',items:[{prompt:'How do you feel today?',visual:''},{prompt:'Look at the picture. Is this child happy?',visual:'sad',choices:['Yes','No']}]}]}),[]);
});
test('picture cards must be supplied just like flashcards',()=>{
 assert.match(youngPresentationIssues({slides:[]},{overview:{materialsNeeded:['Printed family picture cards']}}).join(' '),/no vocabulary/);
});
test('colored shapes support color-only and shape-only questions without permitting wrong answers',()=>{
 const section={label:'C',instructions:'Look at each picture. Write the word.',wordBank:['red','blue','green','circle','square'],items:[{number:1,visual:'red circle',prompt:'Write the color word.'},{number:2,visual:'blue square',prompt:'Write the shape word.'}]};
 assert.deepEqual(worksheetPictureIssues({sections:[section]}),[]);
 section.wordBank=['blue','green','circle'];
 assert.equal(worksheetPictureIssues({sections:[section]}).length,2);
});
