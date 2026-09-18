import { useEffect, useRef, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { User } from '@supabase/supabase-js';
import { AppShell } from './AppShell';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { profileSchema,saveMyProfile,userProfile } from '@/lib/profile';

function ProfileForm({user}:{user:User}) {
  const [form,setForm]=useState(()=>userProfile(user));
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
  const [loadFailed,setLoadFailed]=useState(false),[reload,setReload]=useState(0);
  const lock=useRef(false),queryClient=useQueryClient();
  useEffect(()=>{
    let active=true;setLoading(true);setLoadFailed(false);setError('');
    void supabase.auth.getUser().then(({data,error})=>{
      if(!active)return;
      if(error||!data.user||data.user.id!==user.id){setError('Could not load your profile. Please try again.');setLoadFailed(true);}
      else setForm(userProfile(data.user));
    }).catch(()=>{if(active){setError('Could not load your profile. Please try again.');setLoadFailed(true);}})
      .finally(()=>{if(active)setLoading(false);});
    return ()=>{active=false;};
  },[user.id,reload]);
  async function submit(event:React.FormEvent) {
    event.preventDefault();if(lock.current||loading||loadFailed)return;
    const parsed=profileSchema.safeParse(form);
    if(!parsed.success){setError(parsed.error.issues[0]?.message??'Please check your profile fields.');return;}
    lock.current=true;setBusy(true);setSaved(false);setError('');
    try{
      setForm(await saveMyProfile(supabase.auth,parsed.data));setSaved(true);
      // Refresh the verified beta identity so the organizer sees the teacher's new name.
      void queryClient.invalidateQueries({queryKey:['beta-access-status']});
    }catch(e){setError(e instanceof Error?e.message:'Could not save your profile. Please try again.');}
    finally{lock.current=false;setBusy(false);}
  }
  return <form onSubmit={event=>void submit(event)} className="space-y-5 rounded-xl border bg-card p-5" aria-label="My profile details">
    <p className="text-sm text-muted-foreground">Your name helps the beta organizer recognize your account.</p>
    {loading && <p role="status">Loading your profile…</p>}
    <label className="block space-y-2"><span className="text-sm font-medium">Account email</span><Input readOnly type="email" value={user.email??''}/></label>
    <fieldset disabled={loading||busy||loadFailed} className="space-y-5">
      <label className="block space-y-2"><span className="text-sm font-medium">Full name</span><Input required autoComplete="name" maxLength={80} value={form.fullName} onChange={e=>{setSaved(false);setForm({...form,fullName:e.target.value});}}/></label>
      <label className="block space-y-2"><span className="text-sm font-medium">School or organization (optional)</span><Input autoComplete="organization" maxLength={120} value={form.school} onChange={e=>{setSaved(false);setForm({...form,school:e.target.value});}}/></label>
      <label className="block space-y-2"><span className="text-sm font-medium">Teaching role (optional)</span><Input autoComplete="organization-title" maxLength={80} placeholder="For example, elementary English teacher" value={form.teachingRole} onChange={e=>{setSaved(false);setForm({...form,teachingRole:e.target.value});}}/></label>
      <label className="block space-y-2"><span className="text-sm font-medium">About me (optional)</span><Textarea rows={4} maxLength={500} placeholder="Tell us a little about your teaching." value={form.bio} onChange={e=>{setSaved(false);setForm({...form,bio:e.target.value});}}/><span className="text-xs text-muted-foreground">{form.bio.length}/500 characters</span></label>
      <Button type="submit">{busy?'Saving…':'Save profile'}</Button>
    </fieldset>
    {loadFailed && <Button type="button" variant="outline" onClick={()=>setReload(value=>value+1)}>Retry loading profile</Button>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {saved && <p role="status" className="text-sm">Profile saved.</p>}
  </form>;
}
export function MyProfilePage() {
  const {loading,isAuthenticated,user}=useAuth();
  return <AppShell><div className="mx-auto max-w-2xl space-y-6 px-5 py-10">
    <div className="space-y-2"><h1 className="display-heading text-3xl">My profile</h1><p className="text-muted-foreground">Your name and teaching details, saved to your account.</p></div>
    {loading ? <p role="status">Checking sign-in…</p> : !isAuthenticated||!user ? <section className="space-y-4 rounded-xl border bg-card p-5">
      <p>Sign in to view and edit your profile.</p><Button asChild><Link to="/auth" search={{redirect:'/profile'}}>Sign in to My profile</Link></Button>
    </section> : <ProfileForm key={user.id} user={user}/>}
  </div></AppShell>;
}
