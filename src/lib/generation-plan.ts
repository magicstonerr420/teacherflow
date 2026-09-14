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
export function answerAlignmentIssue(stage: GenerationStage, prior: Partial<LessonPackage>, patch: Partial<LessonPackage>): string | null {
  if (stage !== "teacher" && stage !== "teacherB") return null;
  const student = stage === "teacher" ? prior.worksheet?.student : prior.worksheet?.studentB;
  const answers = stage === "teacher" ? patch.worksheet?.teacher?.sections : patch.worksheet?.teacherB;
  if (!student || !answers || answers.length !== student.sections.length) return "The answer key must have one section for each student worksheet section, in the same order.";
  for (const [i, section] of student.sections.entries()) {
    if (answers[i]?.answers.length !== section.items.length) return `Answer section ${i + 1} must contain exactly ${section.items.length} separate answers, one for each question. Include an individual acceptable-response rule for each open-ended item; never combine items into one answer.`;
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
