import type { Slide } from "./lesson-schema";

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
  const rows = [slide.studentText, ...slide.bullets]
    .filter(Boolean)
    .flatMap((t) => wrapSlideText(t, 4.35));
  const pages: Slide[] = [];
  for (let start = 0; start < Math.max(1, rows.length); start += 7) {
    pages.push({
      ...slide,
      studentText: rows.slice(start, start + 7).join("\n"),
      bullets: [],
      title:
        slide.title +
        (rows.length > 7 ? ` (${Math.floor(start / 7) + 1}/${Math.ceil(rows.length / 7)})` : ""),
      interaction: start + 7 >= rows.length ? slide.interaction : "",
    });
  }
  if (slide.interaction && wrapSlideText(slide.interaction, 8.5, 12).length > 3) {
    pages[pages.length - 1]!.interaction = "";
    const taskRows = wrapSlideText(slide.interaction, 4.35);
    for (let start = 0; start < taskRows.length; start += 7)
      pages.push({
        ...slide,
        title: "Your turn",
        studentText: taskRows.slice(start, start + 7).join("\n"),
        bullets: [],
        interaction: "",
      });
  }
  return pages;
}
