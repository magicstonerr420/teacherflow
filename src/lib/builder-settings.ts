import type { LessonRequestInput } from './lesson-schema';

const key = (user: string) => `teacherflow-builder-settings:v1:${user}`;
type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Input convenience only. Generated lesson content is retained on the server. */
export function readBuilderSettings(storage: SettingsStorage, user: string, defaults: LessonRequestInput): LessonRequestInput {
  try {
    const saved = JSON.parse(storage.getItem(key(user)) || 'null');
    if (saved?.version !== 1 || !saved.form || typeof saved.form !== 'object') return defaults;
    const result = { ...defaults };
    for (const field of Object.keys(defaults) as (keyof LessonRequestInput)[]) {
      const value = saved.form[field];
      if (typeof defaults[field] === 'string' && typeof value === 'string' && value.length <= 20000)
        (result as Record<string, unknown>)[field] = value;
      else if (field === 'groupWorkEnabled' && typeof value === 'boolean') result[field] = value;
      else if (field === 'durationMinutes' && Number.isFinite(value) && value > 0) result[field] = value;
      else if (field === 'studentsPerGroup' && (value === null || Number.isFinite(value))) result[field] = value;
      else if (field === 'secondarySkill' && (value === null || typeof value === 'string')) result[field] = value;
    }
    return result;
  } catch { return defaults; }
}

export function writeBuilderSettings(storage: SettingsStorage, user: string, form: LessonRequestInput): boolean {
  try { storage.setItem(key(user), JSON.stringify({ version: 1, form })); return true; }
  catch { return false; }
}
