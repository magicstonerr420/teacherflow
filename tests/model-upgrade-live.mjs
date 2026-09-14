import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const server=await createServer({configFile:false,cacheDir:'.local-runtime/upgrade-vite',server:{middlewareMode:true,watch:null,hmr:false},resolve:{alias:{'@':path.resolve('src')}}});
try {
 const {generateStructured}=await server.ssrLoadModule('/src/lib/ai-service.server.ts');
 const {STAGE_SCHEMAS,mergeLessonPatch,answerAlignmentIssue}=await server.ssrLoadModule('/src/lib/generation-plan.ts');
 const {MASTER_SYSTEM_PROMPT,STAGE_PROMPTS,renderLessonContext}=await server.ssrLoadModule('/src/config/teacherflow-prompt.ts');
 const {generateIllustration}=await server.ssrLoadModule('/src/lib/illustration.server.ts');
 const request={subject:'English',topic:'Planning a community garden',studentAge:'Adults',level:'B1',durationMinutes:45,mainSkill:'Speaking',secondarySkill:'Vocabulary',learningObjective:'Students will propose and compare plans for a shared garden, giving reasons with because and responding politely.',requiredVocabulary:'share, plant, improve, agree, space',previousKnowledge:'Present simple and giving opinions.',technologyAvailable:'Projector / screen',groupWorkEnabled:false,studentsPerGroup:null};
 let lesson={};await mkdir('.local-runtime/model-upgrade',{recursive:true});
 for(const stage of ['foundation','student','teacher']) {
  const patch=await generateStructured({schema:STAGE_SCHEMAS[stage],schemaName:`model_upgrade_${stage}`,system:MASTER_SYSTEM_PROMPT,input:`${renderLessonContext(request)}\n${JSON.stringify(lesson)}\n${STAGE_PROMPTS[stage==='foundation'?'foundation':'materials']}\nGenerate ONLY the current part: ${stage}. Match each existing student question with exactly one answer.`});
  const issue=answerAlignmentIssue(stage,lesson,patch);if(issue)throw Error(issue);
  lesson=mergeLessonPatch(lesson,patch);console.log('Validated new text model:',stage);
 }
 await writeFile('.local-runtime/model-upgrade/lesson-sample.json',JSON.stringify({request,lesson},null,2));
 const image=await generateIllustration('Three teenagers collaborating in a community garden. One carefully plants a small seedling, one holds a watering can, and one points to a clear empty garden bed. Believable hands and tools, clear actions, polished educational editorial illustration, no text.','13-15','B1');
 await writeFile('.local-runtime/model-upgrade/illustration.png',Buffer.from(image.split(',')[1],'base64'));
 console.log('New illustration model returned a valid image; sample saved. No dedicated reading calls made.');
}finally{await server.close();}
