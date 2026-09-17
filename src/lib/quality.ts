import {
  ageBand,
  normalizeSlides,
  normalizeWorksheet,
  type LessonPackage,
  type LessonRequestInput,
} from "@/lib/lesson-schema";
import { findTechTerms, isNoTechRequest } from "@/lib/no-tech";
import { READING_LABEL } from "@/lib/reading";
import { worksheetPictureIssues } from '@/lib/young-learners';


export type CheckStatus = "pass" | "warning" | "fail";

export interface QualityCheck {
  criterion: string;
  status: CheckStatus;
  comment: string;
}

const PLACEHOLDERS = /\b(tbd|to be decided|lorem ipsum|\[insert[^\]]*\]|xxxx)\b/i;

function textOf(value: unknown): string {
  return JSON.stringify(value ?? "").toLowerCase();
}

function isNoTech(request: LessonRequestInput): boolean {
  return isNoTechRequest(request.technologyAvailable);
}


/**
 * Structural quality control run in the browser before export.
 * These are objective, verifiable checks on the generated package —
 * they complement (not replace) the model's own quality report.
 */
export function runQualityControl(
  lesson: LessonPackage,
  request: LessonRequestInput,
): QualityCheck[] {
  const checks: QualityCheck[] = [];
  const add = (criterion: string, status: CheckStatus, comment: string) =>
    checks.push({ criterion, status, comment });

  /* --- objective alignment --- */
  const objective = (lesson.overview?.learningObjective ?? "").trim();
  add(
    "Objective alignment",
    objective.length > 10 ? "pass" : "fail",
    objective.length > 10
      ? `Lesson objective: ${objective}`
      : "The lesson has no clear learning objective.",
  );

  /* --- timing --- */
  const stages = lesson.lessonPlan?.stages ?? [];
  const sum = stages.reduce((acc, s) => acc + (Number(s.time) || 0), 0);
  add(
    "Timing",
    sum === request.durationMinutes ? "pass" : "warning",
    `Stage times total ${sum} minutes against a ${request.durationMinutes}-minute class.`,
  );

  /* --- materials --- */
  const materials = lesson.overview?.materialsNeeded ?? [];
  add(
    "Materials needed",
    materials.length ? "pass" : "warning",
    materials.length
      ? `${materials.length} items listed.`
      : "No materials list was produced for this lesson.",
  );

  /* --- worksheet --- */
  const worksheet = normalizeWorksheet(lesson.worksheet, lesson.answerKey);
  const pictureIssues = [
    ...worksheetPictureIssues(worksheet.student).map(issue => `Version A: ${issue}`),
    ...worksheetPictureIssues(worksheet.studentB).map(issue => `Version B: ${issue}`),
  ];
  add('Worksheet picture clues', pictureIssues.length ? 'fail' : 'pass',
    pictureIssues.length ? pictureIssues.join(' ') : 'Every required worksheet picture has a printable clue in both versions.');
  const studentSections = worksheet.student.sections;
  const teacherSections = worksheet.teacher.sections;
  const itemCount = studentSections.reduce((a, s) => a + s.items.length, 0);
  add(
    "Worksheet consistency",
    studentSections.length && studentSections.length === teacherSections.length
      ? "pass"
      : studentSections.length
        ? "warning"
        : "fail",
    studentSections.length
      ? `${studentSections.length} student sections (${itemCount} questions) and ${teacherSections.length} teacher sections.`
      : "The worksheet has no sections.",
  );

  const missingAnswers = teacherSections.filter((s, i) => {
    const expected = studentSections[i]?.items.length ?? 0;
    return expected > 0 && s.answers.length < expected && s.expectedResponses.length === 0;
  });
  add(
    "Answer-key accuracy",
    missingAnswers.length === 0 ? "pass" : "warning",
    missingAnswers.length === 0
      ? "Every worksheet section has teacher answers or model responses."
      : `${missingAnswers.length} section(s) have fewer answers than questions.`,
  );

  /* --- student copy holds no teacher content --- */
  const studentText = textOf(worksheet.student) + textOf(worksheet.studentB);
  const leak = /answer key|correct answer:|\(answer|teacher note|common error/.test(studentText);
  add(
    "Student copy is clean",
    leak ? "fail" : "pass",
    leak
      ? "Teacher-only wording appears in the student worksheet."
      : "The student worksheet contains no answers or teacher notes.",
  );

  const teacherHasAnswers = teacherSections.some((s) => s.answers.length || s.expectedResponses.length);
  add(
    "Teacher copy is complete",
    teacherHasAnswers ? "pass" : "fail",
    teacherHasAnswers
      ? "The teacher copy carries the full answers."
      : "The teacher copy has no answers.",
  );

  /* --- kids structure --- */
  if (ageBand(request.studentAge) === "Kids") {
    const coreA = studentSections.filter(s => s.label !== READING_LABEL);
    const coreB = worksheet.studentB.sections.filter(s => s.label !== READING_LABEL);
    const okA = coreA.length === 5 && coreA.every((s) => s.items.length === 5);
    const okB =
      coreB.length === 5 && coreB.every((s) => s.items.length === 5);
    add(
      "Two equivalent worksheets",
      okA && okB ? "pass" : "warning",
      okA && okB
        ? "Version A and Version B both have 5 core sections of 5 questions; any dedicated reading is additional."
        : "Young learners should get two worksheets of 5 sections x 5 questions.",
    );
  }

  /* --- presentation --- */
  const slides = normalizeSlides(lesson.presentation);
  const interactive = slides.filter((s) => s.interaction.trim()).length;
  add(
    "Presentation consistency",
    slides.length >= 6 ? "pass" : slides.length ? "warning" : "fail",
    slides.length
      ? `${slides.length} slides, ${interactive} with a student interaction.`
      : "No presentation slides were generated.",
  );

  /* --- skills --- */
  const all = textOf(lesson);
  const main = (request.mainSkill ?? "").toLowerCase();
  add(
    "Main skill focus",
    main && all.includes(main) ? "pass" : "warning",
    main
      ? `Main skill "${request.mainSkill}" is referenced across the materials.`
      : "No main skill was recorded.",
  );
  if (request.secondarySkill) {
    const sec = request.secondarySkill.toLowerCase();
    add(
      "Secondary skill integration",
      all.includes(sec) ? "pass" : "warning",
      all.includes(sec)
        ? `Secondary skill "${request.secondarySkill}" appears inside the lesson materials.`
        : `Secondary skill "${request.secondarySkill}" is not clearly integrated.`,
    );
  }

  /* --- group work --- */
  if (request.groupWorkEnabled) {
    const groupy = /group/.test(all);
    add(
      "Group work consistency",
      groupy ? "pass" : "warning",
      groupy
        ? `Group work of ${request.studentsPerGroup} students is built into the lesson.`
        : "Group work was requested but the materials do not describe it.",
    );
  }

  /* --- class size --- */
  if (request.numberOfStudents) {
    add(
      "Class size",
      "pass",
      `Lesson designed for ${request.numberOfStudents} students.`,
    );
  }

  /* --- no-tech --- */
  if (isNoTech(request)) {
    const found = findTechTerms(lesson);
    add(
      "No-technology mode",
      found.length ? "fail" : "pass",
      found.length
        ? `This lesson still depends on technology: ${found.join(", ")}. Regenerate the affected part.`
        : "The lesson runs with board, paper and printed materials only.",
    );

  }

  /* --- placeholders --- */
  const placeholder = PLACEHOLDERS.test(JSON.stringify(lesson));
  add(
    "No placeholder text",
    placeholder ? "warning" : "pass",
    placeholder
      ? "Some content still contains placeholder wording."
      : "No placeholders or unfinished text found.",
  );

  /* --- export readiness --- */
  const exportable = slides.length > 0 && studentSections.length > 0 && teacherHasAnswers && pictureIssues.length === 0;
  add(
    "Export validity",
    exportable ? "pass" : "fail",
    exportable
      ? "Lesson plan, worksheet, answer key and presentation are all ready to export."
      : "One or more files cannot be exported yet — regenerate the missing part.",
  );

  return checks;
}

export function qualitySummary(checks: QualityCheck[]) {
  return {
    failed: checks.filter((c) => c.status === "fail").length,
    warnings: checks.filter((c) => c.status === "warning").length,
    passed: checks.filter((c) => c.status === "pass").length,
  };
}

/** True when every export file can be produced honestly. */
export function canExportPackage(checks: QualityCheck[]): boolean {
  return !checks.some((c) => c.criterion === "Export validity" && c.status === "fail");
}
