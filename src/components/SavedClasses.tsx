import { useState, useId, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { listSavedClasses, saveClassSettings, removeSavedClass } from '@/lib/teacher-tools.functions';
import { savedClassSchema, type ClassSettings } from '@/lib/teacher-tools';
import type { LessonRequestInput } from '@/lib/lesson-schema';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

export function SavedClasses({form,onApply}:{form:LessonRequestInput;onApply:(settings:ClassSettings)=>void}) {
  const {user} = useAuth();
  const uid = useId();
  const [selected,setSelected] = useState('');
  const [name,setName] = useState('');
  const [message,setMessage] = useState('');
  useEffect(()=>{setSelected('');setName('');setMessage('');},[user?.id]);
  const load = useServerFn(listSavedClasses), save = useServerFn(saveClassSettings), remove = useServerFn(removeSavedClass);
  const cache = useQueryClient();
  const queryKey = ['saved-classes',user?.id];
  const classes = useQuery({queryKey,queryFn:()=>load(),enabled:!!user});
  const mutation = useMutation({
    mutationFn:async(action:'new'|'update'|'delete')=> {
      if(action==='delete') { await remove({data:{id:selected}}); return ''; }
      const parsed = savedClassSchema.safeParse({name, ...(action==='update'?{id:selected}:{}),settings:form});
      if(!parsed.success) throw new Error('Add a class name and choose its age, level, duration, and technology before saving.');
      return (await save({data:parsed.data})).id;
    },
    onSuccess:async(id,action)=> {setSelected(id); if(action==='delete')setName(''); await Promise.all([cache.invalidateQueries({queryKey}),cache.invalidateQueries({queryKey:['class-library',user?.id]})]);setMessage(action==='delete'?'Saved class removed.':'Class settings saved to your account.');},
    onError:(e)=>toast.error(e.message),
  });
  if(!user) return null;
  return <section aria-label="Saved class settings" className="mt-6 space-y-4 rounded-xl border bg-card p-5">
    <div><h2 className="font-semibold">Saved classes</h2><p className="mt-1 text-sm text-muted-foreground">Reuse age, English level, class duration, and technology. Your topic and objective stay as you entered them.</p></div>
    {classes.isError ? <p role="alert">Could not load saved classes. <Button type="button" variant="outline" size="sm" onClick={()=>void classes.refetch()}>Retry saved classes</Button></p> : <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor={uid+'-class'}>Choose a saved class</Label>
          <select id={uid+'-class'} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={selected} disabled={classes.isPending||mutation.isPending}
            onChange={e=>{const id=e.target.value;setSelected(id);setMessage('');const item=classes.data?.find(c=>c.id===id);setName(item?.name??'');if(item){onApply(item.settings);setMessage('Class settings applied. Review your topic and objective before building.');}}}>
            <option value="">{classes.isPending?'Loading classes…':'New class / custom settings'}</option>
            {classes.data?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="space-y-2"><Label htmlFor={uid+'-name'}>Class name</Label><Input id={uid+'-name'} maxLength={60} placeholder="Monday beginners" value={name} disabled={mutation.isPending} onChange={e=>setName(e.target.value)} /></div>
      </div>
      <p className="text-xs text-muted-foreground">Choose the class settings in the form below, then save them here.</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={mutation.isPending||classes.isPending} onClick={()=>mutation.mutate('new')}>Save as new class</Button>
        {selected && <><Button type="button" variant="outline" size="sm" disabled={mutation.isPending} onClick={()=>mutation.mutate('update')}>Update saved class</Button>
          <Button type="button" variant="ghost" size="sm" disabled={mutation.isPending} onClick={()=>{if(confirm('Remove this saved class? Your lessons will stay in My lessons.'))mutation.mutate('delete');}}>Remove saved class</Button></>}
      </div>
    </>}
    {message && <p role="status" className="text-sm text-primary">{message}</p>}
  </section>;
}
