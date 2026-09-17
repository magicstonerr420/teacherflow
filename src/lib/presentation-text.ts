import { americanEnglish } from './american-english.ts';

/** Sentence case: preserve the rest of the heading's capitalization. */
export function capitalizeHeading(text: string): string {
  return americanEnglish(text).replace(/\p{L}/u, letter => letter.toLocaleUpperCase('en-US'));
}

/** Keep sentences/instructions separate before wrapping them to the slide width. */
export function presentationParagraphs(text: string): string[] {
  const segmenter = new Intl.Segmenter('en-US', { granularity: 'sentence' });
  return text.split(/\r?\n/).flatMap(line => {
    const paragraphs: string[] = [];
    for (const part of segmenter.segment(line)) {
      const sentence = part.segment.trim();
      if (!sentence) continue;
      // Slash-separated alternatives form one language model for the student.
      if (sentence.startsWith('/') && paragraphs.length)
        paragraphs[paragraphs.length - 1] += ' ' + sentence;
      else paragraphs.push(sentence);
    }
    return paragraphs;
  });
}
