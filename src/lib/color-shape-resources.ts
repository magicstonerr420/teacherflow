import { beginnerPictures } from './beginner-pictures';

type Request = { requiredVocabulary?: string | null | undefined };

/** Recombine the teacher's target words; prior knowledge is not extra target vocabulary. */
export function colorShapeResources(request: Request) {
  const targets = new Set<string>((request.requiredVocabulary ?? '').toLowerCase().match(/[a-z]+/g) ?? []);
  const available = Object.keys(beginnerPictures).map(key => /^(\w+) (circle|square)$/.exec(key)).filter(match => match !== null);
  const colors = [...new Set(available.map(match => match[1]!))].filter(word => targets.has(word));
  const shapes = [...new Set(available.map(match => match[2]!))].filter(word => targets.has(word));
  if (!colors.length || !shapes.length) return null;
  const words = shapes.flatMap(shape => colors.map(color => `${color} ${shape}`));
  return { colors, shapes, words, cards: words.map(word => ({ word, imagePrompt: '', visual: word })) };
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
