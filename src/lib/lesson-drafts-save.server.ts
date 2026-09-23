import type { LessonDraftStore } from './lesson-drafts-store.server.ts';

/** JSONB equality preserves exact inputs while ignoring irrelevant object-key order. */
export async function linkExistingLesson(store:LessonDraftStore,supabase:any,user:string,draftId:string) {
  const draft=store.get(user,draftId);
  if(draft.status!=='complete')return draft;
  const existing=await supabase.from('lessons').select('id').eq('user_id',user).eq('inputs',JSON.stringify(draft.request))
    .order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(existing.error)throw Error('We could not check your saved library. Your complete draft is retained; try again before saving another copy.');
  return existing.data?store.linkVerifiedLesson(user,draftId,existing.data.id):draft;
}

/** A deterministic insert makes lost save responses safe without overwriting teacher edits. */
export async function saveCompletedDraft(store:LessonDraftStore,supabase:any,user:string,draftId:string):Promise<{id:string}> {
  const saved=store.prepareSave(user,draftId);
  const existing=await supabase.from('lessons').select('id').eq('id',saved.id).eq('user_id',user).maybeSingle();
  if(existing.error)throw Error('We could not check whether this lesson was saved. Your complete draft is retained; try again.');
  if(existing.data){store.markSaved(user,draftId,saved.id);return {id:saved.id};}
  const linked=await linkExistingLesson(store,supabase,user,draftId);
  if(linked.savedLessonId)return {id:linked.savedLessonId};
  const r=saved.request;
  const result=await supabase.from('lessons').insert({id:saved.id,user_id:user,topic:r.topic,subject:r.subject,
    student_age:r.studentAge,level:r.level,duration_minutes:r.durationMinutes,main_skill:r.mainSkill,
    learning_objective:r.learningObjective,inputs:r,content:saved.content}).select('id').single();
  if(result.error){
    // A simultaneous save or a dropped insert response may already have committed.
    const recovered=await supabase.from('lessons').select('id').eq('id',saved.id).eq('user_id',user).maybeSingle();
    if(recovered.error||!recovered.data)throw Error('We could not save this lesson to your library. Your complete draft is retained; try saving again.');
  }
  store.markSaved(user,draftId,saved.id);
  return {id:saved.id};
}
