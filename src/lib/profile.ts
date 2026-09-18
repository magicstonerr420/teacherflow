import { z } from 'zod';
import type { SupabaseClient, User } from '@supabase/supabase-js';

export const profileSchema=z.object({
  fullName:z.string().trim().min(1,'Enter your name.').max(80,'Use 80 characters or fewer for your name.'),
  school:z.string().trim().max(120),teachingRole:z.string().trim().max(80),bio:z.string().trim().max(500),
});
export type TeacherProfile=z.infer<typeof profileSchema>;
const text=(value:unknown,max:number)=>typeof value==='string'?value.slice(0,max):'';
export function userProfile(user:Pick<User,'user_metadata'>):TeacherProfile {
  const data=user.user_metadata??{}, details=data['teacherflow_profile'];
  const profile=details&&typeof details==='object'&&!Array.isArray(details)?details:{};
  return {fullName:text(data['full_name'],80),school:text(profile.school,120),teachingRole:text(profile.teachingRole,80),bio:text(profile.bio,500)};
}

/** The authenticated user's metadata is the profile source. No role, email or other user's ID can be written here. */
export async function saveMyProfile(auth:Pick<SupabaseClient['auth'],'updateUser'>,input:unknown) {
  const profile=profileSchema.parse(input);
  const {data,error}=await auth.updateUser({data:{
    full_name:profile.fullName,
    teacherflow_profile:{school:profile.school,teachingRole:profile.teachingRole,bio:profile.bio},
  }});
  if(error)throw new Error(error.message);
  if(!data.user)throw new Error('Your profile could not be saved. Sign in and try again.');
  return userProfile(data.user);
}
