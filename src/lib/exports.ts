import { isYoungA1, picturePng } from '@/lib/young-learners';
import {
  normalizeWorksheet,
  type LessonPackage,
  type LessonRequestInput,
  type Worksheet,
} from "@/lib/lesson-schema";
import { buildPresentationBlob, presentationFileName } from "@/lib/pptx";

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

type Doc = Awaited<ReturnType<typeof createDoc>>;

async function createDoc(title: string, subtitle: string) {
  const { jsPDF } = await import("jspdf");
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
    ensure(height: number) {
      if (y + height > BOTTOM) {
        doc.addPage();
        y = MARGIN;
      }
    },
    text(
      value: string,
      opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number } = {},
    ) {
      const size = opts.size ?? 10.5;
      const indent = opts.indent ?? 0;
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(...(opts.color ?? ([30, 30, 30] as [number, number, number])));
      const lines = doc.splitTextToSize(pdfSafe(value), BODY_W - indent) as string[];
      const lineHeight = size * 0.45;
      for (const line of lines) {
        api.ensure(lineHeight + 2);
        doc.text(line, MARGIN + indent, y);
        y += lineHeight + 1.2;
      }
      y += opts.gap ?? 1;
    },
    heading(value: string) {
      api.ensure(16);
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
    rules(count: number) {
      const n = Math.max(0, Math.min(8, count));
      for (let i = 0; i < n; i++) {
        api.ensure(8);
        doc.setDrawColor(170, 180, 190);
        doc.line(MARGIN + 4, y + 3, PAGE_W - MARGIN, y + 3);
        y += 8;
      }
    },
    blob(): Blob {
      const total = doc.getNumberOfPages();
      for (let p = 1; p <= total; p++) {
        doc.setPage(p);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(130, 140, 150);
        doc.text(subtitle, MARGIN, PAGE_H - 10);
        doc.text(`${p} / ${total}`, PAGE_W - MARGIN, PAGE_H - 10, { align: "right" });
      }
      return doc.output("blob");
    },
  };

  // Document header
  api.text(title, { size: 18, bold: true, color: [11, 79, 108] });
  api.text(subtitle, { size: 10, color: [110, 120, 130], gap: 3 });
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

  return d.blob();
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

  d.text("Name: ______________________    Class: ____________    Date: ____________", {
    size: 10,
    color: [90, 100, 110],
    gap: 3,
  });
  if (studentDoc.instructions) d.text(studentDoc.instructions, { size: 10.5 });

  for (const section of studentDoc.sections) {
    d.heading(`${section.label} — ${section.title}`);
    if (section.instructions) d.text(section.instructions, { size: 10.5 });
    if (section.passage) {
      d.space(1);
      d.text(section.passage, { size: 10.5, indent: 3 });
    }
    if (section.wordBank?.length) {
      d.subheading("Word bank");
      d.text(section.wordBank.join("   |   "), { indent: 3 });
    }
    d.space(1);
    for (const item of section.items) {
      d.ensure(14);
      if (isYoungA1(request)) {
        const picture = await picturePng(item.visual);
        if (picture) { d.ensure(48); d.doc.addImage(picture, 'PNG', MARGIN, d.y, 32, 32); d.space(35); }
      }
      d.text(`${item.number}. ${item.prompt}`, { size: 10.5 });
      if (item.choices?.length) {
        d.bullets(
          item.choices.map((c, i) => `${String.fromCharCode(97 + i)}) ${c}`),
          " ",
        );
      }
      d.rules(item.answerLines ?? (item.choices?.length ? 0 : 1));
      d.space(1);
    }
  }

  return d.blob();
}

export async function buildStudentWorksheetPdf(
  lesson: LessonPackage,
  request: LessonRequestInput,
  version: "A" | "B" = "A",
): Promise<Blob> {
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
  const w = normalizeWorksheet(lesson.worksheet, lesson.answerKey);
  const d = await createDoc(`${request.topic} — Teacher Answer Key`, header(request));

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

  return d.blob();
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
): Promise<{ blob: Blob; files: PackageFile[]; name: string }> {
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
  ];

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

  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file.name, new Uint8Array(await file.blob.arrayBuffer()));
  }
  const blob = await zip.generateAsync({ type: "blob" });


  return { blob, files, name: packageFileName(request) };
}
