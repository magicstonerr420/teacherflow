import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const server=await createServer({configFile:false,server:{middlewareMode:true,watch:null},resolve:{alias:{'@':path.resolve('src')}}});
try {
  const {generateReading}=await server.ssrLoadModule('/src/lib/reading.server.ts');
  const cases=[['5-7','A1'],['8-9','A2'],['10-12','B1'],['13-15','B2'],['16-18','C1'],['16-18','C2'],...['A1','A2','B1','B2','C1','C2'].map(l=>['Adults',l])];
  const results=[];
  await mkdir('.local-runtime/reading-review',{recursive:true});
  for(let offset=0;offset<cases.length;offset+=3) {
   await Promise.all(cases.slice(offset,offset+3).map(async ([studentAge,level]) => {
    const advanced=['C1','C2'].includes(level), beginner=['A1','A2'].includes(level);
    const request={subject:'English',topic:'Shared community spaces',studentAge,level,durationMinutes:45,mainSkill:'Reading',secondarySkill:'Vocabulary',
      learningObjective:advanced?'Evaluate contrasting viewpoints about a shared community space, identifying implied attitudes and supporting evidence.':beginner?'Find where people go and what they do in a community space by locating explicit details.':'Identify the main idea and supporting reasons in a text about improving a shared community space.',
      requiredVocabulary:advanced?'access, compromise, perspective':beginner?'park, library, read, play':'community, improve, share',previousKnowledge:beginner?'Basic place words and present simple.':'Describing places and giving reasons.',
      technologyAvailable:'No technology',teachingStyle:'Communicative',numberOfStudents:'20',groupWorkEnabled:false,studentsPerGroup:null};
    const lesson={overview:{keyLanguage:beginner?['present simple, there is/are']:advanced?['concession, hedging and implied stance']:['reasons using because and although'],successCriteria:[request.learningObjective]},lessonPlan:{totalMinutes:45,stages:[
      {time:10,stage:'Activate vocabulary',teacherActions:'Elicit familiar community places.',studentActions:'Recall places and activities.',materials:'Board',purpose:'Connect prior knowledge to target vocabulary.'},
      {time:20,stage:'Reading',teacherActions:'Give a printed reading and focused questions.',studentActions:'Read and locate evidence for answers.',materials:'Printed worksheet',purpose:request.learningObjective},
      {time:15,stage:'Apply and assess',teacherActions:'Check evidence and use a new short notice.',studentActions:'Explain answers using evidence and transfer the skill.',materials:'Paper',purpose:'Assess the same reading objective.'}]}};
    const result=await generateReading(request,lesson,'phase1-live-review','low-reasoning-review');
    results.push({request,lesson,result});
    console.log(studentAge,level,result.status,result.status==='ready'?`${result.value.word_count} words`:result.error);
   }));
   await writeFile('.local-runtime/reading-review/samples.json',JSON.stringify(results,null,2));
  }
  if(results.some(r=>r.result.status!=='ready'))process.exitCode=1;
} finally {await server.close();}
