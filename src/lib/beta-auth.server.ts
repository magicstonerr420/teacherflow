import { createClient } from '@supabase/supabase-js';

export async function betaUser(request: Request): Promise<string> {
  const token = request.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new Error('Sign in to use your teacher beta invitation.');
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_PUBLISHABLE_KEY'];
  if (!url || !key) throw new Error('Beta sign-in is not configured.');
  const client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error} = await client.auth.getUser(token);
  if(error || !data.user?.id) throw new Error('Your sign-in expired. Please sign in again.');
  return data.user.id;
}

/** Owner identity comes only from server configuration and verified Supabase ID. */
export function isOwner(userId: string): boolean {
  const owner = process.env['TEACHERFLOW_OWNER_USER_ID']?.trim();
  return !!owner && !!userId && owner === userId;
}
