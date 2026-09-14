import { z } from "zod";

/** Shared lesson data contracts. Client-safe (no server imports). */

export const AGE_OPTIONS = [
  "5-7",
  "8-9",
  "10-12",
  "13-15",
  "14-16",
  "16-18",
  "Adults",
] as const;
export const LEVEL_OPTIONS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export const DURATION_OPTIONS = [30, 45, 60, 75, 90] as const;
export const SKILL_OPTIONS = [
  "Grammar",
  "Vocabulary",
  "Reading",
  "Listening",
  "Speaking",
  "Writing",
  "Mixed",
] as const;

/** Secondary skill options. Never includes "Mixed"; may repeat the main skill. */
export const SECONDARY_SKILL_OPTIONS = [
  "Grammar",
  "Vocabulary",
  "Reading",
  "Listening",
  "Speaking",
  "Writing",
] as const;


export const TECHNOLOGY_OPTIONS = [
  "No technology",
  "Board only",
  "Projector / screen",
  "Projector + audio",
  "Computer lab / student devices",
  "Full technology (internet, devices, audio)",
] as const;

export const TEACHING_STYLE_OPTIONS = [
  "Communicative",
  "Task-based",
  "Traditional / structured",
  "Game-based",
  "Discussion-led",
  "Exam preparation",
] as const;

export const HOMEWORK_OPTIONS = ["Yes", "No", "Short (10 minutes)", "Project-style"] as const;

/** Kids / Teens / Adults band derived from the chosen age. Drives AI tone. */
export function ageBand(studentAge: string): "Kids" | "Teens" | "Adults" {
  const a = studentAge.trim().toLowerCase();
  if (a.startsWith("adult")) return "Adults";
  const first = Number.parseInt(a, 10);
  if (Number.isNaN(first)) return "Teens";
  if (first <= 9) return "Kids";
  if (first <= 12) return "Kids";
  return "Teens";
}

export const lessonRequestSchema = z
  .object({
    subject: z.string().min(1, "Subject is required").default("English"),
    topic: z.string().min(2, "Please enter the topic of the class"),
    studentAge: z.string().min(1, "Please choose the student age"),
    level: z.string().min(1, "Please choose the English level"),
    durationMinutes: z.number().int().positive(),
    mainSkill: z.string().min(1, "Please choose the main skill"),
    secondarySkill: z.string().nullable().default(null),

    learningObjective: z.string().min(10, "Please describe what students will be able to do"),
    numberOfStudents: z.string().optional(),
    previousKnowledge: z.string().optional(),
    textbookUnit: z.string().optional(),
    requiredVocabulary: z.string().optional(),
    curriculumStandard: z.string().optional(),
    technologyAvailable: z.string().optional(),
    classroomLimitations: z.string().optional(),
    homeworkRequirement: z.string().optional(),
    teachingStyle: z.string().optional(),
    teacherNotes: z.string().optional(),
    groupWorkEnabled: z.boolean().default(false),
    studentsPerGroup: z.number().int().nullable().default(null),
  })
  .superRefine((value, ctx) => {
    if (!value.groupWorkEnabled) return;
    const n = value.studentsPerGroup;
    if (n === null || n === undefined || Number.isNaN(n) || n < 2 || n > 20) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["studentsPerGroup"],
        message: "Choose between 2 and 20 students per group.",
      });
    }
  });

export type LessonRequestInput = z.infer<typeof lessonRequestSchema>;


/* ------------------------------ Pass 1 ---------------------------------- */
export const foundationSchema = z.object({
  overview: z.object({
    topic: z.string(),
    age: z.string(),
    level: z.string(),
    duration: z.string(),
    mainSkill: z.string(),
    learningObjective: z.string(),
    successCriteria: z.array(z.string()),
    prerequisiteKnowledge: z.array(z.string()),
    keyLanguage: z.array(z.string()),
    materialsNeeded: z.array(z.string()),
    anticipatedDifficulties: z.array(z.object({ difficulty: z.string(), solution: z.string() })),
    teacherPreparation: z.array(z.string()),
  }),

  lessonPlan: z.object({
    totalMinutes: z.number(),
    stages: z.array(
      z.object({
        time: z.number(),
        stage: z.string(),
        teacherActions: z.string(),
        studentActions: z.string(),
        materials: z.string(),
        purpose: z.string(),
      }),
    ),
  }),
});

/* ------------------------------ Worksheet -------------------------------- */

/** Formats the generator may choose from. Chosen per section, per lesson. */
export const WORKSHEET_FORMATS = [
  "fill-in-the-blank",
  "multiple-choice",
  "matching",
  "categorisation",
  "rewrite",
  "error-correction",
  "short-answer",
  "reading",
  "table",
  "speaking-prompts",
  "writing",
  "checklist",
] as const;

export const worksheetItemSchema = z.object({
  number: z.number(),
  prompt: z.string(),
  /** Options for multiple choice / matching. Empty array when not applicable. */
  choices: z.array(z.string()),
  /** How many blank writing lines to print under this item (0 = none). */
  answerLines: z.number(),
  /**
   * Small topic-related picture cue for young children (ages 6-9 only).
   * One lowercase keyword such as "star", "rocket", "cat". Empty string otherwise.
   */
  visual: z.string(),
});

export const worksheetStudentSectionSchema = z.object({
  label: z.string(),
  title: z.string(),
  format: z.string(),
  instructions: z.string(),
  /** Reading passage, dialogue or table intro. Empty string when unused. */
  passage: z.string(),
  wordBank: z.array(z.string()),
  items: z.array(worksheetItemSchema),
});

export const worksheetTeacherSectionSchema = z.object({
  label: z.string(),
  title: z.string(),
  answers: z.array(z.string()),
  explanation: z.string(),
  expectedResponses: z.array(z.string()),
  commonErrors: z.array(z.string()),
  corrections: z.array(z.string()),
  teacherNotes: z.string(),
});

const worksheetStudentDocSchema = z.object({
  title: z.string(),
  instructions: z.string(),
  sections: z.array(worksheetStudentSectionSchema),
});

export const worksheetSchema = z.object({
  title: z.string(),
  student: worksheetStudentDocSchema,
  /** Second equivalent student worksheet (Kids only). Empty sections otherwise. */
  studentB: worksheetStudentDocSchema,
  teacher: z.object({
    overview: z.string(),
    groupWorkGuidance: z.string(),
    sections: z.array(worksheetTeacherSectionSchema),
  }),
  /** Answers for studentB, section by section. Empty array when studentB is unused. */
  teacherB: z.array(worksheetTeacherSectionSchema),
});


export type Worksheet = z.infer<typeof worksheetSchema>;

/** Older saved lessons stored a single flat worksheet. Upgrade them on read. */
export function normalizeWorksheet(input: unknown, answerKey?: unknown): Worksheet {
  const w = (input ?? {}) as Record<string, any>;

  const emptyDoc = { title: "", instructions: "", sections: [] as any[] };

  const normStudentDoc = (doc: any, fallbackTitle: string) => ({
    title: typeof doc?.title === "string" && doc.title ? doc.title : fallbackTitle,
    instructions: String(doc?.instructions ?? ""),
    sections: (Array.isArray(doc?.sections) ? doc.sections : []).map((s: any, i: number) => ({
      label: String(s?.label ?? `Section ${String.fromCharCode(65 + i)}`),
      title: String(s?.title ?? ""),
      format: String(s?.format ?? "short-answer"),
      instructions: String(s?.instructions ?? ""),
      passage: String(s?.passage ?? ""),
      wordBank: Array.isArray(s?.wordBank) ? s.wordBank.map(String) : [],
      items: (Array.isArray(s?.items) ? s.items : []).map((item: any, j: number) => ({
        number: typeof item?.number === "number" ? item.number : j + 1,
        prompt: String(item?.prompt ?? item ?? ""),
        choices: Array.isArray(item?.choices) ? item.choices.map(String) : [],
        answerLines: typeof item?.answerLines === "number" ? item.answerLines : 1,
        visual: String(item?.visual ?? ""),
      })),
    })),
  });

  const normTeacherSections = (arr: any): any[] =>
    (Array.isArray(arr) ? arr : []).map((s: any, i: number) => ({
      label: String(s?.label ?? `Section ${String.fromCharCode(65 + i)}`),
      title: String(s?.title ?? ""),
      answers: Array.isArray(s?.answers) ? s.answers.map(String) : [],
      explanation: String(s?.explanation ?? ""),
      expectedResponses: Array.isArray(s?.expectedResponses) ? s.expectedResponses.map(String) : [],
      commonErrors: Array.isArray(s?.commonErrors) ? s.commonErrors.map(String) : [],
      corrections: Array.isArray(s?.corrections) ? s.corrections.map(String) : [],
      teacherNotes: String(s?.teacherNotes ?? ""),
    }));

  const title = typeof w["title"] === "string" && w["title"] ? w["title"] : "Worksheet";

  if (w["student"] && w["teacher"]) {
    return {
      title,
      student: normStudentDoc(w["student"], title),
      studentB: normStudentDoc(w["studentB"] ?? emptyDoc, `${title} — Version B`),
      teacher: {
        overview: String(w["teacher"]?.overview ?? ""),
        groupWorkGuidance: String(w["teacher"]?.groupWorkGuidance ?? ""),
        sections: normTeacherSections(w["teacher"]?.sections),
      },
      teacherB: normTeacherSections(w["teacherB"]),
    };
  }

  const legacySections: any[] = Array.isArray(w["sections"]) ? w["sections"] : [];
  const keySections: any[] = Array.isArray((answerKey as any)?.sections)
    ? (answerKey as any).sections
    : [];

  return {
    title,
    student: normStudentDoc(
      {
        title,
        instructions: "",
        sections: legacySections.map((s, i) => ({
          label: `Section ${String.fromCharCode(65 + i)}`,
          title: s?.title ?? "",
          format: s?.stage ?? "short-answer",
          instructions: s?.instructions ?? "",
          items: (Array.isArray(s?.items) ? s.items : []).map((item: string, j: number) => ({
            number: j + 1,
            prompt: String(item),
          })),
        })),
      },
      title,
    ),
    studentB: normStudentDoc(emptyDoc, `${title} — Version B`),
    teacher: {
      overview: "",
      groupWorkGuidance: "",
      sections: normTeacherSections(
        legacySections.map((s, i) => ({
          label: `Section ${String.fromCharCode(65 + i)}`,
          title: s?.title ?? "",
          answers: keySections[i]?.answers ?? [],
          teacherNotes: keySections[i]?.notes ?? "",
        })),
      ),
    },
    teacherB: [],
  };
}


/* ------------------------------ Pass 2 ---------------------------------- */

export const SLIDE_LAYOUTS = [
  "title",
  "goal",
  "hook",
  "content",
  "vocabulary",
  "question",
  "practice",
  "expressions",
  "activity",
  "review",
] as const;

export const slideVocabularySchema = z.object({
  word: z.string(),
  definition: z.string(),
  example: z.string(),
  /** Short description of an original illustration for this word. */
  imagePrompt: z.string(),
});

export const slideSchema = z.object({
  number: z.number(),
  title: z.string(),
  /** One of SLIDE_LAYOUTS. Drives how the slide is rendered and exported. */
  layout: z.string(),
  /** Short intro / display sentence. May be empty when bullets carry the slide. */
  studentText: z.string(),
  /** Display lines shown as bullets. Empty array when unused. */
  bullets: z.array(z.string()),
  /** Words/phrases inside the slide text that must be highlighted in red. */
  highlightWords: z.array(z.string()),
  /** What students actually DO on this slide. Empty string for display-only slides. */
  interaction: z.string(),
  /** Vocabulary taught on this slide (layout "vocabulary"). Empty array otherwise. */
  vocabulary: z.array(slideVocabularySchema),
  visualSuggestion: z.string(),
  /** Illustration description for the whole slide. Empty string when no image helps. */
  imagePrompt: z.string(),
  teacherNote: z.string(),
  purpose: z.string(),
});

export type Slide = z.infer<typeof slideSchema>;

/** Older lessons stored plain slides. Upgrade them on read so the UI never breaks. */
export function normalizeSlides(input: unknown): Slide[] {
  const raw = Array.isArray((input as any)?.slides) ? (input as any).slides : [];
  return raw.map((s: any, i: number) => ({
    number: typeof s?.number === "number" ? s.number : i + 1,
    title: String(s?.title ?? ""),
    layout: typeof s?.layout === "string" && s.layout ? s.layout : i === 0 ? "title" : "content",
    studentText: String(s?.studentText ?? ""),
    bullets: Array.isArray(s?.bullets) ? s.bullets.map(String) : [],
    highlightWords: Array.isArray(s?.highlightWords) ? s.highlightWords.map(String) : [],
    interaction: String(s?.interaction ?? ""),
    vocabulary: Array.isArray(s?.vocabulary)
      ? s.vocabulary.map((v: any) => ({
          word: String(v?.word ?? ""),
          definition: String(v?.definition ?? ""),
          example: String(v?.example ?? ""),
          imagePrompt: String(v?.imagePrompt ?? ""),
        }))
      : [],
    visualSuggestion: String(s?.visualSuggestion ?? ""),
    imagePrompt: String(s?.imagePrompt ?? s?.visualSuggestion ?? ""),
    teacherNote: String(s?.teacherNote ?? ""),
    purpose: String(s?.purpose ?? ""),
  }));
}

export const materialsSchema = z.object({
  presentation: z.object({
    slides: z.array(slideSchema),
  }),

  worksheet: worksheetSchema,

  answerKey: z.object({
    sections: z.array(
      z.object({
        title: z.string(),
        answers: z.array(z.string()),
        notes: z.string(),
      }),
    ),
  }),
  activity: z.object({
    title: z.string(),
    objective: z.string(),
    time: z.string(),
    grouping: z.string(),
    materials: z.string(),
    teacherInstructions: z.array(z.string()),
    studentInstructions: z.array(z.string()),
    example: z.string(),
    variation: z.string(),
  }),
});

/* ------------------------------ Pass 3 ---------------------------------- */
const questionSetSchema = z.object({
  title: z.string(),
  instructions: z.string(),
  questions: z.array(z.object({ prompt: z.string(), type: z.string(), answer: z.string() })),
});

export const assessmentSchema = z.object({
  homework: z.object({
    title: z.string(),
    instructions: z.string(),
    tasks: z.array(z.string()),
    estimatedTime: z.string(),
  }),
  exitTicket: z.object({
    title: z.string(),
    timeMinutes: z.number(),
    questions: z.array(z.string()),
    successIndicator: z.string(),
  }),
  assessment: questionSetSchema,
  versionB: questionSetSchema,
});

/* ------------------------------ Pass 4 ---------------------------------- */
export const differentiationSchema = z.object({
  supportVersion: z.object({
    summary: z.string(),
    sentenceFrames: z.array(z.string()),
    wordBank: z.array(z.string()),
    examples: z.array(z.string()),
    steps: z.array(z.string()),
    guidedPractice: z.array(z.string()),
  }),
  challengeVersion: z.object({
    summary: z.string(),
    tasks: z.array(z.string()),
    extensionQuestions: z.array(z.string()),
  }),
  teacherNotes: z.object({
    problems: z.array(z.object({ problem: z.string(), solution: z.string() })),
    tips: z.array(z.string()),
  }),
  qualityCheck: z.object({
    checks: z.array(z.object({ criterion: z.string(), status: z.string(), comment: z.string() })),
    overallNotes: z.string(),
  }),
});

export type Foundation = z.infer<typeof foundationSchema>;
export type Materials = z.infer<typeof materialsSchema>;
export type Assessment = z.infer<typeof assessmentSchema>;
export type Differentiation = z.infer<typeof differentiationSchema>;

export type LessonPackage = Foundation & Materials & Assessment & Differentiation & { reading?: import("./reading").ReadingState };

export const GENERATION_STEPS = [
  { key: "foundation", label: "Analyzing learning objective" },
  { key: "foundation2", label: "Designing lesson progression" },
  { key: "materials", label: "Building classroom activities" },
  { key: "materials2", label: "Creating student materials" },
  { key: "assessment", label: "Creating assessment" },
  { key: "differentiation", label: "Creating differentiated versions" },
  { key: "quality", label: "Running quality control" },
] as const;

/* --------------------- Single-section regeneration ----------------------- */

/** Schemas used when a teacher regenerates one component of a saved lesson. */
export const SECTION_SCHEMAS = {
  presentation: z.object({ presentation: materialsSchema.shape.presentation }),
  worksheet: z.object({ worksheet: worksheetSchema, answerKey: materialsSchema.shape.answerKey }),
  activity: z.object({ activity: materialsSchema.shape.activity }),
  homework: z.object({ homework: assessmentSchema.shape.homework }),
  assessment: z.object({
    assessment: assessmentSchema.shape.assessment,
    versionB: assessmentSchema.shape.versionB,
  }),
  exitTicket: z.object({ exitTicket: assessmentSchema.shape.exitTicket }),
} as const;

export type SectionKeyName = keyof typeof SECTION_SCHEMAS;

export const SECTION_LABELS: Record<SectionKeyName, string> = {
  presentation: "Presentation",
  worksheet: "Worksheet",
  activity: "Activity",
  homework: "Homework",
  assessment: "Assessment",
  exitTicket: "Exit Ticket",
};
