import { isYoungA1, picturePng, worksheetPictureKey, worksheetItemPrompt, worksheetPictureIssues } from '@/lib/young-learners';
import { loadPdfTools } from '@/lib/pdf-tools';
import { prepareShapeWorksheet } from './worksheet-shapes';
import { readingScenePng, readingShapeScene } from './reading-visuals';
import { prepareLessonReading } from './reading';
import { loadPresentationTools } from '@/lib/presentation-tools';
import {
  normalizeWorksheet,
  normalizeSlides,
  type LessonPackage,
  type LessonRequestInput,
  type Worksheet,
} from "@/lib/lesson-schema";
import { buildPresentationBlob, presentationFileName, flashcardsFor } from "@/lib/pptx";
import { colorShapeResources } from './color-shape-resources';
import { lessonParagraphs } from './lesson-text';

/* --------------------------- text safety --------------------------------- */

/**
 * jsPDF's built-in fonts only cover Latin-1, so anything outside it prints as
 * garbage. Map the characters models actually produce, then drop the rest.
 */
function pdfSafe(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u2192\u21d2]/g, "->")
    .replace(/[\u2190\u21d0]/g, "<-")
    .replace(/[\u2018\u2019\u201b]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2022\u25cf]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/[^\x09\x0a\x20-\xff]/g, "");
}

/* ----------------------------- file naming ------------------------------- */


export function safeSlug(value: string, max = 60): string {
  return (value || "Lesson")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, max);
}

export function packageFileName(request: LessonRequestInput): string {
  return [
    "TeacherFlow",
    safeSlug(request.topic),
    safeSlug(request.level, 10),
    "Lesson_Package",
  ]
    .filter(Boolean)
    .join("_")
    .concat(".zip");
}

/* ------------------------------- PDF core -------------------------------- */

const MARGIN = 18;
const PAGE_W = 210;
const PAGE_H = 297;
const BODY_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 18;
const PARAGRAPH_GAP = 4;

type Doc = Awaited<ReturnType<typeof createDoc>>;

async function createDoc(title: string, subtitle: string) {
  const { jsPDF } = await loadPdfTools();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setProperties({ title, creator: "TeacherFlow" });
  let y = MARGIN;

  const api = {
    doc,
    get y() {
      return y;
    },
    space(mm: number) {
      y += mm;
    },
    newPage() {
      if (y <= MARGIN) return;
      doc.addPage();
      y = MARGIN;
    },
    ensure(height: number) {
      if (y + height > BOTTOM) {
        doc.addPage();
        y = MARGIN;
      }
    },
    textHeight(value: string, size = 10.5, indent = 0, bold = false) {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(size);
      const paragraphs = lessonParagraphs(pdfSafe(value));
      return paragraphs.reduce((height, paragraph) => height + doc.splitTextToSize(paragraph, BODY_W - indent).length * (size * 0.45 + 1.2), 0)
        + Math.max(0, paragraphs.length - 1) * PARAGRAPH_GAP + 2;
    },
    text(
      value: string,
      opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number; align?: 'left' | 'justify' } = {},
    ) {
      const size = opts.size ?? 10.5;
      const indent = opts.indent ?? 0;
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(...(opts.color ?? ([30, 30, 30] as [number, number, number])));
      const paragraphs = lessonParagraphs(pdfSafe(value));
      const lineHeight = size * 0.45;
      const step = lineHeight + 1.2;
      for (const [index, paragraph] of paragraphs.entries()) {
        if (index) y += PARAGRAPH_GAP;
        const lines = doc.splitTextToSize(paragraph, BODY_W - indent) as string[];
        api.ensure(Math.min(2, lines.length) * step + 2);
        for (let start = 0; start < lines.length;) {
          api.ensure(lineHeight + 2);
          const count = Math.max(1, Math.floor((BOTTOM - y - lineHeight - 2) / step) + 1);
          const chunk = lines.slice(start, start + count);
          const continues = start + chunk.length < lines.length;
          // jsPDF leaves the last line unstretched. An empty final line makes
          // the last visible line justify when its paragraph continues on page 2.
          doc.text(continues ? [...chunk, ''] : chunk, MARGIN + indent, y, {
            align: opts.align ?? (opts.bold ? 'left' : 'justify'), maxWidth: BODY_W - indent,
            lineHeightFactor: step * 72 / 25.4 / size,
          });
          y += chunk.length * step;
          start += chunk.length;
        }
      }
      if (paragraphs.length) y += opts.gap ?? 2;
    },
    heading(value: string) {
      api.ensure(28);
      y += 3;
      api.text(value, { size: 14, bold: true, color: [17, 61, 92] });
      doc.setDrawColor(200, 210, 220);
      doc.line(MARGIN, y - 1, PAGE_W - MARGIN, y - 1);
      y += 3;
    },
    subheading(value: string) {
      api.ensure(12);
      y += 2;
      api.text(value, { size: 11.5, bold: true, color: [40, 60, 80] });
    },
    label(label: string, value: string) {
      if (!value) return;
      api.text(`${label}: ${value}`, { size: 10.5 });
    },
    bullets(items: string[], marker = "•") {
      for (const item of items) {
        if (!item) continue;
        api.text(`${marker} ${item}`, { indent: 3 });
      }
    },
    rules(count: number, spacing = 8) {
      const n = Math.max(0, Math.min(8, count));
      for (let i = 0; i < n; i++) {
        api.ensure(spacing);
        doc.setDrawColor(170, 180, 190);
        doc.line(MARGIN + 4, y + 3, PAGE_W - MARGIN, y + 3);
        y += spacing;
      }
    },
    blob(): Blob {
      const total = doc.getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(130, 140, 150);

        doc.text(`${p} / ${total}`, PAGE_W - MARGIN, PAGE_H - 10, { align: "right" });
      }
      return doc.output("blob");
    },
  };

  // Document header
  api.text(title, { size: 18, bold: true, color: [11, 79, 108] });
  api.text(subtitle, { size: 10, color: [110, 120, 130], gap: 3, align: 'left' });
  return api;
}

function header(request: LessonRequestInput): string {
  const bits = [
    request.level,
    `Ages ${request.studentAge}`,
    `${request.durationMinutes} min`,
    request.mainSkill,
    request.secondarySkill ? `+ ${request.secondarySkill}` : "",
  ].filter(Boolean);
  return bits.join(" · ");
}

/* ---------------------------- Lesson plan PDF ---------------------------- */

export async function buildLessonPlanPdf(
  lesson: LessonPackage,
  request: LessonRequestInput,
): Promise<Blob> {
  const d = await createDoc(`${request.topic} — Lesson Plan`, header(request));
  writeLessonPlan(d, lesson, request);
  return d.blob();
}
function writeLessonPlan(d: Doc, lesson: LessonPackage, request: LessonRequestInput) {
  const o = lesson.overview;

  d.heading("Overview");
  d.label("Learning objective", o.learningObjective);
  d.label("Main skill", o.mainSkill);
  if (request.secondarySkill) d.label("Secondary skill", request.secondarySkill);
  d.label("Duration", o.duration);
  if (request.numberOfStudents) d.label("Class size", `${request.numberOfStudents} students`);
  if (request.groupWorkEnabled) d.label("Group work", `Groups of ${request.studentsPerGroup}`);

  d.subheading("Success criteria");
  d.bullets(o.successCriteria ?? []);

  d.heading("Materials needed");
  const materials = o.materialsNeeded?.length ? o.materialsNeeded : ["Student worksheet", "Presentation"];
  d.bullets(materials);

  d.subheading("Teacher preparation");
  d.bullets(o.teacherPreparation ?? []);

  d.heading("Key language");
  d.bullets(o.keyLanguage ?? []);

  d.heading(`Lesson plan — ${lesson.lessonPlan.totalMinutes} minutes`);
  for (const stage of lesson.lessonPlan.stages) {
    d.ensure(30);
    d.subheading(`${stage.time} min — ${stage.stage}`);
    d.label("Teacher", stage.teacherActions);
    d.label("Students", stage.studentActions);
    d.label("Materials", stage.materials);
    d.label("Purpose", stage.purpose);
  }

  const a = lesson.activity;
  if (a?.title) {
    d.heading(`Classroom activity — ${a.title}`);
    d.label("Objective", a.objective);
    d.label("Time", a.time);
    d.label("Grouping", a.grouping);
    d.label("Materials", a.materials);
    d.subheading("Teacher instructions");
    d.bullets(a.teacherInstructions ?? []);
    d.subheading("Student instructions");
    d.bullets(a.studentInstructions ?? []);
    if (a.example) d.label("Example", a.example);
    if (a.variation) d.label("Variation", a.variation);
  }

  if (lesson.homework?.title) {
    d.heading("Homework");
    d.text(lesson.homework.title, { bold: true });
    d.text(lesson.homework.instructions);
    d.bullets(lesson.homework.tasks ?? [], "–");
    d.label("Estimated time", lesson.homework.estimatedTime);
  }

  if (lesson.exitTicket?.title) {
    d.heading(`Exit ticket — ${lesson.exitTicket.timeMinutes} min`);
    d.bullets(lesson.exitTicket.questions ?? [], "–");
    d.label("Success looks like", lesson.exitTicket.successIndicator);
  }

  if (lesson.teacherNotes?.tips?.length) {
    d.heading("Teacher notes");
    d.bullets(lesson.teacherNotes.tips);
  }

}

/* -------------------------- Student worksheet PDF ------------------------- */

type StudentDoc = Worksheet["student"];

export async function studentPdf(
  studentDoc: StudentDoc,
  request: LessonRequestInput,
  titleSuffix: string,
): Promise<Blob> {
  const d = await createDoc(
    studentDoc.title || `${request.topic} — Worksheet${titleSuffix}`,
    header(request),
  );

  await writeStudent(d, studentDoc, request);
  return d.blob();
}
async function writeStudent(d: Doc, studentDoc: StudentDoc, request: LessonRequestInput) {
  studentDoc = prepareShapeWorksheet(studentDoc, request);
  const issues = worksheetPictureIssues(studentDoc);
  if (issues.length) throw new Error(`This worksheet needs picture clues before it can be printed: ${issues.join(' ')}`);
  d.text("Name: ______________________    Class: ____________    Date: ____________", {
    size: 10,
    color: [90, 100, 110],
    gap: 3,
  });
  if (studentDoc.instructions) d.text(studentDoc.instructions, { size: 10.5 });

  const pictureCache = new Map<string, Promise<string | null>>();
  const ruleSpacing = isYoungA1(request) ? 8 : 7;
  const itemHeight = (item: StudentDoc['sections'][number]['items'][number]) =>
    (worksheetPictureKey(item) ? 35 : 0) + d.textHeight(`${item.number}. ${worksheetItemPrompt(item)}`)
    + (item.choices ?? []).reduce((height, choice, i) => height + d.textHeight(`  ${String.fromCharCode(97+i)}) ${choice}`, 10.5, 3), 0)
    + Math.max(0, Math.min(8, item.answerLines ?? (item.choices?.length ? 0 : 1))) * ruleSpacing + 3;

  for (const section of studentDoc.sections) {
    const reference = readingShapeScene(section.passage ?? '');
    const headingHeight = 6 + d.textHeight(`${section.label} — ${section.title}`, 14, 0, true)
      + (section.instructions ? d.textHeight(section.instructions) : 0)
      + (section.passage ? 1 + d.textHeight(section.passage, 10.5, 3) : 0)
      + (reference ? reference.rows * 48 + 12 : 0)
      + (section.wordBank?.length ? 2 + d.textHeight('Word bank', 11.5, 0, true) + d.textHeight(section.wordBank.join('   |   '), 10.5, 3) : 0);
    // Keep short sections together. A multi-page reading must start below its
    // heading, instead of pushing all content past an almost-empty first page.
    const together = headingHeight + (section.items[0] ? itemHeight(section.items[0]) : 0) + 3;
    const opening = 6 + d.textHeight(`${section.label} — ${section.title}`, 14, 0, true)
      + (section.instructions ? d.textHeight(section.instructions) : 0) + 18;
    d.ensure(section.passage && together > BOTTOM - MARGIN ? opening : Math.min(BOTTOM - MARGIN, together));
    d.heading(`${section.label} — ${section.title}`);
    if (section.instructions) d.text(section.instructions, { size: 10.5 });
    if (section.passage) {
      d.space(1);
      d.text(section.passage, { size: 10.5, indent: 3 });
      const scene = readingShapeScene(section.passage);
      if (scene) {
        const png = await readingScenePng(section.passage);
        const height = scene.rows * 48;
        d.ensure(height + 12); d.text('Reference picture', { size: 10, bold: true });
        if (png) { d.doc.addImage(png, 'PNG', MARGIN + 3, d.y, 96, height); d.space(height + 4); }
      }
    }
    if (section.wordBank?.length) {
      d.subheading("Word bank");
      d.text(section.wordBank.join("   |   "), { indent: 3 });
    }
    d.space(1);
    for (const item of section.items) {
      d.ensure(Math.min(BOTTOM - MARGIN, itemHeight(item)));
      const key = worksheetPictureKey(item);
      if (key && !pictureCache.has(key)) pictureCache.set(key, picturePng(key));
      const picture = key ? await pictureCache.get(key) : null;
      if (picture) { d.doc.addImage(picture, 'PNG', MARGIN, d.y, 32, 32); d.space(35); }
      d.text(`${item.number}. ${worksheetItemPrompt(item)}`, { size: 10.5 });
      if (item.choices?.length) {
        d.bullets(
          item.choices.map((c, i) => `${String.fromCharCode(97 + i)}) ${c}`),
          " ",
        );
      }
      d.rules(item.answerLines ?? (item.choices?.length ? 0 : 1), isYoungA1(request) ? 8 : 7);
      d.space(isYoungA1(request) ? 1 : 0.5);
    }
  }

}

export async function buildStudentWorksheetPdf(
  lesson: LessonPackage,
  request: LessonRequestInput,
  version: "A" | "B" = "A",
): Promise<Blob> {
  lesson = prepareLessonReading(lesson);
  const w = normalizeWorksheet(lesson.worksheet, lesson.answerKey);
  const doc = version === "B" ? w.studentB : w.student;
  return studentPdf(doc, request, version === "B" ? " (Version B)" : "");
}

/* --------------------------- Answer key PDF ------------------------------ */

export async function buildAnswerKeyPdf(
  lesson: Pick<LessonPackage, "worksheet" | "answerKey"> & Partial<Pick<LessonPackage, "assessment">>,
  request: LessonRequestInput,
  version?: "A" | "B",
): Promise<Blob> {
  lesson = prepareLessonReading(lesson);
  const d = await createDoc(`${request.topic} — Teacher Answer Key`, header(request));

  writeAnswerKey(d, lesson, version);
  return d.blob();
}
function writeAnswerKey(d: Doc, lesson: Pick<LessonPackage, "worksheet" | "answerKey"> & Partial<Pick<LessonPackage,"assessment">>, version?: "A" | "B") {
  const w = normalizeWorksheet(lesson.worksheet, lesson.answerKey);
  if (w.teacher.overview) {
    d.heading("How to run the worksheet");
    d.text(w.teacher.overview);
  }
  if (w.teacher.groupWorkGuidance) {
    d.subheading("Group work guidance");
    d.text(w.teacher.groupWorkGuidance);
  }

  const renderSections = (sections: Worksheet["teacher"]["sections"], student: StudentDoc, label: string) => {
    if (!sections.length) return;
    d.heading(label);
    sections.forEach((s, i) => {
      d.subheading(`${s.label} — ${s.title}`);
      if (s.label === "Reading • DeepSeek" && student.sections[i]?.passage) {
        d.text(student.sections[i]!.passage, { size: 10.5 });
      }
      const items = student.sections[i]?.items ?? [];
      s.answers.forEach((answer, j) => {
        const prompt = items[j]?.prompt;
        d.text(`${j + 1}. ${prompt ? `${prompt}  →  ` : ""}${answer}`, { indent: 2 });
      });
      if (s.explanation) d.label("Teaching point", s.explanation);
      if (s.expectedResponses?.length) {
        d.label("Model answers", s.expectedResponses.join(" | "));
      }
      if (s.commonErrors?.length) d.label("Common errors", s.commonErrors.join(" | "));
      if (s.corrections?.length) d.label("Corrections", s.corrections.join(" | "));
      if (s.teacherNotes) d.label("Notes", s.teacherNotes);
      d.space(2);
    });
  };

  if (version !== "B") renderSections(w.teacher.sections, w.student, "Answers — Version A");
  if (version !== "A") renderSections(w.teacherB, w.studentB, "Answers — Version B");

  if (lesson.assessment?.questions?.length) {
    d.heading("Assessment answers");
    lesson.assessment.questions.forEach((q, i) => {
      d.text(`${i + 1}. ${q.prompt}`, { indent: 2 });
      d.text(`Answer: ${q.answer}`, { indent: 6, bold: true });
    });
  }

}

/* ------------------------------ ZIP package ------------------------------- */

export interface PackageFile {
  name: string;
  blob: Blob;
}

/**
 * Builds every export file and zips them together. Any file that cannot be
 * produced aborts the whole package — TeacherFlow never ships a fake ZIP.
 */
export async function buildLessonPackageZip(
  lesson: LessonPackage,
  request: LessonRequestInput,
  images: Record<string, string> = {},
  listeningAudio?: string,
): Promise<{ blob: Blob; files: PackageFile[]; name: string }> {
  lesson = prepareLessonReading(lesson);
  const base = [safeSlug(request.topic), safeSlug(request.level, 10)].filter(Boolean).join("_");
  const w = normalizeWorksheet(lesson.worksheet, lesson.answerKey);

  const files: PackageFile[] = [
    { name: `${base}_Lesson_Plan.pdf`, blob: await buildLessonPlanPdf(lesson, request) },
    {
      name: `${base}_Student_Worksheet.pdf`,
      blob: await buildStudentWorksheetPdf(lesson, request, "A"),
    },
    { name: `${base}_Teacher_Answer_Key.pdf`, blob: await buildAnswerKeyPdf(lesson, request) },
    { name: presentationFileName(request), blob: await buildPresentationBlob(lesson, request, images) },
    { name: `${base}_Presentation_Teacher_Guide.pdf`, blob: await buildPresentationTeacherGuidePdf(lesson, request) },
  ];

  if (lesson.listening?.status === 'ready') {
    const d = await createDoc(`${request.topic} — Listening: Teacher Copy`, header(request));
    d.heading(lesson.listening.value.title);
    d.text(lesson.listening.value.script);
    d.subheading('Teaching guidance'); d.text(lesson.listening.value.teacherGuidance);
    lesson.listening.value.questions.forEach((q, i) => { d.subheading(`${i + 1}. ${q.question}`); d.text(q.answer); d.text(q.explanation); });
    files.push({ name: `${base}_Listening_Teacher_Copy.pdf`, blob: d.blob() });
    if (lesson.listening.audio && !listeningAudio) throw new Error('The saved listening recording could not be loaded. Reopen Listening and retry the download.');
    if (listeningAudio) {
      if (!/^data:audio\/mpeg;base64,[A-Za-z0-9+/=]+$/.test(listeningAudio)) throw new Error('The listening recording is invalid.');
      const bytes = Uint8Array.from(atob(listeningAudio.split(',')[1]!), c => c.charCodeAt(0));
      files.push({ name: `${base}_Listening.mp3`, blob: new Blob([bytes], { type: 'audio/mpeg' }) });
    }
  }

  if (w.studentB.sections.length) {
    files.splice(2, 0, {
      name: `${base}_Student_Worksheet_Version_B.pdf`,
      blob: await buildStudentWorksheetPdf(lesson, request, "B"),
    });
  }

  for (const file of files) {
    if (!file.blob || file.blob.size < 500) {
      throw new Error(`We could not build ${file.name}. Your lesson is safe — please try again.`);
    }
  }

  const { JSZip } = await loadPresentationTools();
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, new Uint8Array(await file.blob.arrayBuffer()));
  }
  const blob = await zip.generateAsync({ type: "blob" });


  return { blob, files, name: packageFileName(request) };
}

/** Printable content only; no app navigation, duplicate tabs or browser headers. */
export async function buildCompleteLessonPdf(lesson: LessonPackage, request: LessonRequestInput): Promise<Blob> {
  lesson = prepareLessonReading(lesson);
  const d=await createDoc(`${request.topic} — Complete Lesson`,header(request));
  writeLessonPlan(d,lesson,request);
  const w=normalizeWorksheet(lesson.worksheet,lesson.answerKey);
  d.newPage();
  d.heading('Student worksheet — Version A');
  await writeStudent(d,w.student,request);
  if(w.studentB.sections.length){d.newPage();d.heading('Student worksheet — Version B');await writeStudent(d,w.studentB,request);}
  d.newPage();
  d.heading('Teacher answer key');writeAnswerKey(d,lesson);
  if(lesson.assessment?.instructions){d.heading('Assessment guidance');d.text(lesson.assessment.instructions);}
  if(lesson.supportVersion){
    const v=lesson.supportVersion;d.heading('Support');d.text(v.summary);
    for(const [label,values] of [['Sentence frames',v.sentenceFrames],['Word bank',v.wordBank],['Worked examples',v.examples],['Smaller steps',v.steps],['Guided practice',v.guidedPractice]] as [string,string[]][]) {
      if(values?.length){d.subheading(label);d.bullets(values);}
    }
  }
  if(lesson.challengeVersion){d.ensure(45);d.heading('Challenge');d.text(lesson.challengeVersion.summary);d.bullets(lesson.challengeVersion.tasks);d.bullets(lesson.challengeVersion.extensionQuestions);}
  for(const p of lesson.teacherNotes?.problems??[]){d.subheading(p.problem);d.text(p.solution);}
  writePresentationTeacherGuide(d, lesson, request);
  return d.blob();
}

function writePresentationTeacherGuide(d: Awaited<ReturnType<typeof createDoc>>, lesson: LessonPackage, request: LessonRequestInput) {
  d.heading('Presentation — teaching notes');
  d.text('Teacher copy. Keep this guide separate from the student PowerPoint. Slide numbers below refer to the numbered lesson slides; an exported slide may continue over several pages.');
  for(const slide of normalizeSlides(lesson.presentation)){
    d.subheading(`${slide.number}. ${slide.title}`);d.text(slide.studentText);d.bullets(slide.bullets);
    for(const v of slide.vocabulary??[]){d.text(`${v.word}: ${v.definition}`);if(v.example)d.text(v.example);}
    d.label('Task',slide.interaction);d.label('Teacher note',slide.teacherNote);
    d.label('Purpose',slide.purpose);d.label('Visual guidance',slide.visualSuggestion);
  }
  const resources = colorShapeResources(request, lesson.presentation);
  if(resources){
    d.subheading('Matching boards');
    d.text('Teach the words first, then say each phrase in a mixed order and let students point. Compare the same shape in different colors, then the same color on different shapes.');
    resources.boards.forEach((words,index)=>d.label(`Board ${index+1}: picture order, left to right by row`,words.join('; ')));
  }
  const cards=flashcardsFor(lesson,request);
  if(cards.length){
    d.subheading('Flashcard preparation');
    d.text('Each picture front is followed by its word back. Print each pair and glue back-to-back, or use single-card duplex printing after checking orientation.');
    d.bullets(cards.map((card,index)=>`${index+1}. ${card.word}`));
  }
}

export async function buildPresentationTeacherGuidePdf(lesson: LessonPackage, request: LessonRequestInput): Promise<Blob> {
  const d=await createDoc(`${request.topic} — Presentation Teacher Guide`,header(request));
  writePresentationTeacherGuide(d,lesson,request);
  return d.blob();
}
export async function buildTeacherWorksheetPdf(lesson: Pick<LessonPackage, 'worksheet'|'answerKey'>, request: LessonRequestInput, version: 'A'|'B'): Promise<Blob>{
  const w=normalizeWorksheet(lesson.worksheet,lesson.answerKey);
  const d=await createDoc(`${request.topic} — Teacher Worksheet ${version}`,header(request));
  await writeStudent(d,version==='B'?w.studentB:w.student,request);
  d.newPage();
  writeAnswerKey(d,lesson,version);
  return d.blob();
}
