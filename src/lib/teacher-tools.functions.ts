import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { savedClassSchema, feedbackSchema } from './teacher-tools';
import { teacherToolsStore } from './teacher-tools-store.server';
import { ownedLesson, requireFeedbackOwner } from './teacher-tools-access.server';

function store() { setResponseHeader('Cache-Control','no-store'); return teacherToolsStore(); }
const lessonId = z.object({lessonId:z.string().uuid()});
export const listSavedClasses = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .handler(async({context}) => store().classes(context.userId));
export const saveClassSettings = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((data:unknown) => savedClassSchema.parse(data))
  .handler(async({data,context}) => ({id:store().saveClass(context.userId,data)}));
export const removeSavedClass = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((data:unknown) => z.object({id:z.string().uuid()}).parse(data))
  .handler(async({data,context}) => { store().deleteClass(context.userId,data.id); return {ok:true}; });
export const listFavorites = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .handler(async({context}) => store().favorites(context.userId));
export const setLessonFavorite = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((data:unknown) => lessonId.extend({active:z.boolean()}).parse(data))
  .handler(async({data,context}) => {
    await ownedLesson(context.supabase,context.userId,data.lessonId);
    store().favorite(context.userId,data.lessonId,data.active); return {ok:true};
  });
export const getLessonFeedback = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((data:unknown) => lessonId.parse(data))
  .handler(async({data,context}) => {
    await ownedLesson(context.supabase,context.userId,data.lessonId);
    return store().feedback(context.userId,data.lessonId);
  });
export const submitLessonFeedback = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((data:unknown) => feedbackSchema.parse(data))
  .handler(async({data,context}) => {
    const lesson = await ownedLesson(context.supabase,context.userId,data.lessonId);
    store().saveFeedback(context.userId,data,{topic:lesson.topic,level:lesson.level,teacher:typeof context.claims.email==='string'?context.claims.email:'Teacher'});
    return {ok:true};
  });
export const listTeacherFeedback = createServerFn({method:'POST'}).middleware([requireSupabaseAuth])
  .inputValidator((data:unknown) => z.object({offset:z.number().int().min(0).max(100000).default(0)}).parse(data))
  .handler(async({data,context}) => { requireFeedbackOwner(context.userId); return store().feedbackPage(data.offset); });
