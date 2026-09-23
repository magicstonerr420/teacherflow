import type { LessonRequestInput, LessonPackage } from './lesson-schema';
import type { GenerationStage } from './generation-plan';

/** Public draft snapshots contain only the authenticated teacher's own work. */
export type LessonDraft = {
  id: string;
  request: LessonRequestInput;
  content: Partial<LessonPackage>;
  completedStages: GenerationStage[];
  nextStage: GenerationStage | null;
  status: 'ready' | 'generating' | 'failed' | 'complete' | 'saved';
  error: string | null;
  updatedAt: number;
  savedLessonId: string | null;
  activeUntil: number | null;
};
export type LessonDraftSummary = Omit<LessonDraft, 'content'>;
