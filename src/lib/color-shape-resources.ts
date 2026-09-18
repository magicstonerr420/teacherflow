import { beginnerPictures, teachingColors, teachingShapes } from './beginner-pictures';
import type { LessonRequestInput, Slide } from './lesson-schema';

type Request = { requiredVocabulary?: string | null | undefined };
export const SHAPE_EXTENSION = 'Explore more colors and shapes';
type Presentation = { slides?: { purpose?: string; vocabulary?: { word: string }[] }[] };

/** Recombine the teacher's target words; prior knowledge is not extra target vocabulary. */
export function colorShapeResources(request: Request, presentation?: Presentation) {
  const targets = new Set<string>((request.requiredVocabulary ?? '').toLowerCase().match(/[a-z]+/g) ?? []);
  const available = Object.keys(beginnerPictures).map(key => /^(\w+) (circle|square|triangle|rectangle|oval|star)$/.exec(key)).filter(match => match !== null);
  const colors = [...new Set(available.map(match => match[1]!))].filter(word => targets.has(word));
  const shapes = [...new Set(available.map(match => match[2]!))].filter(word => targets.has(word));
  if (!colors.length || !shapes.length) return null;
  const words = shapes.flatMap(shape => colors.map(color => `${color} ${shape}`));
  const extra = (presentation?.slides ?? []).filter(s => s.purpose === SHAPE_EXTENSION).flatMap(s => (s.vocabulary ?? []).map(v => v.word.toLowerCase())).filter(word => beginnerPictures[word]);
  for (const word of extra) {
    const [color, shape] = word.split(' ');
    if (!color || !shape || !teachingColors[color] || !teachingShapes[shape]) continue;
    if (!words.includes(word)) words.push(word);
    if (!colors.includes(color)) colors.push(color);
    if (!shapes.includes(shape)) shapes.push(shape);
  }
  const boards = Array.from({ length: Math.ceil(words.length / 6) }, (_, i) => words.slice(i * 6, i * 6 + 6));
  return { colors, shapes, words, boards, extended: extra.length > 0, cards: words.map(word => ({ word, imagePrompt: '', visual: word })) };
}

/** Called only when building a NEW presentation, never while opening/exporting a saved one. */
export function extendNewShapePresentation(presentation: { slides: Slide[] }, request: LessonRequestInput) {
  const core = colorShapeResources(request);
  if (!/\bshapes?\b/i.test(`${request.topic} ${request.learningObjective}`) || !core || presentation.slides.some(s => s.purpose === SHAPE_EXTENSION)) return presentation;
  const age = Number(request.studentAge.match(/\d+/)?.[0] ?? 18);
  const pairs = ['yellow triangle', 'red triangle', 'blue rectangle', 'yellow rectangle',
    ...(age >= 8 ? ['orange oval', 'green oval', 'purple star', 'orange star'] : [])].filter(word => !core.words.includes(word));
  if (!pairs.length) return presentation;
  const definitions: Record<string, string> = { triangle: 'A triangle has three straight sides.', rectangle: 'This rectangle has two long sides and two short sides.', oval: 'An oval is round and stretched out.', star: 'This star has five points.' };
  const additions: Slide[] = pairs.map((word, i) => {
    const [color, shape] = word.split(' ');
    return { number: presentation.slides.length + i + 1, title: word.charAt(0).toUpperCase() + word.slice(1), layout: 'vocabulary', studentText: '', bullets: [], highlightWords: [color!, shape!], interaction: 'Look. Say the color and the shape.',
      vocabulary: [{ word, definition: definitions[shape!]!, example: `This ${shape} is ${color}.`, imagePrompt: '' }], visualSuggestion: '', imagePrompt: '',
      teacherNote: 'Optional extension after the core lesson: introduce this color and shape before using the matching boards. Point to and count the sides or points where applicable. Model the complete phrase, then let students respond. Keep the original worksheet targets unchanged.', purpose: SHAPE_EXTENSION };
  });
  return { ...presentation, slides: [...presentation.slides, ...additions] };
}

export function colorShapeResourceInstructions(request: Request): string {
  const resources = colorShapeResources(request);
  if (!resources) return '';
  return `COLOR AND SHAPE MATCHING RESOURCES
The application supplies ${resources.words.length} colored picture-front/phrase-back cards and a matching board: ${resources.words.join(', ')}.
These recombine the existing target words; they are not additional vocabulary. Use this exact card count in the plan and activities. Do not plan only separate color swatches and uncolored shape cards for this objective.
Teach and practice every listed combination. Contrast the same shape in different colors AND the same color on different shapes, so students must listen to both words. Use a complete, balanced set of pictures for listen-and-point, sorting and matching.
Worksheet items that assess a color and shape together must use that exact supported visual keyword (for example "${resources.words[0]}"). Use blank shape outlines only when students are explicitly asked to color them; an outline cannot identify a color.
Keep the lesson aligned to its selected skill, age and level. For listening, put the exact spoken prompts in teacher guidance and give students the supplied picture choices. Do not ask teachers to draw or find these cards.`;
}
