import type { LessonPackage } from './lesson-schema';

/** Models occasionally repeat an entire section verbatim. Preserve every distinct task. */
export function removeRepeatedWorksheetSections(value: Partial<LessonPackage>): Partial<LessonPackage> {
 // Only normalize student-generation patches before their keys are written.
 if (!value.worksheet || value.worksheet.teacher || value.worksheet.teacherB) return value;
 const worksheet = { ...value.worksheet };
 for (const key of ['student', 'studentB'] as const) {
  const doc = worksheet[key];
  if (!doc) continue;
  const seen = new Set<string>();
  worksheet[key] = { ...doc, sections: doc.sections.filter(section => {
   const signature = JSON.stringify(section);
   if (seen.has(signature)) return false;
   seen.add(signature); return true;
  }) };
 }
 return { ...value, worksheet };
}

/** Ignore labels, numbering, spacing and choice order when comparing versions. */
const clean=(value:unknown)=>String(value??'').toLowerCase().replace(/[\p{P}\p{S}]/gu,' ').replace(/\s+/g,' ').trim();
function questions(doc:any):{signature:string;location:string}[]{
 // Dedicated comprehension is intentionally shared; compare the alternate core tasks.
 return (doc?.sections??[]).flatMap((s:any,si:number)=>s.label==='Reading • DeepSeek'||s.label==='Listening'?[]:(s.items??[]).map((i:any,ii:number)=>({signature:JSON.stringify([clean(s.passage),clean(i.prompt),clean(i.visual),(i.choices??[]).map(clean).sort(),(s.wordBank??[]).map(clean).sort()]),location:`section ${si+1}, item ${ii+1}`})));
}
export function repeatedAlternateItems(a:any,b:any):string[]{
 const originals=new Set(questions(a).map(q=>q.signature));
 return questions(b).filter(q=>originals.has(q.signature)).map(q=>q.location);
}
export function alternateWorksheetIssue(a:any,b:any):string|null{
 const original=questions(a),alternate=questions(b);
 if(!original.length||!alternate.length)return null;
 const repeated=repeatedAlternateItems(a,b).length;
 if(repeated/alternate.length>=0.5)return 'Version B repeats at least half of Version A. Keep the objective and difficulty, but use different situations, clues and questions. Renumbering, rearranging choices or changing the title is not a new version.';
 return null;
}
export const ALTERNATE_RULES='VERSION B: Use Version A only as a difficulty and objective reference. More than half the questions must have genuinely new content: different clues, sentences, situations or tasks. Do not copy, renumber, rephrase or merely reorder Version A. Keep target vocabulary and grammar aligned with the same lesson. Reusing the taught words and relevant pictures is expected; vary what children do with them. The coherence rule means the same language and objective, not identical assessed examples. Plan different tasks before writing the items: for example checking picture-word statements instead of naming pictures, choosing from a new concrete clue instead of repeating a gap, or sorting taught words into familiar categories. Do not add untaught vocabulary, harder grammar, unavailable pictures or invented resources just to be different.';
