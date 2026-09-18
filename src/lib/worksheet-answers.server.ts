import {z} from 'zod';
import {MASTER_SYSTEM_PROMPT,renderLessonContext,type LessonRequest} from '../config/teacherflow-prompt';
import {worksheetTeacherSectionSchema,type LessonPackage,type Worksheet} from './lesson-schema';
import {answerAlignmentIssues,type GenerationStage} from './generation-plan';
import {READING_HANDOFF} from './reading';
import {LISTENING_HANDOFF} from './listening';
import {isNoTechRequest} from './no-tech';
import {LessonGenerationError} from './ai-service.server';

type Generate = (args:{schema:z.ZodTypeAny;schemaName:string;system:string;input:string;noTech:boolean})=>Promise<unknown>;
const sectionId=(index:number)=>`section_${index+1}`;
const itemId=(index:number)=>`item_${index+1}`;

/** Key each answer to a printed question so compound/open tasks cannot change the array length. */
export async function generateWorksheetAnswers(request:LessonRequest,prior:Partial<LessonPackage>,stage:Extract<GenerationStage,'teacher'|'teacherB'>,generate:Generate):Promise<Partial<LessonPackage>> {
  const doc=stage==='teacher'?prior.worksheet?.student:prior.worksheet?.studentB;
  if(!doc)throw new LessonGenerationError('missing_worksheet','Generate the student worksheet before its answer key.');
  let sections:Worksheet['teacherB']=[];
  let overview='',groupWorkGuidance='';
  function patch():Partial<LessonPackage>{
    if(stage==='teacherB')return {worksheet:{teacherB:sections} as Worksheet};
    return {
      worksheet:{teacher:{overview,groupWorkGuidance,sections}} as Worksheet,
      answerKey:{sections:sections.map(section=>({title:section.title,answers:[...section.answers],notes:[section.explanation,section.teacherNotes].filter(Boolean).join('\n\n')}))},
    };
  }
  if(!doc.sections.length)return patch();
  const context=`${renderLessonContext(request)}\nTAUGHT LANGUAGE\n${JSON.stringify(prior.overview)}\nEXACT STUDENT WORKSHEET TO ANSWER\n${JSON.stringify(doc)}`;
  const system=MASTER_SYSTEM_PROMPT+(prior.reading?'\n'+READING_HANDOFF:'')+(prior.listening?'\n'+LISTENING_HANDOFF:'');
  let repairIndices=doc.sections.map((_,index)=>index);
  let issues:ReturnType<typeof answerAlignmentIssues>=[];
  for(let attempt=0;attempt<2;attempt++){
    const shape:Record<string,z.ZodTypeAny>={};
    for(const index of repairIndices){
      const section=doc.sections[index]!;
      shape[sectionId(index)]=worksheetTeacherSectionSchema.omit({label:true,title:true,answers:true}).extend({
        answers:z.object(Object.fromEntries(section.items.map((_,item)=>[itemId(item),z.string().trim().min(1)]))).strict(),
      }).strict();
    }
    const sectionSchema=z.object(shape).strict();
    const schema=attempt===0?z.object({overview:z.string(),groupWorkGuidance:z.string(),sections:sectionSchema}).strict():z.object({sections:sectionSchema}).strict();
    const repair=attempt===0?'':`\nPREVIOUS ANSWERS TO CORRECT\n${JSON.stringify(repairIndices.map(index=>({responseKey:sectionId(index),...sections[index]})))}\nALL VALIDATION ISSUES TO FIX\n${issues.map(issue=>issue.message).join('\n')}\nReturn only these corrected sections: ${repairIndices.map(sectionId).join(', ')}. Other sections are retained.`;
    const raw=await generate({
      schema,schemaName:`teacherflow_${stage}${attempt?'_repair':''}`,system,noTech:isNoTechRequest(request.technologyAvailable),
      input:`${context}\nCURRENT PART: ${stage}. Return only the keyed answer contract in the response schema, not a worksheet or a second answer-key array. section_N is the Nth printed section; item_N is the Nth question within that section (use position even if printed numbers restart or differ). Every item key is required. Answer each printed question independently. Keep all parts of a compound question together inside that one item's answer string. For open speaking, writing, personal and workshop tasks, give an individual acceptable-response rule and, when useful, a model response; accept other valid responses. Do not replace these tasks with one fixed correct opinion. Put extra guidance in explanation/expectedResponses/teacherNotes, never in additional answers. For closed items give the exact printed option or word-bank entry, keeping explanations separate. Use the actual passage and visual clue, and preserve singular/plural grammar. Do not change student questions, section order or task difficulty. Never substitute another version's questions.${repair}`,
    });
    const result=schema.parse(raw) as {overview?:string;groupWorkGuidance?:string;sections:Record<string,Omit<Worksheet['teacherB'][number],'label'|'title'|'answers'>&{answers:Record<string,string>}>};
    if(attempt===0){overview=result.overview??'';groupWorkGuidance=request.groupWorkEnabled?result.groupWorkGuidance??'':'';}
    for(const index of repairIndices){
      const section=doc.sections[index]!,answer=result.sections[sectionId(index)]!;
      sections[index]={...answer,label:section.label,title:section.title,answers:section.items.map((_,item)=>answer.answers[itemId(item)]!)};
    }
    issues=answerAlignmentIssues(stage,prior,patch());
    if(!issues.length)return patch();
    repairIndices=[...new Set(issues.map(issue=>issue.section))];
  }
  // Log positions/rules only, never the worksheet, answers, teacher identity or credentials.
  console.warn('TeacherFlow answer alignment',{stage,issues:issues.map(({section,item,rule})=>({section,item,rule}))});
  throw new LessonGenerationError('answer_alignment','The answer key still needs corrections to match the worksheet questions and clues. Your worksheet is retained. Retry this part.');
}
