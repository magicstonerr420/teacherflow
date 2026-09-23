import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { previews } from '../scripts/preview-content.mjs';

const vite=await createServer({configFile:false,resolve:{alias:{'@':path.resolve('src')}},server:{middlewareMode:true},appType:'custom'});
try{
 const schema=await vite.ssrLoadModule('/src/lib/lesson-schema.ts');
 const {validateReading}=await vite.ssrLoadModule('/src/lib/reading.ts');
 const {validateListening}=await vite.ssrLoadModule('/src/lib/listening.ts');
 const {runQualityControl}=await vite.ssrLoadModule('/src/lib/quality.ts');
 const {studentPresentationSlide}=await vite.ssrLoadModule('/src/lib/presentation-audience.ts');
 const {pictureSvg}=await vite.ssrLoadModule('/src/lib/young-learners.ts');
 const full=schema.foundationSchema.merge(schema.materialsSchema).merge(schema.assessmentSchema).merge(schema.differentiationSchema);
 assert.equal(previews.length,8);
 for(const p of previews){
  const {request,lesson}=JSON.parse(fs.readFileSync(`public/previews/v1/${p.slug}.json`,'utf8'));
  schema.lessonRequestSchema.parse(request);full.parse(lesson);
  validateReading(lesson.reading.value,request.level);validateListening(lesson.listening.value,request.level,request.studentAge);
  const checks=runQualityControl(lesson,request);assert.deepEqual(checks.filter(c=>c.status!=='pass'),[],p.slug+' quality');
  assert.equal(lesson.lessonPlan.stages.reduce((sum,s)=>sum+s.time,0),request.durationMinutes);
  for(const [doc,teachers] of [[lesson.worksheet.student,lesson.worksheet.teacher.sections],[lesson.worksheet.studentB,lesson.worksheet.teacherB]]){
   assert.equal(doc.sections.length,teachers.length);
   doc.sections.forEach((s,i)=>{assert.equal(s.label,teachers[i].label);assert.equal(s.items.length,teachers[i].answers.length);s.items.forEach(item=>{if(item.visual)assert.ok(pictureSvg(item.visual));});});
   assert.ok(!JSON.stringify(doc).includes(lesson.listening.value.script),'Transcript must stay in teacher copy');
  }
  assert.notDeepEqual(lesson.worksheet.student.sections,lesson.worksheet.studentB.sections,'A/B must differ');
  for(const slide of lesson.presentation.slides){const student=studentPresentationSlide(slide);assert.ok(!JSON.stringify(student).includes(slide.teacherNote));assert.ok(!student.teacherNote);}
  for(const q of lesson.listening.value.questions){assert.ok(q.choices.includes(q.answer));assert.ok(lesson.listening.value.script.includes(q.evidence));}
  console.log(`${p.level} ${p.title}: schema, evidence, timing, pictures, A/B keys, audience and quality passed.`);
 }
}finally{await vite.close();}
