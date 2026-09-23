import { z } from "zod";

export const studentShareSections = ["worksheet", "reading", "listening", "homework"] as const;
export const studentShareSectionSchema = z.enum(studentShareSections);
export type StudentShareSection = z.infer<typeof studentShareSectionSchema>;
export const studentShareLessonSchema = z.object({ lessonId: z.string().uuid() }).strict();
export const studentShareIdSchema = z.object({ id: z.string().uuid() }).strict();
export const createStudentShareSchema = studentShareLessonSchema
  .extend({
    sections: z
      .array(studentShareSectionSchema)
      .min(1)
      .max(4)
      .refine((v) => new Set(v).size === v.length),
    expiresInDays: z.union([z.literal(7), z.literal(30)]),
  })
  .strict();
export const studentShareTokenSchema = z
  .object({ token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
  .strict();

const text = z.string().max(16000);
const strings = z.array(text).max(80);
const question = z.object({ question: text, choices: strings }).strict();
const document = z
  .object({
    title: text,
    instructions: text,
    sections: z
      .array(
        z
          .object({
            label: text,
            title: text,
            format: text,
            instructions: text,
            passage: text,
            wordBank: strings,
            items: z
              .array(
                z
                  .object({
                    number: z.number().int().min(0).max(999),
                    prompt: text,
                    choices: strings,
                    answerLines: z.number().int().min(0).max(30),
                    visual: text,
                  })
                  .strict(),
              )
              .max(80),
          })
          .strict(),
      )
      .max(30),
  })
  .strict();

/** This contract has no teacher, account, answer-key, or generation metadata fields. */
export const publicStudentShareSchema = z
  .object({
    title: text,
    updatedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
    worksheet: z.object({ student: document, studentB: document.optional() }).strict().optional(),
    reading: z
      .object({ title: text, instructions: text, text, questions: z.array(question).max(8) })
      .strict()
      .optional(),
    listening: z
      .object({
        title: text,
        instructions: text,
        questions: z.array(question).max(8),
        audio: z
          .object({
            dataUrl: z
              .string()
              .max(11_200_000)
              .regex(/^data:audio\/mpeg;base64,[A-Za-z0-9+/]+={0,2}$/),
            mime: z.literal("audio/mpeg"),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    homework: z
      .object({ title: text, instructions: text, tasks: strings, estimatedTime: text })
      .strict()
      .optional(),
  })
  .strict();
export type PublicStudentShare = z.infer<typeof publicStudentShareSchema>;
export type StudentShareSummary = {
  id: string;
  token: string;
  sections: StudentShareSection[];
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  status: "active" | "expired" | "revoked";
};
