import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { lessonRequestSchema } from './lesson-schema';
import { lessonDraftStore } from './lesson-drafts-store.server';
import { betaStore } from './beta-store.server';
import { linkExistingLesson } from './lesson-drafts-save.server';
export type { LessonDraft, LessonDraftSummary } from './lesson-drafts';

function ownedDrafts(user:string){
  setResponseHeader('Cache-Control','no-store');
  const store=lessonDraftStore();
  // No parsing/normalization here: legacy beta request fingerprints must stay exact.
  for(const progress of betaStore().draftProgress(user))if(!progress.complete||store.hasRequest(user,progress.request))store.retain(user,progress);
  return store;
}
export const ensureLessonDraft=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>{
    const parsed=z.object({request:lessonRequestSchema}).parse(input);
    return {...parsed,originalRequest:(input as {request:unknown}).request};
  })
  .handler(async({data,context})=>{
    const store=ownedDrafts(context.userId);
    const draft=store.ensureRequest(context.userId,data.originalRequest,data.request,betaStore().draftProgress(context.userId));
    return draft.status==='complete'?linkExistingLesson(store,context.supabase,context.userId,draft.id):draft;
  });
export const listLessonDrafts=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .handler(async({context})=>ownedDrafts(context.userId).list(context.userId));
export const getLessonDraft=createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((input:unknown)=>z.object({id:z.string().uuid()}).parse(input))
  .handler(async({data,context})=>ownedDrafts(context.userId).get(context.userId,data.id));
