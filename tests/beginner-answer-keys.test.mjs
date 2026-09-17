import assert from 'node:assert/strict';
import {createServer} from 'vite';
import path from 'node:path';
const server=await createServer({configFile:false,resolve:{alias:{'@':path.resolve('src')}},server:{middlewareMode:true,watch:null}});
try{
 const {answerAlignmentIssue}=await server.ssrLoadModule('/src/lib/generation-plan.ts');
 const section={label:'A',title:'Family',instructions:'Read. Write one word.',passage:'Nia is the mom. Ben is the dad.',wordBank:['mom','dad','baby'],items:[{number:1,prompt:'Nia is the ______.',choices:[],visual:'mom',answerLines:1}]};
 const check=(s,key)=>answerAlignmentIssue('teacherB',{worksheet:{studentB:{sections:[s]}}},{worksheet:{teacherB:[{answers:[key]}]}});
 assert.match(check(section,'baby'),/contradicts its printed passage/);
 assert.equal(check(section,'mom'),null);
 assert.match(check({...section,passage:'',wordBank:[],items:[{...section.items[0],prompt:'Do you like apples?'}]},'Yes, I do.'),/personal information or a preference/);
 assert.equal(check({...section,passage:'',wordBank:[],items:[{...section.items[0],prompt:'Do you like apples?'}]},'Accept Yes, I do. or No, I do not. according to the child.'),null);
 assert.match(check({...section,wordBank:[],items:[{...section.items[0],prompt:'Who is Nia?',choices:['mom','dad']}]},'baby'),/printed choice/);
 const {flashcardsFor}=await server.ssrLoadModule('/src/lib/pptx.ts');
 const cards={overview:{materialsNeeded:['Printed picture cards']},presentation:{slides:[{vocabulary:[{word:'mom',imagePrompt:''}]}]}};
 for(const level of ['A1','A2'])assert.deepEqual(flashcardsFor(cards,{studentAge:'8-9',level,requiredVocabulary:'Mom, Dad; Baby'}).map(c=>c.word.toLowerCase()),['mom','dad','baby']);
 assert.deepEqual(flashcardsFor({...cards,overview:{materialsNeeded:['Board']}},{studentAge:'8-9',level:'A2',requiredVocabulary:'Mom, Dad'}),[]);
 console.log('PASS: reject incorrect named-family facts, absent choices and fixed personal preferences; preserve correctly supported and open answers.');
}finally{await server.close()}
