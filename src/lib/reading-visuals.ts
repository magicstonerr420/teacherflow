import { beginnerPictures, teachingColors, teachingShapes } from './beginner-pictures.ts';
import type { Reading } from './reading';

const color = Object.keys(teachingColors).join('|'), shape = Object.keys(teachingShapes).join('|');
const pair = `(${color}) (${shape})`;
/** Only facts explicitly stated in the passage can become reference pictures. */
export function readingShapeScene(text: string) {
  if (/\b(?:no|not|never)\b|\b(?:two|three|four|five|six|several|many) (?:red|blue|green|yellow|orange|purple)\b/i.test(text)) return null;
  const facts: { word: string; index: number }[] = [];
  for (const m of text.toLowerCase().matchAll(new RegExp(`\\b${pair}\\b`, 'g'))) facts.push({ word: `${m[1]} ${m[2]}`, index: m.index! });
  for (const m of text.toLowerCase().matchAll(new RegExp(`\\b(${shape})[.!]?\\s+(?:it is|it['’]s|is) (${color})\\b`, 'g'))) facts.push({ word: `${m[2]} ${m[1]}`, index: m.index! });
  const words = [...new Set(facts.sort((a, b) => a.index - b.index).map(f => f.word))];
  if (words.length < 2 || words.length > 8) return null;
  const relations = [...text.toLowerCase().matchAll(new RegExp(`${pair} is next to (?:the |a )?${pair}`, 'g'))];
  // Never invent a layout for unsupported spatial statements.
  if (/\b(?:above|below|behind|between|under|over|left of|right of|on top of)\b/i.test(text)) return null;
  if (relations.length > 1) return null;
  if (relations[0]) {
    const m = relations[0], a = `${m[1]} ${m[2]}`, b = `${m[3]} ${m[4]}`;
    if (a === b) return null;
    words.splice(0, words.length, b, a, ...words.filter(w => w !== a && w !== b));
  }
  return { words, columns: 2, rows: Math.ceil(words.length / 2) };
}

export function readingSceneSvg(text: string) {
  const scene = readingShapeScene(text);
  if (!scene) return null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="${scene.rows * 300}" viewBox="0 0 200 ${scene.rows * 100}"><rect width="200" height="${scene.rows * 100}" fill="white"/>${scene.words.map((word, i) => `<g transform="translate(${i % 2 * 100},${Math.floor(i / 2) * 100})" stroke="#243c4c" stroke-width="2.5" stroke-linejoin="round">${beginnerPictures[word]}</g>`).join('')}</svg>`;
}
export function readingSceneUrl(text: string) {
  const svg = readingSceneSvg(text);
  return svg ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` : null;
}
export async function readingScenePng(text: string) {
  const url = readingSceneUrl(text);
  if (!url) return null;
  const img = new Image(); img.src = url; await img.decode();
  const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Could not prepare the reading reference picture.');
  ctx.drawImage(img, 0, 0); return canvas.toDataURL('image/png');
}

/** Repair legacy shape readings whose unqualified nouns refer to several objects. */
export function prepareReadingVisuals(reading: Reading): Reading {
  const scene = readingShapeScene(reading.text);
  if (!scene) return reading;
  const ambiguous = reading.questions.some(q => /\b(?:the|each) (?:circle|square|triangle|rectangle|oval|star)\b/i.test(q.question) && !/\b(?:red|blue|green|yellow|orange|purple)\b/i.test(q.question));
  if (!ambiguous && !/\b(?:point to|look at the shapes)\b/i.test(reading.text)) return reading;
  const colors = Object.keys(teachingColors).filter(c => scene.words.some(w => w.startsWith(c + ' ')));
  const shapes = [...new Set(scene.words.map(w => w.split(' ')[1]!))];
  const answers: string[] = [];
  const questions: Reading['questions'] = colors.map(c => {
    const matches = shapes.filter(s => scene.words.includes(`${c} ${s}`));
    const answer = matches.join(' and '); answers.push(answer);
    return { type: 'supporting_details', question: `Which ${matches.length > 1 ? 'shapes are' : 'shape is'} ${c}?`, choices: matches.length === 1 ? shapes : [], evidence: reading.text,
      answerExplanation: `The passage describes ${matches.map(s => `a ${c} ${s}`).join(' and ')}. Accept: ${answer}.` };
  });
  return { ...reading, word_count: reading.text.trim().split(/\s+/u).length, questions: questions.slice(0, 5), answers: answers.slice(0, 5), instructions: 'Read the passage. Use the reference picture to find each shape. Answer using the passage.',
    activity: 'Read one color-and-shape phrase from the passage. Point to its picture. Then find a different shape with the same color, if the passage describes one.',
    assessment: 'Check that students identify every shape described for the requested color. Accept all correct shapes when the passage gives more than one.' };
}

export function missingReadingReference(text: string) {
  return !readingShapeScene(text) && /\b(?:look at|point to|label|color in)\s+(?:the |this |each |these )?(?:picture|image|illustration|drawing|shape)s?\b/i.test(text);
}
