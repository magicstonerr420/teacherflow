import { createServer } from 'vite';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const server = await createServer({ configFile: false, cacheDir: '.local-runtime/stress-vite', server: { middlewareMode: true }, resolve: { alias: { '@': path.resolve('src') } } });
try {
 const { generateStructured } = await server.ssrLoadModule('/src/lib/ai-service.server.ts');
 const { STAGE_SCHEMAS, mergeLessonPatch, answerAlignmentIssue } = await server.ssrLoadModule('/src/lib/generation-plan.ts');
 const { worksheetSchema, materialsSchema } = await server.ssrLoadModule('/src/lib/lesson-schema.ts');
 const { MASTER_SYSTEM_PROMPT, STAGE_PROMPTS, renderLessonContext } = await server.ssrLoadModule('/src/config/teacherflow-prompt.ts');
 const request = { subject: 'English', topic: 'My family', studentAge: '5-7', level: 'A1', durationMinutes: 60, mainSkill: 'Vocabulary', secondarySkill: null, learningObjective: 'Students will identify mother, father, sister, brother and baby and say This is my family.', technologyAvailable: 'Projector / screen', groupWorkEnabled: false, studentsPerGroup: null };
 let result = {}, completed = [];
 await mkdir('comparison', { recursive: true });
 try { const old = JSON.parse(await readFile('comparison/large-worksheet.json','utf8'));result=old.result;completed=old.completed; } catch {}
 for (const stage of ['student', 'teacher', 'studentB', 'teacherB']) {
   if(completed.includes(stage) && !answerAlignmentIssue(stage,result,result)) continue;
   console.log('Testing real',stage);
   const patch = await generateStructured({ schema: STAGE_SCHEMAS[stage], schemaName: `regression_${stage}`, system: MASTER_SYSTEM_PROMPT, input: `${renderLessonContext(request)}\nALREADY DESIGNED: ${JSON.stringify(result)}\n${STAGE_PROMPTS.materials}\nCURRENT PART: ${stage}. Generate ONLY the fields required by this response schema. Preserve completed student items exactly when writing teacher answers. Other parts are generated separately. Provide exactly one separate answer per student question, including open-ended questions. Never combine several item answers into one string.` });
   result=mergeLessonPatch(result,patch);completed.push(stage);
   await writeFile('comparison/large-worksheet.json',JSON.stringify({request,result,completed},null,2));
   console.log('Validated',stage);
 }
 worksheetSchema.parse(result.worksheet);materialsSchema.shape.answerKey.parse(result.answerKey);
 for (const [student, teacher] of [[result.worksheet.student,result.worksheet.teacher.sections],[result.worksheet.studentB,result.worksheet.teacherB]]) {
   if(student.sections.length!==5||student.sections.some(s=>s.items.length!==5))throw Error('Kids worksheet must have five sections of five items');
   if(teacher.length!==5||teacher.some((s,i)=>s.answers.length!==student.sections[i].items.length))throw Error('Answer key item counts do not align');
 }
 console.log('Both 25-item worksheets and aligned answer keys passed');
} finally { await server.close(); }

