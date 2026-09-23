import { z } from "zod";
import type { SavedClass } from "./teacher-tools.ts";

/** A class keeps its own teaching history while sharing the original library lesson. */
export type ClassLessonLink = {
  classId: string;
  lessonId: string;
  taughtOn: string | null;
  notes: string;
  addedAt: string;
  updatedAt: string;
};

export type ClassLibrary = { classes: SavedClass[]; links: ClassLessonLink[] };

export const classLessonSchema = z.object({
  lessonId: z.string().uuid(),
  classId: z.string().uuid(),
});

export const taughtOnSchema = z
  .string()
  .refine((value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000-")) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Choose a valid teaching date.")
  .nullable();

export const updateClassLessonSchema = classLessonSchema.extend({
  taughtOn: taughtOnSchema,
  notes: z.string().max(2000, "Keep class notes to 2,000 characters or fewer."),
});

export const moveClassLessonSchema = classLessonSchema.extend({
  targetClassId: z.string().uuid(),
});
