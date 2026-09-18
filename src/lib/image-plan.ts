import { isYoungA1, pictureSvg } from "./young-learners.ts";
import { americanEnglish } from './american-english.ts';

export function vocabularyImagePrompt(word: string, prompt?: string): string {
  return prompt?.trim() ? prompt : word.trim() && !pictureSvg(word)
    ? `A clear classroom picture illustrating the meaning of "${americanEnglish(word.trim())}". Show the concept in context, without written words.` : '';
}

export function needsFlashcards(lesson: any): boolean {
  return /(?:flash|picture)[ -]?cards?/i.test(JSON.stringify([lesson?.overview, lesson?.lessonPlan, lesson?.presentation, lesson?.activity]));
}

/** The client and beta quota guard must select the same six authorised prompts. */
export function lessonImagePrompts(
  lesson: any,
  request?: { studentAge: string; level: string; requiredVocabulary?: string | null | undefined },
  max = 6,
): string[] {
  const vocabulary: string[] = [],
    other: string[] = [],
    ordered: string[] = [],
    required: string[] = [];
  const words = new Set<string>();
  for (const slide of lesson?.presentation?.slides ?? []) {
    for (const v of slide.vocabulary ?? []) {
      const word = String(v.word ?? '').trim();
      words.add(word.toLowerCase());
      const prompt = vocabularyImagePrompt(word, v.imagePrompt);
      if (prompt) {
        vocabulary.push(prompt);
        ordered.push(prompt);
        // Reserve scarce slots for words without built-in pictures, at every age.
        if (word && !pictureSvg(word)) required.push(prompt);
      }
    }
    const scene = slide.imagePrompt ?? slide.visualSuggestion;
    if (scene && slide.layout !== "vocabulary") {
      other.push(scene);
      ordered.push(scene);
    }
  }
  if (needsFlashcards(lesson)) for (const word of (request?.requiredVocabulary ?? '').split(/[,;\n]+/).map(w => w.trim()).filter(Boolean)) {
    if (!words.has(word.toLowerCase()) && !pictureSvg(word)) required.push(vocabularyImagePrompt(word));
  }
  return [...new Set([...required, ...(request && isYoungA1(request) ? [...vocabulary, ...other] : ordered)])].slice(
    0,
    max,
  );
}
