import { isYoungA1 } from "./young-learners.ts";

/** The client and beta quota guard must select the same six authorised prompts. */
export function lessonImagePrompts(
  lesson: any,
  request?: { studentAge: string; level: string },
  max = 6,
): string[] {
  const vocabulary: string[] = [],
    other: string[] = [],
    ordered: string[] = [];
  for (const slide of lesson?.presentation?.slides ?? []) {
    for (const v of slide.vocabulary ?? [])
      if (v.imagePrompt) {
        vocabulary.push(v.imagePrompt);
        ordered.push(v.imagePrompt);
      }
    if (slide.imagePrompt && slide.layout !== "vocabulary") {
      other.push(slide.imagePrompt);
      ordered.push(slide.imagePrompt);
    }
  }
  return [...new Set(request && isYoungA1(request) ? [...vocabulary, ...other] : ordered)].slice(
    0,
    max,
  );
}
