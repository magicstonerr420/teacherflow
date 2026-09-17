import type { Slide } from "./lesson-schema";
import { presentationParagraphs } from "./presentation-text.ts";

export const YOUNG_LINE_STEP = 0.34;
export const YOUNG_PARAGRAPH_GAP = 0.2;
const BODY_HEIGHT = 2.45;

/** Prepared slides use a blank line between ideas, and a single newline for wrapping. */
export function youngSlideRows(text: string): { text: string; offset: number }[] {
  let offset = 0;
  return text.split(/\n\s*\n/).filter(Boolean).flatMap((paragraph, index) => {
    if (index) offset += YOUNG_PARAGRAPH_GAP;
    return paragraph.split('\n').filter(Boolean).map(text => {
      const row = { text, offset };
      offset += YOUNG_LINE_STEP;
      return row;
    });
  });
}

function textPages(paragraphs: string[]): string[] {
  const pages: string[] = [];
  let blocks: string[] = [];
  let height = 0;
  const flush = () => { pages.push(blocks.join('\n\n')); blocks = []; height = 0; };
  const maxRows = Math.floor(BODY_HEIGHT / YOUNG_LINE_STEP);
  for (const paragraph of paragraphs) {
    const rows = wrapSlideText(paragraph, 4.35);
    for (let start = 0; start < rows.length; start += maxRows) {
      const chunk = rows.slice(start, start + maxRows);
      const textHeight = chunk.length * YOUNG_LINE_STEP;
      if (blocks.length && height + YOUNG_PARAGRAPH_GAP + textHeight > BODY_HEIGHT) flush();
      height += (blocks.length ? YOUNG_PARAGRAPH_GAP : 0) + textHeight;
      blocks.push(chunk.join('\n'));
    }
  }
  if (blocks.length || !pages.length) flush();
  return pages;
}

// Measure before export: PowerPoint viewers do not all honour shrink-to-fit.
export function wrapSlideText(text: string, widthInches: number, points = 18): string[] {
  const ctx =
    typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
  if (ctx) ctx.font = `bold ${(points * 96) / 72}px Verdana`;
  const width = widthInches * 96;
  const measure = (s: string) => (ctx ? ctx.measureText(s).width : s.length * points * 0.8);
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(line + " " + word) > width) {
        lines.push(line);
        line = word;
      } else line = line ? line + " " + word : word;
    }
    if (line) lines.push(line);
  }
  return lines;
}
export function youngSlidePages(slide: Slide): Slide[] {
  if (slide.layout === "vocabulary" && slide.vocabulary.length) return [slide];
  const texts = textPages([slide.studentText, ...slide.bullets].flatMap(presentationParagraphs));
  const pages: Slide[] = texts.map((studentText, index) => ({
      ...slide,
      studentText,
      bullets: [],
      title:
        slide.title +
        (texts.length > 1 ? ` (${index + 1}/${texts.length})` : ""),
      interaction: index === texts.length - 1 ? slide.interaction : "",
    }));
  if (slide.interaction && wrapSlideText(slide.interaction, 8.5, 12).length > 3) {
    pages[pages.length - 1]!.interaction = "";
    for (const studentText of textPages(presentationParagraphs(slide.interaction)))
      pages.push({
        ...slide,
        title: "Your turn",
        studentText,
        bullets: [],
        interaction: "",
      });
  }
  return pages;
}
