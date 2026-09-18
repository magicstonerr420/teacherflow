import type { SupabaseClient } from '@supabase/supabase-js';
import { isOwner } from './beta-auth.server.ts';

export async function ownedLesson(supabase: SupabaseClient, userId: string, id: string) {
  const {data,error} = await supabase.from('lessons').select('id,topic,level').eq('id',id).eq('user_id',userId).maybeSingle();
  if (error || !data) throw new Error('This lesson is unavailable or belongs to another account.');
  return data as {id:string;topic:string;level:string};
}
export function requireFeedbackOwner(userId: string) {
  if (!isOwner(userId)) throw new Error('Only the TeacherFlow owner can read teacher feedback.');
}
