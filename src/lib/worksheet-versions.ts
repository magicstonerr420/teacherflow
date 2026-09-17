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
function questions(doc:any):string[]{
 return (doc?.sections??[]).flatMap((s:any)=>(s.items??[]).map((i:any)=>JSON.stringify([clean(s.passage),clean(i.prompt),clean(i.visual),(i.choices??[]).map(clean).sort(),(s.wordBank??[]).map(clean).sort()])));
}
export function alternateWorksheetIssue(a:any,b:any):string|null{
 const original=questions(a),alternate=questions(b);
 if(!original.length||!alternate.length)return null;
 const available=new Map<string,number>();for(const q of original)available.set(q,(available.get(q)??0)+1);
 let repeated=0;for(const q of alternate){const n=available.get(q)??0;if(n){repeated++;available.set(q,n-1);}}
 if(repeated/alternate.length>=0.5)return 'Version B repeats at least half of Version A. Keep the objective and difficulty, but use different situations, clues and questions. Renumbering, rearranging choices or changing the title is not a new version.';
 return null;
}
export const ALTERNATE_RULES='VERSION B: Use Version A only as a difficulty and objective reference. More than half the questions must have genuinely new content: different clues, sentences, situations or tasks. Do not copy, renumber or merely reorder Version A. Supply answers to the new questions only. Keep target vocabulary and grammar aligned with the same lesson.';
