/**
 * Shared "Technology: None" rules.
 *
 * When a teacher says no technology is available, the lesson must be fully
 * teachable with paper, board, markers, the textbook and the teacher's voice.
 * These helpers are used both by the generator (to repair offending output)
 * and by the pre-export quality control (to report it).
 */

/** Terms that imply electronic or digital equipment. */
export const FORBIDDEN_TECH_TERMS = [
  "projector",
  "project the",
  "slideshow",
  "digital presentation",
  "computer",
  "laptop",
  "tablet",
  "smartboard",
  "interactive whiteboard",
  "smart board",
  "phone",
  "smartphone",
  "mobile device",
  "electronic device",
  "digital device",
  "internet",
  "online",
  "website",
  "web site",
  "mobile app",
  "phone app",
  "youtube",
  "qr code",
  "kahoot",
  "video",
  "audio recording",
  "audio file",
  "audio track",
  "listening track",
  "audio recording",
  "speaker system",
  "headphones",
  "on the screen",
  "dvd",
  "cd player",
] as const;

/** True when the teacher's technology input means "none at all". */
export function isNoTechRequest(technologyAvailable?: string | null): boolean {
  const t = (technologyAvailable ?? "").trim().toLowerCase();
  return t === "" || /^(no|none|nothing|board only)/.test(t);
}

/** Every forbidden term that appears anywhere inside the given content. */
export function findTechTerms(content: unknown): string[] {
  const haystack = JSON.stringify(content ?? "").toLowerCase();
  return FORBIDDEN_TECH_TERMS.filter((term) => haystack.includes(term));
}

/** The instruction block appended when regenerating no-tech content. */
export function noTechRepairInstruction(found: string[]): string {
  return `
NO-TECHNOLOGY VIOLATION — REWRITE REQUIRED.
This class has NO technology of any kind, yet your output referenced: ${found.join(", ")}.
Produce the SAME component again, keeping the topic, objective, level, skills, timings,
structure and every non-offending detail identical, but REPLACE each technology-dependent
activity, material, instruction or prerequisite with a genuine physical classroom equivalent:
- a video or audio clip -> the teacher reads a short text aloud, students read a printed text,
  a printed picture sequence, or a role-play between students
- a projector or slideshow -> board work, a printed handout, or wall posters
- an online game or quiz -> a paper game, board race, card sort, or team competition on the board
- an app, website, phone or computer task -> a paper task the students write or draw
Do NOT simply delete the word; the activity must still work and still fill the same time.
The final output must contain NO reference to any electronic or digital equipment.`.trim();
}
