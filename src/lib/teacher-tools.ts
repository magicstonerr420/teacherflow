import { z } from 'zod';
import { AGE_OPTIONS, LEVEL_OPTIONS, DURATION_OPTIONS, TECHNOLOGY_OPTIONS } from './lesson-schema.ts';

export const classSettingsSchema = z.object({
  studentAge: z.enum(AGE_OPTIONS),
  level: z.enum(LEVEL_OPTIONS),
  durationMinutes: z.number().refine(n => (DURATION_OPTIONS as readonly number[]).includes(n), 'Choose a class duration.'),
  technologyAvailable: z.union([z.literal(''), z.enum(TECHNOLOGY_OPTIONS)]).default(''),
});
export const savedClassSchema = z.object({
  id: z.string().uuid().optional(), name: z.string().trim().min(1, 'Name this class.').max(60),
  settings: classSettingsSchema,
});
export type ClassSettings = z.infer<typeof classSettingsSchema>;
export type SavedClass = { id: string; name: string; settings: ClassSettings };
export const timeSavedLabels = {
  took_longer: 'It took longer than my usual preparation',
  none: 'No time saved',
  under_15: '1–14 minutes',
  minutes_15_29: '15–29 minutes',
  minutes_30_59: '30–59 minutes',
  hour_plus: 'An hour or more',
  not_sure: 'Not sure yet',
} as const;
export const wouldPayLabels = {yes: 'Yes', maybe: 'Maybe, depending on the price', no: 'No', not_sure: 'Not sure yet'} as const;
export const feedbackSchema = z.object({
  lessonId: z.string().uuid(),
  usedInClass: z.enum(['yes', 'not_yet']),
  editing: z.enum(['none', 'a_little', 'a_lot']),
  timeSaved: z.enum(['took_longer', 'none', 'under_15', 'minutes_15_29', 'minutes_30_59', 'hour_plus', 'not_sure']).nullable().optional(),
  wouldPay: z.enum(['yes', 'maybe', 'no', 'not_sure']).nullable().optional(),
  comment: z.string().trim().max(2000).default(''),
});
export type LessonFeedback = z.infer<typeof feedbackSchema>;
export type FeedbackEntry = LessonFeedback & { topic: string; level: string; teacher: string; updatedAt: string };
export const editingLabels = { none: 'None', a_little: 'A little', a_lot: 'A lot' } as const;

export function filterLibrary<T extends {id:string; topic:string; level:string; main_skill:string}>(
  lessons: T[], filters: {search:string; level:string; skill:string; favoritesOnly:boolean}, favorites: string[],
): T[] {
  const term = filters.search.trim().toLocaleLowerCase();
  const starred = new Set(favorites);
  return lessons.filter(lesson => lesson.topic.toLocaleLowerCase().includes(term)
    && (!filters.level || lesson.level === filters.level)
    && (!filters.skill || lesson.main_skill === filters.skill)
    && (!filters.favoritesOnly || starred.has(lesson.id)));
}
