import {repairDrawingParagraphs} from './pptx-xml';
import { americanEnglishContent } from './american-english';
import { loadPresentationTools } from './presentation-tools';
import { lessonImagePrompts } from "./image-plan";
import { isYoungA1, picturePng, youngPresentationIssues } from "./young-learners";
import { youngSlidePages, youngSlideRows, wrapSlideText } from "./young-slides";
import { capitalizeHeading, presentationParagraphs } from "./presentation-text";
import { ageBand, normalizeSlides, type Slide } from "@/lib/lesson-schema";
import type { LessonPackage, LessonRequestInput } from "@/lib/lesson-schema";

/** Safe, useful file name: TeacherFlow_Present_Perfect_B1.pptx */
export function presentationFileName(request: LessonRequestInput): string {
  const topic = (request.topic || "Lesson")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  const level = (request.level || "").replace(/[^a-zA-Z0-9]/g, "");
  return ["TeacherFlow", topic || "Lesson", level].filter(Boolean).join("_") + ".pptx";
}

export type Band = "Kids" | "Teens" | "Adults";

export interface Theme {
  ink: string;
  title: string;
  accent: string;
  accentSoft: string;
  panel: string;
  muted: string;
  highlight: string;
  titleFont: string;
  bodyFont: string;
  titleSize: number;
  bodySize: number;
}

/** Age-appropriate visual identity for the deck. */
export function themeFor(band: Band): Theme {
  if (band === "Kids") {
    return {
      ink: "20303A",
      title: "0B4F6C",
      accent: "F4A300",
      accentSoft: "FFF3D6",
      panel: "F2FAFF",
      muted: "5B7280",
      highlight: "D62828",
      titleFont: "Trebuchet MS",
      bodyFont: "Verdana",
      titleSize: 36,
      bodySize: 24,
    };
  }
  if (band === "Teens") {
    return {
      ink: "1B2430",
      title: "12324F",
      accent: "2563C9",
      accentSoft: "E4EEFC",
      panel: "F5F8FC",
      muted: "63707F",
      highlight: "D62828",
      titleFont: "Trebuchet MS",
      bodyFont: "Calibri",
      titleSize: 32,
      bodySize: 20,
    };
  }
  return {
    ink: "1C2B2D",
    title: "10312B",
    accent: "0F766E",
    accentSoft: "E3EFEC",
    panel: "F6F5F1",
    muted: "6B7B79",
    highlight: "C1272D",
    titleFont: "Georgia",
    bodyFont: "Calibri",
    titleSize: 30,
    bodySize: 19,
  };
}

export function bandOfRequest(request: LessonRequestInput): Band {
  return ageBand(request.studentAge);
}

/** Splits a line into runs so highlighted target language prints in red. */
export function splitHighlights(
  text: string,
  words: string[],
): { text: string; highlight: boolean }[] {
  const clean = (words ?? []).map((w) => w.trim()).filter((w) => w.length > 1);
  if (!clean.length || !text) return [{ text, highlight: false }];
  const escaped = clean
    .sort((a, b) => b.length - a.length)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text
    .split(re)
    .filter((part) => part !== "")
    .map((part) => ({
      text: part,
      highlight: re.test(part) && clean.some((w) => w.toLowerCase() === part.toLowerCase()),
    }));
}

/** Keeps projected text readable: shrinks as content grows, never below 14pt. */
function bodySizeFor(theme: Theme, chars: number, lines: number): number {
  let size = theme.bodySize;
  if (chars > 260 || lines > 5) size -= 4;
  if (chars > 420 || lines > 7) size -= 3;
  return Math.max(14, size);
}

export interface SlideImages {
  /** Map of imagePrompt -> data URL. Optional; slides render fine without images. */
  [prompt: string]: string;
}

/**
 * Builds a real .pptx from the lesson's generated presentation.
 * Student-facing content goes on the slides; teacher notes go into
 * PowerPoint speaker notes so they never clutter the projected slide.
 */
export async function buildPresentationBlob(
  lesson: LessonPackage,
  request: LessonRequestInput,
  images: SlideImages = {},
): Promise<Blob> {
  if (isYoungA1(request)) {
    const issues = youngPresentationIssues(lesson.presentation, lesson);
    if (issues.length)
      throw new Error(
        "Flashcard material is incomplete. Regenerate only the presentation to include the required word cards and picture prompts.",
      );
  }
  images = { ...images };
  const { PptxGenJS } = await loadPresentationTools();
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "TeacherFlow";
  pptx.title = `${request.topic} — ${request.level}`;

  if (isYoungA1(request))
    for (const data of Object.values(images)) {
      const img = new Image();
      img.src = data;
      await img.decode();
      imageRatios.set(data, img.naturalWidth / img.naturalHeight);
    }
  lesson = americanEnglishContent(lesson);
  const band = bandOfRequest(request);
  const t = themeFor(band);
  const slides: Slide[] = normalizeSlides(lesson.presentation).flatMap((s) =>
    isYoungA1(request) ? youngSlidePages(s) : [s],
  );

  const W = 10;
  const H = 5.625;

  // ---------------------------------------------------------------- Title
  const title = pptx.addSlide();
  title.background = { color: t.title };
  title.addShape("rect", { x: 0, y: H - 0.35, w: W, h: 0.35, fill: { color: t.accent } });
  title.addText(capitalizeHeading(request.topic), {
    x: 0.7,
    y: 1.5,
    w: W - 1.4,
    h: 1.3,
    fontSize: 40,
    bold: true,
    color: "FFFFFF",
    fontFace: t.titleFont,
    fit: "shrink",
    valign: "middle",
  });
  title.addText(lesson.overview?.learningObjective ?? request.learningObjective, {
    x: 0.7,
    y: 2.9,
    w: W - 1.4,
    h: 1.1,
    fontSize: 17,
    color: "EAF2F1",
    fontFace: t.bodyFont,
    fit: "shrink",
    valign: "top",
  });
  title.addText(
    [
      request.level,
      `Ages ${request.studentAge}`,
      `${request.durationMinutes} min`,
      request.mainSkill,
      request.secondarySkill ? `+ ${request.secondarySkill}` : "",
    ]
      .filter(Boolean)
      .join("   •   "),
    { x: 0.7, y: 4.2, w: W - 1.4, h: 0.5, fontSize: 13, color: "C9D8D5", fontFace: t.bodyFont },
  );

  // -------------------------------------------------------------- Content
  for (const slide of slides) {
    if (slide.layout === "vocabulary" && slide.vocabulary.length) {
      if (isYoungA1(request)) {
        for (const v of slide.vocabulary) {
          const prompt = v.imagePrompt || "built-in:" + v.word;
          if (!images[prompt]) {
            const picture = await picturePng(v.word);
            if (picture) {
              images[prompt] = picture;
              imageRatios.set(picture, 1);
            }
          }
          const display = {
            ...slide,
            title: v.word,
            layout: "content",
            studentText: v.definition,
            bullets: v.example ? [v.example] : [],
            vocabulary: [],
            imagePrompt: prompt,
            highlightWords: [v.word],
          };
          for (const page of youngSlidePages(display))
            addYoungStandardSlide(pptx, page, t, images, W, H);
        }
      } else addVocabularySlides(pptx, slide, t, images, W, H);
      continue;
    }
    if (isYoungA1(request)) addYoungStandardSlide(pptx, slide, t, images, W, H);
    else addStandardSlide(pptx, slide, t, images, W, H);
  }

  for (const [index, card] of flashcardsFor(lesson, request).entries()) {
    const data = images[card.imagePrompt] || (await picturePng(card.word));
    if (!data)
      throw new Error(
        `The flashcard for "${card.word}" needs its picture. Turn on original illustrations and retry; your lesson is retained.`,
      );
    if (!imageRatios.has(data)) {
      const img = new Image();
      img.src = data;
      await img.decode();
      imageRatios.set(data, img.naturalWidth / img.naturalHeight);
    }
    const front = pptx.addSlide();
    front.background = { color: "FFFFFF" };
    front.addImage({ data, ...containImage(data, 1, 0.7, 8, 4.2) });
    front.addNotes(
      `Flashcard ${index + 1} FRONT. Pair with the next slide (word back). Print the pair and glue back-to-back or use single-card duplex printing after checking orientation.`,
    );
    const back = pptx.addSlide();
    back.background = { color: "FFFFFF" };
    back.addText(capitalizeHeading(card.word), {
      x: 1,
      y: 2,
      w: 8,
      h: 1.3,
      fontSize: 44,
      fontFace: t.bodyFont,
      color: t.title,
      bold: true,
      align: "center",
      margin: 0,
      fit: "shrink",
    });
    back.addNotes(
      `Flashcard ${index + 1} BACK. Word: ${card.word}. The preceding slide is its picture front.`,
    );
  }
  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  return repairPresentationXml(blob);
}

/**
 * pptxgenjs writes <p:notesMasterIdLst> after <p:sldIdLst>, which strict Office
 * validators reject. Move it back to its schema position so the deck is valid
 * everywhere, not just in forgiving viewers.
 */
async function repairPresentationXml(blob: Blob): Promise<Blob> {
  const { JSZip } = await loadPresentationTools();
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const file = zip.file("ppt/presentation.xml");
  if (!file) throw new Error("PowerPoint could not be built: presentation data is missing.");
  const xml = await file.async("string");
  const match = xml.match(/<p:notesMasterIdLst>[\s\S]*?<\/p:notesMasterIdLst>/);
  if (match && xml.includes("<p:sldIdLst>")) {
    zip.file("ppt/presentation.xml", xml.replace(match[0], "").replace("<p:sldIdLst>", `${match[0]}<p:sldIdLst>`));
  }
  for (const entry of Object.values(zip.files)) {
    if (/^ppt\/.*\.xml$/.test(entry.name)) {
      const original = await entry.async("string");
      const fixed = repairDrawingParagraphs(original);
      if (fixed !== original) zip.file(entry.name, fixed);
    }
  }
  return await zip.generateAsync({type:"blob", mimeType:"application/vnd.openxmlformats-officedocument.presentationml.presentation", compression:"DEFLATE"});
}

function slideHeader(s: any, slide: Slide, t: Theme, W: number) {
  s.background = { color: "FFFFFF" };
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.18, fill: { color: t.accent } });
  s.addText(capitalizeHeading(slide.title), {
    x: 0.55,
    y: 0.38,
    w: W - 1.6,
    h: 0.85,
    fontSize: t.titleSize,
    bold: true,
    color: t.title,
    fontFace: t.titleFont,
    fit: "shrink",
    valign: "middle",
  });
}

function slideFooter(s: any, slide: Slide, t: Theme, W: number, H: number) {
  s.addText(String(slide.number), {
    x: W - 0.75,
    y: H - 0.45,
    w: 0.5,
    h: 0.32,
    fontSize: 11,
    color: t.muted,
    align: "right",
    fontFace: t.bodyFont,
  });
  const notes = [
    slide.teacherNote ? `Teacher note: ${slide.teacherNote}` : "",
    slide.interaction ? `Student task: ${slide.interaction}` : "",
    slide.purpose ? `Purpose: ${slide.purpose}` : "",
    slide.visualSuggestion ? `Visual: ${slide.visualSuggestion}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (notes) s.addNotes(notes);
}

const imageRatios = new Map<string, number>();
function containImage(data: string, x: number, y: number, w: number, h: number) {
  const ratio = imageRatios.get(data) ?? 4 / 3;
  const width = Math.min(w, h * ratio),
    height = width / ratio;
  return { x: x + (w - width) / 2, y: y + (h - height) / 2, w: width, h: height };
}
function addYoungStandardSlide(
  pptx: any,
  slide: Slide,
  t: Theme,
  images: SlideImages,
  W: number,
  H: number,
) {
  const s = pptx.addSlide();
  const heading = capitalizeHeading(slide.title);
  let titleSize = 24;
  while (titleSize > 16 && wrapSlideText(heading, 8.1, titleSize).length > 2) titleSize -= 2;
  const titleTheme = { ...t, titleSize };
  slideHeader(
    s,
    { ...slide, title: wrapSlideText(heading, 8.1, titleSize).join("\n") },
    titleTheme,
    W,
  );
  const image = images[slide.imagePrompt];
  const width = image ? 4.98 : 8.9;
  s.addShape("rect", {
    x: 0.55,
    y: 1.35,
    w: width,
    h: 2.85,
    fill: { color: t.panel },
    line: { color: t.panel },
  });
  const rows = youngSlideRows(slide.studentText);
  rows.forEach((row) =>
    s.addText(
      splitHighlights(row.text, slide.highlightWords).map((p) => ({
        text: p.text,
        options: { bold: p.highlight, color: p.highlight ? t.highlight : t.ink },
      })),
      {
        x: 0.85,
        y: 1.55 + row.offset,
        w: width - 0.6,
        h: 0.32,
        fontSize: 18,
        fontFace: t.bodyFont,
        margin: 0,
        breakLine: false,
        valign: "top",
      },
    ),
  );
  if (image) s.addImage({ data: image, ...containImage(image, 5.85, 1.35, 3.6, 2.85) });
  if (slide.interaction) {
    const lines = wrapSlideText(slide.interaction, 8.5, 12);
    // Full adult directions always remain in speaker notes.
    if (lines.length <= 3) {
      s.addShape("roundRect", {
        x: 0.55,
        y: 4.45,
        w: 8.9,
        h: 0.75,
        fill: { color: t.accentSoft },
        line: { color: t.accent },
      });
      s.addText(lines.join("\n"), {
        x: 0.75,
        y: 4.52,
        w: 8.5,
        h: 0.62,
        fontSize: 12,
        fontFace: t.bodyFont,
        bold: true,
        color: t.title,
        margin: 0,
      });
    }
  }
  slideFooter(s, slide, t, W, H);
}

function addStandardSlide(
  pptx: any,
  slide: Slide,
  t: Theme,
  images: SlideImages,
  W: number,
  H: number,
) {
  const s = pptx.addSlide();
  slideHeader(s, slide, t, W);

  const image = slide.imagePrompt ? images[slide.imagePrompt] : undefined;
  const hasInteraction = Boolean(slide.interaction);

  const bodyTop = 1.35;
  const bodyBottom = hasInteraction ? H - 1.45 : H - 0.55;
  const bodyH = bodyBottom - bodyTop;
  const bodyW = image ? (W - 1.1) * 0.56 : W - 1.1;

  const lines = [slide.studentText, ...slide.bullets].flatMap(presentationParagraphs);

  s.addShape("rect", {
    x: 0.55,
    y: bodyTop,
    w: bodyW,
    h: bodyH,
    fill: { color: t.panel },
    line: { color: t.panel },
  });

  const chars = lines.join(" ").length;
  const size = bodySizeFor(t, chars, lines.length);
  const useBullets = lines.length > 1;

  const runs = lines.flatMap((line, i) => {
    const parts = splitHighlights(line, slide.highlightWords);
    return parts.map((p, j) => ({
      text: p.text,
      options: {
        color: p.highlight ? t.highlight : t.ink,
        bold: p.highlight,
        ...(j === 0 && useBullets ? { bullet: true } : {}),
        ...(j === parts.length - 1 && i < lines.length - 1 ? { breakLine: true } : {}),
      },
    }));
  });

  s.addText(runs.length ? runs : [{ text: " " }], {
    x: 0.85,
    y: bodyTop + 0.22,
    w: bodyW - 0.6,
    h: bodyH - 0.44,
    fontSize: size,
    fontFace: t.bodyFont,
    color: t.ink,
    valign: "top",
    fit: "shrink",
    lineSpacingMultiple: 1.15,
    paraSpaceAfter: 12,
    margin: 0,
  });

  if (image) {
    const imgX = 0.55 + bodyW + 0.3;
    s.addImage({
      data: image,
      x: imgX,
      y: bodyTop,
      w: W - 0.55 - imgX,
      h: bodyH,
      sizing: { type: "contain", w: W - 0.55 - imgX, h: bodyH },
    });
  }

  if (hasInteraction) {
    s.addShape("roundRect", {
      x: 0.55,
      y: H - 1.28,
      w: W - 1.1,
      h: 0.8,
      fill: { color: t.accentSoft },
      line: { color: t.accent },
      rectRadius: 0.08,
    });
    s.addText(slide.interaction, {
      x: 0.75,
      y: H - 1.22,
      w: W - 1.5,
      h: 0.68,
      fontSize: 15,
      bold: true,
      color: t.title,
      fontFace: t.bodyFont,
      valign: "middle",
      fit: "shrink",
    });
  }

  slideFooter(s, slide, t, W, H);
}

/** One slide per vocabulary word keeps word, image, definition and example readable. */
function addVocabularySlides(
  pptx: any,
  slide: Slide,
  t: Theme,
  images: SlideImages,
  W: number,
  H: number,
) {
  slide.vocabulary.forEach((v, index) => {
    const s = pptx.addSlide();
    slideHeader(
      s,
      {
        ...slide,
        title:
          slide.vocabulary.length > 1
            ? `${slide.title} (${index + 1}/${slide.vocabulary.length})`
            : slide.title,
      },
      t,
      W,
    );

    const image = v.imagePrompt ? images[v.imagePrompt] : undefined;
    const top = 1.35;
    const bottom = slide.interaction ? H - 1.45 : H - 0.55;
    const h = bottom - top;
    const textW = image ? (W - 1.1) * 0.55 : W - 1.1;

    s.addShape("rect", {
      x: 0.55,
      y: top,
      w: textW,
      h,
      fill: { color: t.panel },
      line: { color: t.panel },
    });
    s.addText(capitalizeHeading(v.word), {
      x: 0.85,
      y: top + 0.18,
      w: textW - 0.6,
      h: 0.75,
      fontSize: 34,
      bold: true,
      color: t.highlight,
      fontFace: t.titleFont,
      fit: "shrink",
    });
    s.addText(v.definition, {
      x: 0.85,
      y: top + 1.0,
      w: textW - 0.6,
      h: h - 1.9,
      fontSize: Math.max(15, t.bodySize - 2),
      color: t.ink,
      fontFace: t.bodyFont,
      valign: "top",
      fit: "shrink",
    });
    if (v.example) {
      s.addText(`"${v.example}"`, {
        x: 0.85,
        y: top + h - 0.85,
        w: textW - 0.6,
        h: 0.65,
        fontSize: 15,
        italic: true,
        color: t.muted,
        fontFace: t.bodyFont,
        fit: "shrink",
      });
    }

    if (image) {
      const imgX = 0.55 + textW + 0.3;
      s.addImage({
        data: image,
        x: imgX,
        y: top,
        w: W - 0.55 - imgX,
        h,
        sizing: { type: "contain", w: W - 0.55 - imgX, h },
      });
    }

    if (slide.interaction && index === slide.vocabulary.length - 1) {
      s.addShape("roundRect", {
        x: 0.55,
        y: H - 1.28,
        w: W - 1.1,
        h: 0.8,
        fill: { color: t.accentSoft },
        line: { color: t.accent },
        rectRadius: 0.08,
      });
      s.addText(slide.interaction, {
        x: 0.75,
        y: H - 1.22,
        w: W - 1.5,
        h: 0.68,
        fontSize: 15,
        bold: true,
        color: t.title,
        fontFace: t.bodyFont,
        valign: "middle",
        fit: "shrink",
      });
    }

    slideFooter(s, slide, t, W, H);
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Collects every illustration prompt in the deck, in slide order. */
export function collectImagePrompts(
  lesson: LessonPackage,
  max = 6,
  request?: LessonRequestInput,
): string[] {
  // Normalise legacy slide visualSuggestion fields before choosing prompts.
  return lessonImagePrompts(
    { ...lesson, presentation: { slides: normalizeSlides(lesson.presentation) } },
    request,
    max,
  );
}
export class IllustrationGenerationError extends Error {
  constructor(
    message: string,
    public images: SlideImages,
  ) {
    super(message);
  }
}

/** Successful pictures are retained per signed-in user and lesson for retry/export. */
const imageCache = new Map<string, string>();
export async function generateSlideImages(
  prompts: string[],
  request: LessonRequestInput,
): Promise<SlideImages> {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const prefix = JSON.stringify([sessionData.session?.user.id, request]);
  const images: SlideImages = {};
  const errors: string[] = [];
  const unique = [...new Set(prompts)];
  const pending = unique.filter(prompt => {
    const cached = imageCache.get(prefix + prompt);
    if (cached) images[prompt] = cached;
    return !cached;
  });
  let billingError = '';
  // A small queue avoids firing all six costly requests at the provider together.
  let index = 0;
  async function worker() {
    while (!billingError && index < pending.length) {
      const prompt = pending[index++]!;
      const key = prefix + prompt;
      const cached = imageCache.get(key);
      if (cached) {
        images[prompt] = cached;
        continue;
      }
      try {
        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            prompt,
            request,
            studentAge: request.studentAge,
            level: request.level,
          }),
        });
        const json = await res.json();
        if (res.status === 402 || json.code === 'image_billing') {
          billingError = json.error || 'OpenRouter needs credits or an available API-key spending allowance for illustrations.';
          throw new Error(billingError);
        }
        if (
          !res.ok ||
          typeof json.dataUrl !== "string" ||
          !/^data:image\/(png|jpeg|webp);base64,/.test(json.dataUrl)
        )
          throw Error(json.error || "The image service returned no usable picture.");
        images[prompt] = json.dataUrl;
        imageCache.set(key, json.dataUrl);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : "Image request failed.");
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, pending.length) }, worker));
  if (errors.length)
    throw new IllustrationGenerationError(
      billingError
        ? `Illustrations paused. ${billingError} Remaining requests were stopped. Successful pictures are saved; you can export without AI illustrations.`
        : `${errors.length} illustration(s) failed. ${errors[0]} Successful pictures are saved for retry; retry requests only missing pictures.`,
      images,
    );
  return images;
}

export function flashcardsFor(lesson: LessonPackage, request: LessonRequestInput) {
  if (
    !isYoungA1(request) ||
    !/flash[ -]?cards?/i.test(
      JSON.stringify([lesson.overview, lesson.lessonPlan, lesson.presentation, lesson.activity]),
    )
  )
    return [];
  const unique = new Map<string, { word: string; imagePrompt: string }>();
  for (const slide of normalizeSlides(lesson.presentation))
    for (const v of slide.vocabulary)
      if (v.word.trim())
        unique.set(v.word.trim().toLowerCase(), { word: v.word, imagePrompt: v.imagePrompt });
  return [...unique.values()];
}
