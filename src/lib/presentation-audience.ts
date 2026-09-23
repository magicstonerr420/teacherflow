import type { Slide } from './lesson-schema';
import { presentationParagraphs } from './presentation-text.ts';

// Older lessons sometimes store presenter directions in the student task field.
// Keep their original text in the teacher guide; never rewrite the saved lesson.
const teacherLabel = /^(?:teacher(?:'s)?\s+(?:notes?|instructions?|guidance)|teaching\s+(?:notes?|guidance)|answer\s*key|(?:correct|expected|suggested|model)\s+(?:answers?|responses?)|answers?|purpose|visual\s+suggestion)\s*:/i;
const teacherDirection = /^(?:(?:then|next|finally)\s*[,;:]?\s*)?(?:choral\s+drill\b|(?:ask|tell|have|invite|encourage|remind|help|guide|allow|let|get)\s+(?:the\s+)?(?:students?|learners?|pupils?|children|class)\b|(?:monitor|elicit|assess|model|demonstrate|pre-?teach)\b|(?:students|learners|pupils|children)\s+(?!A\b|B\b)|(?:one|each|a|the)\s+student\s+(?:leads?|reads?|answers?|says?|responds?|acts?|performs?)\b)/i;

/** Keep direct learner prompts; omit identifiable facilitation/answer guidance. */
export function studentInteraction(text: string): string {
  const lines = presentationParagraphs(text).flatMap(sentence => sentence.split(/;\s*/));
  return lines.map(line => line.trim()).filter(Boolean).flatMap(line => {
    if (teacherLabel.test(line) || teacherDirection.test(line)) return [];
    // "Ask: Can you jump?" is a useful learner question with a presenter prefix.
    if (/^ask\s*:/i.test(line)) {
      const question = line.replace(/^ask\s*:\s*/i, '').trim();
      return /^(?:can|could|do|does|did|is|are|was|were|have|has|will|would|should|what|which|who|where|when|why|how)\b/i.test(question) && question.endsWith('?') ? [question] : [];
    }
    return [line];
  }).join(' ');
}

/** A separate projection prevents notes from leaking through pagination or exports. */
export function studentPresentationSlide(slide: Slide): Slide {
  return { ...slide, interaction: studentInteraction(slide.interaction), teacherNote: '', purpose: '', visualSuggestion: '' };
}

/** Reject explicit answer/teacher labels misplaced in fields intended for display. */
export function assertStudentPresentation(slides: Slide[]): void {
  for (const slide of slides) {
    const fields = [slide.title, slide.studentText, ...slide.bullets, ...slide.vocabulary.flatMap(word => [word.word, word.definition, word.example])];
    if (fields.some(text => presentationParagraphs(text).some(line => teacherLabel.test(line.trim())))) {
      throw new Error(`Slide ${slide.number} contains teacher guidance or labeled answers in its student text. Move that text to Teacher note before exporting the student PowerPoint.`);
    }
  }
}
