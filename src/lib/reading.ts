import { z } from "zod";
import { prepareReadingVisuals } from './reading-visuals';
import type { LessonPackage, LessonRequestInput, Worksheet } from "./lesson-schema";

export const READING_MODEL = "deepseek/deepseek-v4-flash-0731";
const text = z.string().trim().min(1);
export const readingSchema = z.object({
  cefr: z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]),
  title: text, purpose: text, instructions: text,
  word_count: z.number().int().positive(), text,
  questions: z.array(z.object({
    type: z.enum(["main_idea", "supporting_details", "true_false", "short_answer", "vocabulary_in_context", "inference", "sequencing", "scanning", "matching", "identifying_opinion"]),
    question: text, choices: z.array(text), evidence: text, answerExplanation: text,
  })).min(1).max(8),
  answers: z.array(text).min(1).max(8),
  activity: text, assessment: text,
}).strict();
export type Reading = z.infer<typeof readingSchema>;
export type ReadingState = { status: "ready"; value: Reading; fingerprint: string } | { status: "failed"; error: string };
export const READING_LABEL = "Reading • DeepSeek";

/** Gemini checks only its own worksheet questions; DeepSeek's validated answers are inserted afterwards. */
export function withoutReadingSections(lesson: Partial<LessonPackage>): Partial<LessonPackage> {
  if (!lesson.worksheet) return lesson;
  const { reading: _reading, ...core } = lesson;
  const w = lesson.worksheet;
  const doc = (value: Worksheet["student"]) => value ? { ...value, sections: value.sections.filter(s => s.label !== READING_LABEL) } : value;
  return { ...core, ...(lesson.answerKey ? { answerKey: { sections: lesson.answerKey.sections.filter(s => s.notes !== READING_LABEL) } } : {}), worksheet: { ...w, student: doc(w.student), studentB: doc(w.studentB),
    teacher: w.teacher ? { ...w.teacher, sections: w.teacher.sections.filter(s => s.label !== READING_LABEL) } : w.teacher,
    teacherB: w.teacherB?.filter(s => s.label !== READING_LABEL),
  } };
}

export const READING_HANDOFF = `Dedicated reading materials are supplied by DeepSeek separately. Do not author new reading passages or reading-comprehension sections, including alternate, support or challenge readings. For student worksheets A and B, every passage field MUST be the empty string. Do not even copy the supplied DeepSeek reading into a worksheet section: the server inserts it afterwards. Build the core worksheet from vocabulary, language recognition and independent application exercises. Do not create questions that depend on a passage that you omit. Keep existing dedicated reading text and questions fixed. Build other practice around the same objective. If reading is ready, align activities and assessment with its purpose and skill, without copying its passage-specific questions or answers into other student sections. If it failed, do not invent a replacement or ask students to use a missing passage; retain useful independent practice. When producing teacher keys, answer existing questions in order; dedicated reading answers are supplied and will be preserved.`;

export function integrateReadingPatch(prior: Partial<LessonPackage>, patch: Partial<LessonPackage>): Partial<LessonPackage> {
  const state = patch.reading ?? prior.reading;
  if (!state || state.status !== "ready" || !patch.worksheet) return patch;
  const emptyDoc = { title: "", instructions: "", sections: [] };
  const worksheet = Object.assign({ title: "Worksheet", student: emptyDoc, studentB: emptyDoc,
    teacher: { overview: "", groupWorkGuidance: "", sections: [] }, teacherB: [] },
    prior.worksheet, patch.worksheet);
  const full = applyReading({ ...prior, ...patch, worksheet, answerKey: patch.answerKey ?? prior.answerKey ?? { sections: [] } } as LessonPackage, state);
  return { ...patch, worksheet: full.worksheet, answerKey: full.answerKey, reading: state };
}

export function needsReading(request: LessonRequestInput, lesson: Partial<LessonPackage>) {
  if (/reading/i.test(`${request.mainSkill} ${request.secondarySkill ?? ""}`) ||
    /\b(read|reading|scan|skim)\b/i.test(request.learningObjective)) return true;
  // A teacher reading listening instructions aloud does not make this a reading lesson.
  return (lesson.lessonPlan?.stages ?? []).some(stage =>
    /\b(read|reading|scan|skim)\b[^.!?\n]{0,60}\b(passage|text|story|article|notice|email|letter)\b/i.test(stage.studentActions));
}

/** Only relevant inputs: unrelated slide/formatting edits never invalidate the cache. */
export function readingContext(request: LessonRequestInput, lesson: Partial<LessonPackage>) {
  return {
    studentAge: request.studentAge, cefr: request.level, topic: request.topic,
    learningObjective: request.learningObjective, mainSkill: request.mainSkill,
    secondarySkill: request.secondarySkill, targetVocabulary: request.requiredVocabulary ?? "",
    targetLanguageAndGrammar: lesson.overview?.keyLanguage ?? [],
    previousKnowledge: request.previousKnowledge ?? "", progression: lesson.lessonPlan,
    successCriteria: lesson.overview?.successCriteria ?? [],
    teachingContext: { technology: request.technologyAvailable, style: request.teachingStyle,
      numberOfStudents: request.numberOfStudents, groupWork: request.groupWorkEnabled,
      studentsPerGroup: request.studentsPerGroup, limitations: request.classroomLimitations,
      notes: request.teacherNotes, textbook: request.textbookUnit, standard: request.curriculumStandard },
    readingPurpose: "Choose only the reading purpose and question types that directly demonstrate this learning objective and success criteria.",
  };
}

export function validateReading(value: unknown, level: string): Reading {
  const parsed = readingSchema.safeParse(value);
  if (!parsed.success) throw new Error("DeepSeek returned an invalid reading: missing or invalid text, questions, answers, or CEFR.");
  const reading = parsed.data;
  if (reading.cefr !== level) throw new Error("DeepSeek returned the wrong CEFR level.");
  if (reading.questions.length !== reading.answers.length) throw new Error("DeepSeek did not provide one answer per reading question.");
  const normalize = (text: string) => text.normalize("NFKC").replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"').replace(/\s+/gu, " ").trim().replace(/^"|"$/gu, "").toLowerCase();
  const missing = reading.questions.findIndex(q => !normalize(reading.text).includes(normalize(q.evidence)));
  if (missing !== -1) throw new Error(`Reading question ${missing + 1} cites evidence absent from the passage: ${reading.questions[missing]!.evidence}. Copy ONE continuous sentence directly from the supplied passage; do not summarize, join separate sentences with ellipses, or add words. Revise the question if the passage does not support it.`);
  // A model can select the wrong choice index while quoting/explaining the right
  // choice. Correct only unambiguous, positive, literal detail questions.
  const phrase = (s: string) => ` ${normalize(s).replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
  const answers = reading.answers.map((answer, i) => {
    const q = reading.questions[i]!;
    if (!['supporting_details', 'scanning', 'short_answer'].includes(q.type) || /\b(not|except|false|incorrect|least|never|isn't|doesn't|didn't)\b/i.test(q.question)) return answer;
    const supported = q.choices.filter(c => phrase(q.evidence).includes(phrase(c)) && phrase(q.answerExplanation).includes(phrase(c)));
    return supported.length === 1 ? supported[0]! : answer;
  });
  return prepareReadingVisuals({ ...reading, answers, word_count: reading.text.split(/\s+/u).length });
}

/** Integrate through existing printable worksheet contracts. Answers never enter student documents. */
export function applyReading(lesson: LessonPackage, state: ReadingState): LessonPackage {
  if (state.status !== "ready") return { ...lesson, reading: state };
  const r = prepareReadingVisuals(state.value);
  state = { ...state, value: r };
  const studentSection: Worksheet["student"]["sections"][number] = {
    label: READING_LABEL, title: r.title, format: "reading", instructions: r.instructions,
    passage: r.text, wordBank: [], items: r.questions.map((q, i) => ({
      number: i + 1, prompt: q.question, choices: q.choices, answerLines: 2, visual: "",
    })),
  };
  const teacherSection: Worksheet["teacher"]["sections"][number] = {
    label: READING_LABEL, title: r.title, answers: r.answers,
    explanation: r.purpose, expectedResponses: r.questions.map((q, i) => `${i + 1}. Evidence: ${q.evidence} Explanation: ${q.answerExplanation}`), commonErrors: [], corrections: [],
    teacherNotes: `Reading activity: ${r.activity}\nAssessment: ${r.assessment}`,
  };
  // Place reading after the opening practice, before subsequent application tasks.
  const append = <T extends { label: string }>(sections: T[], item: T) => {
    const other = sections.filter(s => s.label !== READING_LABEL);
    other.splice(Math.min(1, other.length), 0, item);
    return other;
  };
  const w = lesson.worksheet;
  const hasB = !!w.studentB?.sections.length;
  return { ...lesson, reading: state, worksheet: { ...w,
    student: { ...w.student, sections: append(w.student.sections, studentSection) },
    teacher: { ...w.teacher, sections: append(w.teacher.sections, teacherSection) },
    studentB: hasB ? { ...w.studentB, sections: append(w.studentB.sections, studentSection) } : w.studentB,
    teacherB: hasB ? append(w.teacherB, teacherSection) : w.teacherB,
  }, answerKey: { sections: [
    ...lesson.answerKey.sections.filter(s => s.notes !== READING_LABEL && s.title !== r.title && s.title !== (lesson.reading?.status === "ready" ? lesson.reading.value.title : "")),
    { title: r.title, answers: r.answers, notes: READING_LABEL },
  ] } };
}

export function prepareLessonReading<T extends Pick<LessonPackage, 'worksheet' | 'answerKey'> & Partial<LessonPackage>>(lesson: T): T {
  if (lesson.reading?.status !== 'ready') return lesson;
  const value = prepareReadingVisuals(lesson.reading.value);
  return value === lesson.reading.value ? lesson : applyReading(lesson as LessonPackage, { ...lesson.reading, value }) as T;
}
