const {chromium}=require('C:/Users/javie/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs/promises');const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,channel:'msedge'});try{
 const p=await b.newPage();const fixture=JSON.parse(await fs.readFile('comparison/budget-lesson.json','utf8'));
 await p.addInitScript(data=>{window.baseLesson=data.lesson},fixture);
 await p.route('**/src/hooks/useAuth.tsx*',r=>r.fulfill({contentType:'application/javascript',body:`export function useAuth(){return {isAuthenticated:true,loading:false,user:{email:'test@example.com'},session:null,signOut:async()=>{}}}`}));
 await p.route('**/src/lib/beta.functions.ts*',r=>r.fulfill({contentType:'application/javascript',body:`export async function betaMode(){return false}export async function betaStatus(){return {enabled:false}}export async function claimBeta(){return {ok:true}}`}));
 await p.route('**/src/lib/lesson.functions.ts*',r=>r.fulfill({contentType:'application/javascript',body:`
 const fields={foundation:['overview','lessonPlan'],student:['worksheet'],teacher:['answerKey'],studentB:[],teacherB:[],presentation:['presentation'],activity:['activity'],assessment:['assessment','versionB','exitTicket','homework'],differentiation:['supportVersion','challengeVersion','teacherNotes','qualityCheck']};
 const load=()=>JSON.parse(localStorage.getItem('test-saved')||'null');
 export async function generateLessonStage({data}){window.calls=(window.calls||[]).concat(data.stage);window.captured=data.request;return Object.fromEntries(fields[data.stage].map(k=>[k,window.baseLesson[k]]))}
 export async function saveLesson({data}){localStorage.setItem('test-saved',JSON.stringify(data));return {id:'test-saved'}}
 export async function updateLesson({data}){const old=load();old.content=data.content;localStorage.setItem('test-saved',JSON.stringify(old));return {ok:true}}
 export async function getLesson(){const d=load();return {content:d.content,inputs:d.request}}
 export async function duplicateLesson(){localStorage.setItem('test-duplicated',JSON.stringify(load()));return {id:'test-copy'}}
 export async function listLessons(){return []}export async function deleteLesson(){return {ok:true}}
 export async function regenerateSection({data}){window.sectionCalls=(window.sectionCalls||0)+1;return {[data.section]:{...window.baseLesson[data.section],title:'Regenerated activity'}}}
 `}));
 await p.goto('http://127.0.0.1:3000/builder?example=true');
 await p.getByRole('button',{name:'Fill the example',exact:true}).waitFor();
 const select=async(label,value)=>{await p.locator('label').filter({hasText:label}).locator('..').getByRole('combobox').click();await p.getByRole('option',{name:value,exact:true}).click()};
 await select('Student age','Adults');await select('English level','A2');
 await p.getByRole('button',{name:'Reading',exact:true}).first().click();
 await p.getByRole('button',{name:'Vocabulary',exact:true}).last().click();
 await p.getByPlaceholder('24',{exact:true}).fill('18');await p.getByPlaceholder('Past simple',{exact:true}).fill('Present simple');
 await p.getByPlaceholder('ever, never, already, yet',{exact:true}).fill('park, library');
 await select('Technology available','No technology');await select('Preferred teaching style','Task-based');
 await p.getByRole('switch').first().check();
 await p.getByRole('button',{name:'Build My Class',exact:true}).click();
 await p.getByRole('button',{name:'Save lesson',exact:true}).waitFor();
 const state=await p.evaluate(()=>({request:window.captured,calls:window.calls}));
 assert.equal(state.calls.length,9);for(const [key,value] of Object.entries({studentAge:'Adults',level:'A2',mainSkill:'Reading',secondarySkill:'Vocabulary',numberOfStudents:'18',previousKnowledge:'Present simple',requiredVocabulary:'park, library',technologyAvailable:'No technology',teachingStyle:'Task-based',groupWorkEnabled:true,studentsPerGroup:4}))assert.equal(state.request[key],value,key);
 assert.ok(state.request.learningObjective.length>10);
 await p.locator('nav').getByRole('button',{name:'Activities',exact:true}).click();
 await p.locator('section.block').getByRole('button',{name:'Regenerate Activities',exact:true}).click();
 await p.locator('section.block').getByText('Regenerated activity',{exact:true}).waitFor();
 await p.getByRole('button',{name:'Save lesson',exact:true}).click();
 await p.waitForFunction(()=>JSON.parse(localStorage.getItem('test-saved')).content.activity.title==='Regenerated activity');
 await p.goto('http://127.0.0.1:3000/lessons/test-saved');await p.getByRole('button',{name:'Duplicate',exact:true}).click();
 await p.waitForURL('**/lessons/test-copy');
 assert.ok(await p.evaluate(()=>!!localStorage.getItem('test-duplicated')));
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('test-duplicated')).content.activity.title),'Regenerated activity');
 console.log('Builder age, CEFR, main/secondary skills, objective, vocabulary, prior knowledge, technology, style, group size/class size, 9-stage UI, section regeneration, save after edit, saved reopen and duplicate passed (mock services; no account records altered).');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exitCode=1});
