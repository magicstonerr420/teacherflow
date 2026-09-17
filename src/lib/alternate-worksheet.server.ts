import { z } from 'zod';
import { MASTER_SYSTEM_PROMPT, renderLessonContext, type LessonRequest } from '../config/teacherflow-prompt';
import { worksheetSchema, worksheetStudentSectionSchema, type LessonPackage } from './lesson-schema';
import { ALTERNATE_RULES, alternateWorksheetIssue, repeatedAlternateItems, removeRepeatedWorksheetSections } from './worksheet-versions';
import { isYoungA1, youngWorksheetIssues, worksheetPictureIssues, PICTURE_KEYS } from './young-learners';
import { READING_HANDOFF, withoutReadingSections } from './reading';
import { LISTENING_HANDOFF, withoutListeningSections } from './listening';
import { isNoTechRequest, findTechTerms } from './no-tech';
import { LessonGenerationError } from './ai-service.server';

type Generate = (args: { schema: z.ZodTypeAny; schemaName: string; system: string; input: string; noTech: boolean }) => Promise<Partial<LessonPackage>>;

const tasks = [
 { format: 'matching', task: 'Match new short concrete clues to taught words in a shared word bank. Print every clue; do not repeat picture-naming questions.' },
 { format: 'short-answer', task: 'Answer new short concrete questions about the taught words in familiar situations. Supply a specific picture or factual clue plus a word bank. Write only one word. Do not give an incorrect statement to correct or ask for sentence writing.' },
 { format: 'multiple-choice', task: 'Check short statements against a supplied picture or explicit factual clue. Circle Yes or No. Include both correct and incorrect statements; each must be decidable from the supplied clue.' },
 { format: 'multiple-choice', task: 'Choose the taught word for a NEW short practical situation. Give two simple choices and a specific distinguishing clue. Never ask which sentence was heard without providing its exact teacher-read text.' },
 { format: 'matching', task: 'Match taught words to NEW uses, actions or descriptions. Put shared options in the word bank; write only the matching word or option letter. Supply all context; use only meanings already taught.' },
];

/** A separate authoring request keeps Version A as a reference, never a template to preserve. */
export async function generateAlternateWorksheet(request: LessonRequest, prior: Partial<LessonPackage>, generate: Generate): Promise<Partial<LessonPackage>> {
 const original = withoutListeningSections(withoutReadingSections(prior)).worksheet?.student;
 if (!original?.sections.length) throw new LessonGenerationError('missing_worksheet', 'Generate Version A before preparing its alternate worksheet.');
 const needsFamilyContext = /\b(?:family|mom|dad|mother|father|brother|sister|baby)\b/i.test(`${request.learningObjective} ${request.requiredVocabulary ?? ''}`) && !prior.reading;
 const personalIntroduction = isYoungA1(request) && /\bname\b/i.test(request.learningObjective) && /\bage\b/i.test(request.learningObjective) && /\bfeel/i.test(request.learningObjective);
 const available = [...tasks];
 const plan = Array.from({ length: 5 }, (_, i) => {
  const different = available.findIndex(t => t.format !== original.sections[i]?.format);
  return { section: `Section ${String.fromCharCode(65+i)}`, ...available.splice(different < 0 ? 0 : different, 1)[0] };
 });
 if (personalIntroduction) {
  const introTasks = [
   {format:'matching',task:'Match names to family roles using an explicit short fictional family story. State who is the mom, dad, brother, sister and baby. Put those five taught role words in the word bank. Do not infer family relationships from gender, size or kindness.'},
   {format:'short-answer',task:'Read five short fictional introductions with different names and ages 1-10. Ask clearly for the name or age in each item. Supply every answer name and number in the word bank. Write one name or number, never "the word for" a person.'},
   {format:'matching',task:'Match five short fictional statements about feelings to happy, sad or okay. Supply each speaker\'s actual feeling explicitly. Use different named speakers. Put the three feeling words in the word bank. No decorative pictures are needed.'},
   {format:'multiple-choice',task:'Print a short profile stating the name, age and feeling of two fictional children. Ask five Yes/No judgments against those facts, mixing true and false statements. State every fact being tested. Leave visual empty so false statements cannot contradict picture clues.'},
   {format:'multiple-choice',task:'Use five complete short exchanges practicing hello/bye, asking a name or age, and feelings. Ask which of two simple replies fits the printed question and supplied speaker facts. Make each exchange distinct. Use only names, numbers 1-10 and simple language taught in this lesson.'},
  ];
  plan.forEach((p,i)=>Object.assign(p,introTasks[i]));
 }
 const section = worksheetStudentSectionSchema.extend({
  items: z.array(worksheetStudentSectionSchema.shape.items.element.extend({
   visual: z.enum(['', ...PICTURE_KEYS] as [string, ...string[]]),
  })).length(5),
  format: z.enum(['matching', 'short-answer', 'multiple-choice']),
  ...(prior.reading ? { passage: z.enum(['']) } : {}),
  ...(needsFamilyContext ? { passage: z.string().min(20).describe(personalIntroduction ? 'A short supplied fictional context with all names, ages, feelings or family relationships needed for this section. The teacher may read it aloud.' : 'A short supplied family context naming people and explicitly stating their relationships. The teacher may read it aloud.') } : {}),
 });
 const schema = z.object({ worksheet: z.object({ studentB: worksheetSchema.shape.studentB.extend({ sections: z.array(section).length(5) }) }) });
 const system = `${MASTER_SYSTEM_PROMPT}\n${prior.reading ? READING_HANDOFF : ''}\n${prior.listening ? LISTENING_HANDOFF : ''}\n${ALTERNATE_RULES}`;
 const brief = `${renderLessonContext(request)}\nLESSON OBJECTIVE AND TAUGHT LANGUAGE\n${JSON.stringify(prior.overview ?? {})}\nCURRENT PART: studentB. Return only worksheet.studentB. Write five sections with five items each. Do not return teacher answers.\nVERSION A — REFERENCE ONLY. These are the assessed examples to avoid repeating, not content to preserve:\n${JSON.stringify(original)}\n${ALTERNATE_RULES}\nREQUIRED ALTERNATE TASK PLAN\n${JSON.stringify(plan)}\nFollow this plan in order, including each section's exact format and learning operation. Do not revert to Version A's sequence of naming pictures and filling gaps. Target at least 20 of the 25 items with new clues, situations or operations, keeping the same level, objective and taught words. Print short student instructions in every section. For matching, put options once in wordBank and leave item.choices empty; include one writing line. For short-answer, use a word bank and one writing line. For multiple-choice, put options in item.choices with zero writing lines. Supply supported item.visual pictures whenever needed. Refer to the supplied picture without spelling out its answer in the prompt. Use an empty passage when no passage is needed. The renderer supplies numbered items, words, images and answer lines, never invented columns, grids or unseen resources. Every closed item must be answerable from its printed clue; the teacher may read that clue aloud. Do not use 'Listen and choose what you hear' with an unspecified utterance. Keep separate listening/reading comprehension out of this core worksheet; it is supplied elsewhere.`;
 let draft: Partial<LessonPackage> | undefined;
 let issues: string[] = [];
 let repairIndices: number[] = [];
 // One initial request and at most two focused repairs; never ask the owner to
 // repeat the same uninformative prompt indefinitely or accept a duplicate.
 for (let attempt = 0; attempt < 3; attempt++) {
  const repairSections = repairIndices.map(i=>section.extend({label:z.literal(plan[i]!.section),format:z.literal(plan[i]!.format!)}));
  const repairItem = repairSections.length > 1 ? z.union([repairSections[0]!,repairSections[1]!,...repairSections.slice(2)]) : repairSections[0];
  const repairSchema = repairItem ? z.object({worksheet:z.object({studentB:worksheetSchema.shape.studentB.extend({sections:z.array(repairItem).length(repairIndices.length)})})}) : schema;
  const next = await generate({ schema:attempt ? repairSchema : schema, schemaName: attempt ? 'teacherflow_alternate_repair' : 'teacherflow_alternate_student', system,
   input: attempt ? `${brief}\nREJECTED VERSION B DRAFT\n${JSON.stringify(draft?.worksheet?.studentB)}\nREPAIR FEEDBACK\n${issues.join('\n')}\nReturn ONLY these replacement sections in worksheet.studentB.sections: ${repairIndices.map(i=>plan[i]!.section).join(', ')}. Keep the existing title and overall instructions. The server preserves every other section unchanged. Replace the repeated or invalid items with complete tasks; do not change labels, option order or punctuation to evade the check. Keep the exact required format for each returned section. Include all necessary printed facts and word-bank answers.` : brief,
   noTech: isNoTechRequest(request.technologyAvailable) });
  if (attempt && draft?.worksheet?.studentB?.sections.length===5 && next.worksheet?.studentB) {
   const current = draft.worksheet.studentB;
   const replacements = next.worksheet.studentB.sections;
   draft = {worksheet:{studentB:{...current,sections:current.sections.map((s,i)=>repairIndices.includes(i) ? replacements.find(r=>r.label===plan[i]!.section) ?? s : s)}}} as Partial<LessonPackage>;
  } else draft = removeRepeatedWorksheetSections(next);
  const doc = draft.worksheet?.studentB;
  const duplicate = alternateWorksheetIssue(original, doc);
  issues = [
   ...(!doc || doc.sections.length !== 5 || doc.sections.some(s => s.items.length !== 5) ? ['Return exactly five distinct sections, with five items each.'] : []),
   ...(doc?.sections.flatMap((s,i) => s.format !== plan[i]?.format ? [`${plan[i]?.section}: use ${plan[i]?.format} and this task: ${plan[i]?.task}`] : []) ?? []),
   ...(duplicate ? [duplicate, `Repeated items to replace: ${repeatedAlternateItems(original, doc).join('; ')}.`] : []),
   ...(isYoungA1(request) ? youngWorksheetIssues(doc) : worksheetPictureIssues(doc)),
   ...(isNoTechRequest(request.technologyAvailable) && findTechTerms(doc).length ? ['Use only printed materials and the board; remove electronic equipment dependencies.'] : []),
  ];
  if (!issues.length) return draft;
  repairIndices = !doc || doc.sections.length!==5 ? [0,1,2,3,4] : doc.sections.flatMap((s,i)=>{
   const itemIssues = isYoungA1(request) ? youngWorksheetIssues({sections:[s]}) : worksheetPictureIssues({sections:[s]});
   const repeatedHere = duplicate && repeatedAlternateItems(original,doc).some(location=>location.startsWith(`section ${i+1}, `));
   return s.items.length!==5 || s.format!==plan[i]?.format || itemIssues.length || repeatedHere || (isNoTechRequest(request.technologyAvailable)&&findTechTerms(s).length) ? [i] : [];
  });
  if (!repairIndices.length) repairIndices=[0,1,2,3,4];
 }
 console.warn('TeacherFlow alternate worksheet validation', { issues });
 throw new LessonGenerationError('alternate_worksheet', 'The alternate worksheet still needs revised questions. Your three completed sections are retained. Retry only this part.');
}
