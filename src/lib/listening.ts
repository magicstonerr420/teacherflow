import { z } from 'zod';
import type { LessonPackage, LessonRequestInput, Worksheet } from './lesson-schema';
import { readingContext } from './reading';

const text = z.string().trim().min(1);
export const listeningSchema = z.object({
  cefr: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
  title: text, purpose: text, instructions: text,
  script: text.max(3500), teacherGuidance: text,
  questions: z.array(z.object({ question: text, choices: z.array(text).max(5), answer: text, evidence: text, explanation: text })).min(3).max(5),
}).strict();
export type Listening = z.infer<typeof listeningSchema>;
export type VoiceChoice = 'standard' | 'economy' | 'test';
export type ListeningAudio = { id: string; model: string; voice: string; choice: VoiceChoice; mime: 'audio/mpeg'; accent?: 'en-US' };
export type ListeningState = { status: 'ready'; value: Listening; fingerprint: string; audio?: ListeningAudio } | { status: 'failed'; error: string };
export const LISTENING_LABEL = 'Listening';
export const LISTENING_HANDOFF = `A dedicated listening script and questions are supplied separately. Use this exact script for listening activities. Do not write a competing script, put its transcript on the student worksheet, repeat its questions in the core worksheet, or ask the teacher to find an external recording. The server adds listening questions and the teacher-only script afterwards. If it failed, retain independent practice without referring to a missing recording. For a no-technology class the teacher reads the script aloud; do not require electronic playback.`;

export function needsListening(request: LessonRequestInput) {
  return /listening/i.test(`${request.mainSkill} ${request.secondarySkill ?? ''}`);
}
export function listeningContext(request: LessonRequestInput, lesson: Partial<LessonPackage>) {
  return { ...readingContext(request, lesson), readingPurpose: undefined,
    listeningPurpose: 'Create a self-contained listening activity for this lesson, with about two minutes of spoken American English. Match the age and CEFR independently.' };
}
export function validateListening(value: unknown, level: string, studentAge?: string): Listening {
  const result = listeningSchema.parse(value);
  if (result.cefr !== level) throw new Error('The listening activity has the wrong English level.');
  const count = result.script.split(/\s+/u).length;
  if (count < 160 || count > 300) throw new Error(`The script currently contains ${count} spoken words. Rewrite it to contain 200–240 words (at least 160 and at most 300). Expand the story with simple relevant actions; keep questions answerable. Count only the script, not instructions or questions.`);
  const normalized = (v: string) => v.normalize('NFKC').replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"').replace(/\s+/gu, ' ').trim().toLowerCase();
  if (result.questions.some(q => !normalized(result.script).includes(normalized(q.evidence))))
    throw new Error('Every listening answer needs an exact supporting quote from the script.');
  if (new Set(result.questions.map(q => normalized(q.question))).size !== result.questions.length)
    throw new Error('Listening questions must be distinct.');
  if (result.questions.some(q => q.choices.length && !q.choices.some(c => normalized(c) === normalized(q.answer))))
    throw new Error('A listening answer must match one of its choices exactly; use the full choice, not a letter.');
  // These activities supply written choices, not a set of picture options.
  if (studentAge?.replace(/[–—]/gu, '-') === '5-7' && level === 'A1') {
    result.instructions = 'Listen. Say your answer. For questions with choices, say or circle the correct words.';
    result.teacherGuidance = 'Read each question and its choices aloud. Read or play the story once for meaning and again for details. Pause between questions. Children may answer orally; help them circle the printed words if needed. Do not require written sentences.';
  }
  return result;
}

/** Questions go to students; transcript, evidence and answers stay with the teacher. */
export function applyListening(lesson: LessonPackage, state: ListeningState): LessonPackage {
  if (state.status !== 'ready') return { ...lesson, listening: state };
  const r = state.value;
  const student: Worksheet['student']['sections'][number] = {
    label: LISTENING_LABEL, title: r.title, format: 'short-answer', instructions: r.instructions,
    passage: '', wordBank: [], items: r.questions.map((q, i) => ({ number: i + 1, prompt: q.question, choices: q.choices, answerLines: 2, visual: '' })),
  };
  const teacher: Worksheet['teacher']['sections'][number] = {
    label: LISTENING_LABEL, title: r.title, answers: r.questions.map(q => q.answer),
    explanation: r.purpose, expectedResponses: r.questions.map(q => `${q.evidence} — ${q.explanation}`),
    commonErrors: [], corrections: [], teacherNotes: `Listening script:\n${r.script}\n\n${r.teacherGuidance}`,
  };
  const replace = <T extends { label: string }>(sections: T[], section: T) => [...sections.filter(s => s.label !== LISTENING_LABEL), section];
  const w = lesson.worksheet;
  // The shared listening activity is in A; B remains a different core worksheet.
  return { ...lesson, listening: state, worksheet: { ...w,
    student: { ...w.student, sections: replace(w.student.sections, student) },
    teacher: { ...w.teacher, sections: replace(w.teacher.sections, teacher) },
  }, answerKey: { sections: [...lesson.answerKey.sections.filter(s => s.notes !== LISTENING_LABEL),
    { title: r.title, answers: r.questions.map(q => q.answer), notes: LISTENING_LABEL }] } };
}

export function integrateListeningPatch(prior: Partial<LessonPackage>, patch: Partial<LessonPackage>): Partial<LessonPackage> {
  const state = patch.listening ?? prior.listening;
  if (state?.status !== 'ready' || !patch.worksheet) return patch;
  const empty = { title: '', instructions: '', sections: [] };
  const worksheet = Object.assign({ title: 'Worksheet', student: empty, studentB: empty,
    teacher: { overview: '', groupWorkGuidance: '', sections: [] }, teacherB: [] }, prior.worksheet, patch.worksheet);
  const full = applyListening({ ...prior, ...patch, worksheet, answerKey: patch.answerKey ?? prior.answerKey ?? { sections: [] } } as LessonPackage, state);
  return { ...patch, worksheet: full.worksheet, answerKey: full.answerKey, listening: state };
}

export function withoutListeningSections(lesson: Partial<LessonPackage>): Partial<LessonPackage> {
  if (!lesson.worksheet) return lesson;
  return { ...lesson, worksheet: { ...lesson.worksheet,
    student: lesson.worksheet.student ? { ...lesson.worksheet.student, sections: lesson.worksheet.student.sections.filter(s => s.label !== LISTENING_LABEL) } : lesson.worksheet.student,
    teacher: lesson.worksheet.teacher ? { ...lesson.worksheet.teacher, sections: lesson.worksheet.teacher.sections.filter(s => s.label !== LISTENING_LABEL) } : lesson.worksheet.teacher,
  }, ...(lesson.answerKey ? { answerKey: { sections: lesson.answerKey.sections.filter(s => s.notes !== LISTENING_LABEL) } } : {}) };
}
