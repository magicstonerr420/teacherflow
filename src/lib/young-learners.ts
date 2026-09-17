export const isYoungA1 = (r: { studentAge: string; level: string }) =>
  r.level === "A1" && /^5\s*[-–]\s*7$/.test(r.studentAge.trim());

// Original, print-safe line illustrations. No labels or answer text in the image.
const parts: Record<string, string> = {
  sun: '<circle cx="50" cy="50" r="22" fill="#ffdc66"/><path d="M50 5v13m0 64v13M5 50h13m64 0h13M18 18l10 10m44 44 10 10M18 82l10-10m44-44 10-10" stroke="#c47600" stroke-width="4" fill="none"/>',
  rain: '<path d="M20 52C2 52 4 28 24 28C28 6 57 9 62 25C85 14 101 48 80 52Z" fill="#d6e2ec"/><path d="M24 63l-9 15m32-15-9 15m32-15-9 15m-26 3-7 11m30-11-7 11m32-29-7 11" stroke="#166791" stroke-width="4" fill="none"/>',
  shirt: '<path d="M31 17L9 32l12 20 13-8v43h32V44l13 8 12-20-22-15-10-4H41Z" fill="#81c5df"/><path d="M41 13q9 19 18 0M34 76h32M22 32l-8 6m64-6 8 6" fill="none"/>',
  shoes: '<path d="M12 23h21l10 12 35 8q14 3 13 16H9Z" fill="#c89566"/><path d="M9 53h82v8H9Z" fill="white"/><path d="M25 23v13h18m2 2-4 8m15-5-4 8m15-5-4 8" fill="none"/><path d="M10 62h21l10 12 35 8q14 3 13 12H7Z" fill="#c89566"/><path d="M7 89h82v8H7Z" fill="white"/><path d="M23 62v13h18m2 2-4 8m15-5-4 8m15-5-3 6" fill="none"/>',
  hat: '<ellipse cx="50" cy="72" rx="43" ry="15" fill="#f3c46d"/><path d="M25 69l5-40q20-13 40 0l5 40q-25 13-50 0Z" fill="#f3c46d"/><path d="M27 53q23 12 46 0l2 16q-25 13-50 0Z" fill="#e77f72"/>',
  cow: '<path d="M28 27L15 10l23 9m34 8 13-17-23 9" fill="#e8cc92"/><path d="M25 30L7 26q-5 23 22 17m46-13 18-4q5 23-22 17" fill="#ffd1cb"/><ellipse cx="50" cy="50" rx="30" ry="34" fill="white"/><path d="M30 25q22-16 20 15L27 51Z" fill="#76513d"/><circle cx="38" cy="48" r="3"/><circle cx="65" cy="48" r="3"/><ellipse cx="50" cy="72" rx="25" ry="15" fill="#f6b8ac"/><circle cx="41" cy="72" r="3"/><circle cx="59" cy="72" r="3"/>',
  pig: '<path d="M24 37L18 9l25 12m33 16 6-28-25 12" fill="#f6b8c2"/><circle cx="50" cy="52" r="33" fill="#f6b8c2"/><circle cx="36" cy="46" r="3"/><circle cx="64" cy="46" r="3"/><ellipse cx="50" cy="66" rx="21" ry="15" fill="#ef8fa0"/><circle cx="43" cy="65" r="3"/><circle cx="57" cy="65" r="3"/>',
  duck: '<ellipse cx="47" cy="70" rx="33" ry="19" fill="#ffdc66"/><circle cx="61" cy="36" r="22" fill="#ffdc66"/><path d="M77 34l19 9-21 6" fill="#ef943d"/><circle cx="65" cy="30" r="3"/><path d="M31 65q11 20 30 3" fill="none"/>',
  sheep:
    '<path d="M24 48L6 43q2 17 22 13m48-8 18-5q-2 17-22 13" fill="#d8ac8a"/><path d="M23 38Q9 16 33 18Q42 0 52 16Q75 3 77 24Q96 32 77 45Z" fill="white"/><ellipse cx="50" cy="61" rx="27" ry="30" fill="#d8ac8a"/><circle cx="39" cy="57" r="3"/><circle cx="61" cy="57" r="3"/><path d="M44 76q6 5 12 0" fill="none"/>',
  horse:
    '<path d="M27 38L25 5l17 18m30 15 3-33-17 18" fill="#b88855"/><path d="M30 31Q50 4 73 31L78 75Q50 101 22 75Z" fill="#c99761"/><path d="M31 27Q53 4 62 24l-9 27-7-21-13 14Z" fill="#76513d"/><circle cx="36" cy="52" r="3"/><circle cx="66" cy="52" r="3"/><ellipse cx="50" cy="78" rx="26" ry="13" fill="#ead0a5"/><circle cx="39" cy="77" r="3"/><circle cx="61" cy="77" r="3"/>',
  head: '<path d="M32 82v-14C12 48 22 14 50 14s38 34 18 54v14" fill="#ffd9b3"/><path d="M23 35Q28 6 55 13Q78 15 79 35" fill="#76513d"/><circle cx="39" cy="43" r="3"/><circle cx="61" cy="43" r="3"/><path d="M39 58q11 10 22 0" fill="none"/>',
  eye: '<path d="M10 50Q50 9 90 50Q50 91 10 50Z" fill="white"/><circle cx="50" cy="50" r="17" fill="#71c7dc"/><circle cx="50" cy="50" r="8"/><circle cx="55" cy="44" r="3" fill="white"/>',
  hand: '<path d="M32 89L13 59Q8 48 17 46L30 59V25Q30 14 38 18V49V13Q38 4 46 13V47V14Q47 5 55 14V48V23Q56 14 64 23V60L73 44Q80 37 85 45L71 77Q65 89 58 90Z" fill="#ffd9b3"/>',
  arm: '<path d="M27 22v40q0 10 10 10h35" stroke="#243c4c" stroke-width="23" fill="none"/><path d="M27 22v40q0 10 10 10h35" stroke="#ffd9b3" stroke-width="18" fill="none"/><path d="M16 9h22v22H16Z" fill="#71c7dc"/><path d="M64 63h12q12 0 12 9v5q0 8-12 8H64Z" fill="#ffd9b3"/><path d="M66 71q1-8 8-8l3 9m4-5v8" fill="none"/>',
  leg: '<path d="M32 10h31l-5 37-7 30 27 5q11 7 0 12H28l5-20-7-27Z" fill="#ffd9b3"/><path d="M32 10h31l-3 21H28Z" fill="#71c7dc"/>',
  foot: '<path d="M34 14h29v43l19 18q14 15-2 18H21Q7 89 17 78l17-16Z" fill="#ffd9b3"/><path d="M22 80h14m5 0h8m5 0h8" fill="none"/>',
  ear: '<path d="M40 78C5 35 36 4 65 15s25 48 8 57c-9 5-6 19-18 18-10 0-15-5-15-12Z" fill="#ffd9b3"/><path d="M39 47c-12-32 36-35 27-5-3 9-18 3-17 18" fill="none"/>',
  nose: '<path d="M43 14L26 65Q14 84 37 82Q50 92 63 82Q86 84 74 65L57 14" fill="#ffd9b3"/><path d="M32 77q8-9 13 1m10 0q8-10 14-1" fill="none"/>',
  mouth:
    '<path d="M12 49Q31 20 50 36Q69 20 88 49Q51 91 12 49Z" fill="#f69da8"/><path d="M12 49Q50 64 88 49" fill="none"/>',
};
export const BODY_VISUALS = ["head", "eye", "hand", "arm", "leg", "foot", "ear", "nose", "mouth"];
const glyphs: Record<string, string> = {
  star: "★",
  heart: "♥",
  smile: "☺",
  rocket: "🚀",
  ball: "⚽",
  car: "🚗",
  cat: "🐱",
  dog: "🐶",
  bird: "🐦",
  fish: "🐟",
  tree: "🌳",
  flower: "🌸",
  apple: "🍎",
  cake: "🍰",
  book: "📕",
  pencil: "✏",
  school: "🏫",
  house: "🏠",
  clock: "🕒",
  music: "♪",
  game: "🎲",
  gift: "🎁",
  balloon: "🎈",
  rainbow: "🌈",
};
export const PICTURE_KEYS = [...Object.keys(parts), ...Object.keys(glyphs)];
export function pictureSvg(keyword: string): string | null {
  const key = keyword
    .trim()
    .toLowerCase()
    .replace(/^(a |an |the |my |your )/, "")
    .replace(/^(eyes|ears|arms|legs|hands|feet)$/, (s) => (s === "feet" ? "foot" : s.slice(0, -1)));
  const drawing =
    parts[key] ||
    (glyphs[key]
      ? `<text x="50" y="75" text-anchor="middle" font-family="Segoe UI Emoji, sans-serif" font-size="64" stroke="none">${glyphs[key]}</text>`
      : null);
  return drawing
    ? `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 100 100"><rect width="100" height="100" rx="8" fill="white"/><g stroke="#243c4c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${drawing}</g></svg>`
    : null;
}
export const pictureUrl = (keyword: string) => {
  const svg = pictureSvg(keyword);
  return svg ? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg) : null;
};
export async function picturePng(keyword: string): Promise<string | null> {
  const url = pictureUrl(keyword);
  if (!url) return null;
  const img = new Image();
  img.src = url;
  await img.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 400;
  canvas.height = 400;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw Error("Could not prepare printable illustration");
  ctx.drawImage(img, 0, 0, 400, 400);
  return canvas.toDataURL("image/png");
}

export const YOUNG_A1_RULES = `
SPECIAL REQUIREMENTS ONLY FOR A1 AGES 5-7 (override generic visual restrictions):
Use short, concrete instructions and supplied clues that children can understand.
Every closed question must have ONE identifiable answer from the printed clue and choices.
Never use an unqualified "Touch your ____", "Point to your ____" or "Show me your ____" as a written gap task: supply a specific item.visual picture cue or a discriminating clue.
Never disguise copying as matching ("This word is for your eye: ____", "hand -> hand").
A matching task must present genuinely different clues and options; a naming task can say "Look. Write the word." with a picture and word bank.
For body vocabulary, supported printable item.visual keywords are: ${BODY_VISUALS.join(", ")}. Use them on EVERY item that depends on a body picture, including Version B. Each visual must identify the correct answer, not simply match the topic. These pictures are included in the worksheet and PDF automatically.
For farm vocabulary, printable picture cues cow, pig, duck, sheep and horse are also available on every item that needs one.
For weather and clothes, sun, rain, shirt, shoes and hat are supplied printable illustrations. Use these exact keywords when an item needs these pictures; the teacher does not have to draw or source them.
Use grammatically correct word-bank frames: sun and rain are nouns, while sunny and rainy are adjectives. Never make a child fill "It is ___" with sun or rain; use "I see the ___" or a picture-naming task. If multiple clothes suit a weather condition, add a specific body-part or situation clue for a single-answer question, or explicitly accept multiple appropriate answers. A hat can shade the head from sun; shoes cover feet. Do not teach that an ordinary shirt or sun hat keeps someone dry in rain. Do not force arbitrary one-to-one weather/clothing matches.
For other topics, use only these supported picture keywords: ${PICTURE_KEYS.join(", ")}; if no supplied picture can identify an answer, write a self-contained meaningful task instead of referring to an absent picture.
Section C must practice a useful distinct task aligned to the objective, not repeat Section B's word-copy task. For example, recognize a word among options after practicing writing it; only use action vocabulary if those actions were taught. Do not add unknown language just to make a task different.
Keep slide studentText/bullets concise. Put adult instructions in teacherNote, not studentText. Slides should teach one idea each.
If any plan, activity or presentation mentions flashcards, include each required word in presentation vocabulary with its own imagePrompt. Use at most five target flashcard words for this age. The application supplies picture-front/word-back cards; never tell the teacher to draw or source cards.
`;

export function youngWorksheetIssues(doc: any): string[] {
  const issues: string[] = [];
  for (const section of doc?.sections ?? [])
    for (const item of section.items ?? []) {
      const hasPicture = !!pictureSvg(item.visual || "");
      if (item.visual?.trim() && !hasPicture)
        issues.push(
          `${section.label} item ${item.number}: unsupported picture '${item.visual}'. Use a supported picture (${PICTURE_KEYS.join(", ")}) or a self-contained text clue.`,
        );
      if (/(?:touch|point to|show me)\s+(?:your|my)\s+_+/i.test(item.prompt) && !hasPicture)
        issues.push(
          `${section.label} item ${item.number}: missing picture clue for an ambiguous blank`,
        );
      if (/this word is for (?:your|the)\b/i.test(item.prompt))
        issues.push(
          `${section.label} item ${item.number}: replace circular word-copy clue with a meaningful task`,
        );
      const task = `${section.instructions ?? ''} ${item.prompt ?? ''}`;
      const explicitlyNeedsPicture = /\b(?:look\s+at|name|label|match|circle|choose|point\s+to|color|identify|find|use|describe)\b[^.!?]{0,70}\b(?:picture|image|illustration|drawing)s?\b/i.test(task);
      // "Look. Circle the weather word: sun / shirt" supplies its own clue.
      // A bare "Look. Write." still needs a picture or a supplied text resource.
      const hasTextResource = !!section.passage?.trim() || /\b(?:read|sentence|clue|passage|text|weather\s+word|clothing\s+word|clothes\s+word|spelling)\b|\bword\s+["'“‘]/i.test(task);
      const bareLookTask = /\blook[.!]\s*(?:write|circle)\b/i.test(task) && !hasTextResource;
      if ((explicitlyNeedsPicture || bareLookTask) && !hasPicture)
        issues.push(`${section.label} item ${item.number}: refers to a missing picture`);
    }
  return issues;
}

export function youngPresentationIssues(presentation: any, context: any): string[] {
  if (
    !/flash[ -]?cards?/i.test(
      JSON.stringify([context?.overview, context?.lessonPlan, context?.activity, presentation]),
    )
  )
    return [];
  const vocabulary = (presentation?.slides ?? []).flatMap((s: any) => s.vocabulary ?? []);
  if (!vocabulary.length)
    return [
      "The lesson requires flashcards but the presentation has no vocabulary entries. Include every required card word and imagePrompt in vocabulary slides.",
    ];
  const unknown = vocabulary.filter(
    (v: any) => !pictureSvg(v.word || "") && !v.imagePrompt?.trim(),
  );
  const issues = unknown.map(
    (v: any) => `Flashcard ${v.word}: provide an imagePrompt because no built-in picture exists.`,
  );
  if (
    new Set(vocabulary.filter((v: any) => !pictureSvg(v.word || "")).map((v: any) => v.imagePrompt))
      .size > 6
  )
    issues.push(
      "The lesson requires more than six original flashcard pictures. Limit target flashcard words to five for this age.",
    );
  return issues;
}
