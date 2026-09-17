import { z } from "zod";
import { foundationSchema, materialsSchema, worksheetSchema, worksheetStudentSectionSchema, worksheetTeacherSectionSchema, WORKSHEET_FORMATS, assessmentSchema, differentiationSchema, type LessonPackage } from "./lesson-schema";

export const GENERATION_PHASES = [
  { key: "foundation", labels: ["Designing lesson progression"] },
  { key: "student", labels: ["Writing the student worksheet"] },
  { key: "teacher", labels: ["Checking answers and teacher guidance"] },
  { key: "studentB", labels: ["Preparing the alternate worksheet"] },
  { key: "teacherB", labels: ["Checking alternate answers"] },
  { key: "presentation", labels: ["Creating the presentation"] },
  { key: "activity", labels: ["Preparing classroom activities"] },
  { key: "assessment", labels: ["Creating assessment and homework"] },
  { key: "differentiation", labels: ["Creating support and challenge activities"] },
] as const;
export type GenerationStage = (typeof GENERATION_PHASES)[number]["key"];
const answerText = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/^\s*\d+[.)]\s*/, '').replace(/[.!?]+$/, '').trim();
const optionLabel = (value: string) => /^\s*(?:\(([a-z])\)|([a-z])[.)])\s+/i.exec(value);
const optionText = (value: string) => answerText(value.slice(optionLabel(value)?.[0].length ?? 0)).replace(/\s+/g, ' ');

/** Compare the same representation on both sides, preserving letter/word agreement. */
function matchesPrintedOption(key: string, options: string[]): boolean {
  key = key.replace(/^\s*\d+[.)]\s+/, '');
  const labeled = optionLabel(key);
  const letter = (labeled?.[1] ?? labeled?.[2] ?? /^\s*\(?([a-z])[.)]?\s*$/i.exec(key)?.[1])?.toLowerCase();
  const clean = optionText(key);
  // A one-letter word (for example the pronoun "I") can itself be a choice.
  if (!labeled && options.some(option => clean === optionText(option))) return true;
  return options.some((option, i) => {
    const printedLabel = optionLabel(option);
    const expectedLetter = (printedLabel?.[1] ?? printedLabel?.[2] ?? String.fromCharCode(97 + i)).toLowerCase();
    if (letter && letter !== expectedLetter) return false;
    if (letter && !labeled) return true;
    const printed = optionText(option);
    return clean === printed || clean.startsWith(printed + ' (') || clean.startsWith(printed + ' —');
  });
}
export function answerAlignmentIssue(stage: GenerationStage, prior: Partial<LessonPackage>, patch: Partial<LessonPackage>): string | null {
  if (stage !== "teacher" && stage !== "teacherB") return null;
  const student = stage === "teacher" ? prior.worksheet?.student : prior.worksheet?.studentB;
  const answers = stage === "teacher" ? patch.worksheet?.teacher?.sections : patch.worksheet?.teacherB;
  if (!student || !answers || answers.length !== student.sections.length) return "The answer key must have one section for each student worksheet section, in the same order.";
  for (const [i, section] of student.sections.entries()) {
    if (answers[i]?.answers.length !== section.items.length) return `Answer section ${i + 1} must contain exactly ${section.items.length} separate answers, one for each question. Include an individual acceptable-response rule for each open-ended item; never combine items into one answer.`;
    for (const [j, item] of section.items.entries()) {
      const key = answers[i].answers[j]?.trim() ?? '';
      const personal = /\b(?:your (?:own )?(?:name|age)|how do you feel|do you like|(?:food|feeling) (?:word )?for today)\b/i.test(item.prompt)
        || /\byour own (?:answers|opinion|preference)\b/i.test(section.instructions)
        || (/^I\s+_+/i.test(item.prompt) && /\blike\b/i.test(section.wordBank.join(' ')));
      const acceptable = /\b(?:accept|own|vary|varies|open|either|any|example|sample|possible)\b|\bor\b/i.test(key)
        || /\bi like\b.*\bi (?:do not|don['’]t) like\b/i.test(key);
      if (personal && !acceptable && !section.passage.trim()) return `Answer section ${i + 1}, item ${j + 1} asks for personal information or a preference. Accept the student's truthful response and give an acceptable-response rule, not a fixed answer.`;
      const oneWord = /\b(?:one|a|the|family|color|shape|food) word\b/i.test(`${section.instructions} ${item.prompt}`);
      const options = item.choices.length ? item.choices : oneWord ? section.wordBank : [];
      if (options.length && !personal && !acceptable) {
        if (!matchesPrintedOption(key, options)) return `Answer section ${i + 1}, item ${j + 1} must match an actual printed choice or word-bank entry: ${options.join(', ')}. Solve this item from its supplied clue.`;
      }
      // A literal cloze whose completed sentence appears once in the supplied passage
      // provides a reliable check without guessing the student's intended answer.
      const cloze = /^(.*?)_+(.*?)[.!?]?\s*$/.exec(item.prompt);
      if (cloze && section.passage.trim()) {
        const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const prefix = (cloze[1] ?? '').trim(), suffix = (cloze[2] ?? '').replace(/[.!?]$/,'').trim();
        const pattern = new RegExp(escape(prefix) + '\\s+([^.!?\\n]+?)' + (suffix ? '\\s+' + escape(suffix) : '') + '(?=[.!?]|$)','gi');
        const expected = [...new Set([...section.passage.matchAll(pattern)].map(m=>answerText(m[1] ?? '')))];
        if (expected.length===1 && !acceptable && answerText(key)!==expected[0]) return `Answer section ${i + 1}, item ${j + 1} contradicts its printed passage. The completed cloze gives "${expected[0]}". Use the actual supplied worksheet, not another version.`;
      }
    }
  }
  return null;
}
export const STAGE_SCHEMAS = {
  foundation: foundationSchema,
  student: z.object({ worksheet: worksheetSchema.pick({ title: true, student: true }) }),
  teacher: z.object({ worksheet: worksheetSchema.pick({ teacher: true }), answerKey: materialsSchema.shape.answerKey }),
  studentB: z.object({ worksheet: worksheetSchema.pick({ studentB: true }) }),
  teacherB: z.object({ worksheet: worksheetSchema.pick({ teacherB: true }) }),
  presentation: materialsSchema.pick({ presentation: true }),
  activity: materialsSchema.pick({ activity: true }),
  assessment: assessmentSchema,
  differentiation: differentiationSchema,
};

const nonReadingSection = worksheetStudentSectionSchema.extend({
  format: z.enum(WORKSHEET_FORMATS.filter(f => f !== "reading") as [string, ...string[]]),
  passage: z.enum([""]),
});
export const readingCoreWorksheetSchema = worksheetSchema.extend({
  student: worksheetSchema.shape.student.extend({ sections: z.array(nonReadingSection) }),
  studentB: worksheetSchema.shape.studentB.extend({ sections: z.array(nonReadingSection) }),
});
export function readingCoreStageSchema(stage: GenerationStage, prior: Partial<LessonPackage>): z.ZodTypeAny {
  if (stage === "student") return z.object({ worksheet: readingCoreWorksheetSchema.pick({ title: true, student: true }) });
  if (stage === "studentB") return z.object({ worksheet: readingCoreWorksheetSchema.pick({ studentB: true }) });
  if (stage === "teacher" || stage === "teacherB") {
    const sections = (stage === "teacher" ? prior.worksheet?.student : prior.worksheet?.studentB)?.sections ?? [];
    const count = sections[0]?.items.length;
    const teacher = count !== undefined && sections.every(s => s.items.length === count)
      ? worksheetTeacherSectionSchema.extend({ answers: z.array(z.string()).length(count) }) : worksheetTeacherSectionSchema;
    const answers = z.array(teacher).length(sections.length);
    return stage === "teacher"
      ? z.object({ worksheet: z.object({ teacher: worksheetSchema.shape.teacher.extend({ sections: answers }) }), answerKey: materialsSchema.shape.answerKey })
      : z.object({ worksheet: z.object({ teacherB: answers }) });
  }
  return STAGE_SCHEMAS[stage];
}

export function mergeLessonPatch(current: Partial<LessonPackage>, patch: Partial<LessonPackage>): Partial<LessonPackage> {
  return { ...current, ...patch, ...(patch.worksheet ? { worksheet: { ...current.worksheet, ...patch.worksheet } } : {}) };
}
