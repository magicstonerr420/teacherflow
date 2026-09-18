import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { listBetaTeachers, manageBetaTeacher, createBetaInvitation, resetBetaAllowance } from '@/lib/beta-admin.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Roster = Awaited<ReturnType<typeof listBetaTeachers>>;
type Seat = Roster['seats'][number];
const date = (value:string|null) => value ? new Date(value).toLocaleString() : 'Not recorded';

export function BetaTeacherControls() {
  const list=useServerFn(listBetaTeachers), manage=useServerFn(manageBetaTeacher), create=useServerFn(createBetaInvitation);
  const reset=useServerFn(resetBetaAllowance);
  const [roster,setRoster]=useState<Roster|null>(null), [error,setError]=useState(''), [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false), [confirm,setConfirm]=useState<(Seat & {intent:'replace'|'deactivate'})|null>(null);
  const [labels,setLabels]=useState<Record<number,string>>({}), [shown,setShown]=useState<number|null>(null);
  const lock=useRef(false);
  const creation=useRef<string|null>(null);
  const resetAttempt=useRef<{seat:number;user:string;revision:string;allowanceRevision:string;operation:string}|null>(null);
  const confirmation=useRef<HTMLDivElement>(null);
  const invitationLink=useRef<HTMLInputElement>(null);
  useEffect(()=>{
    if(shown!==null){invitationLink.current?.scrollIntoView({block:'nearest'});invitationLink.current?.focus({preventScroll:true});invitationLink.current?.select();}
  },[shown]);
  useEffect(()=>{
    if(confirm){confirmation.current?.scrollIntoView({block:'center'});confirmation.current?.focus({preventScroll:true});}
  },[confirm]);
  function accept(value:Roster) {
    setRoster(value);setLabels(Object.fromEntries(value.seats.map(s=>[s.seat,s.label])));
  }
  async function refresh() {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');
    try{accept(await list());setConfirm(null);creation.current=null;resetAttempt.current=null;}catch(e){setError(e instanceof Error?e.message:'Could not load teacher access.');}
    finally{lock.current=false;setBusy(false);}
  }
  useEffect(()=>{void refresh();},[]);
  async function addInvitation() {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');setMessage('');
    try{
      creation.current??=crypto.randomUUID();
      const next=await create({data:{operation:creation.current}});
      accept(next);creation.current=null;setConfirm(null);setShown(next.seats.at(-1)?.seat??null);
      setMessage('New invitation created. Copy its link to share it with a teacher.');
    }catch(e){setError(e instanceof Error?e.message:'Could not create invitation. Refresh to check the latest list.');}
    finally{lock.current=false;setBusy(false);}
  }
  async function change(seat:Seat,action:'replace'|'label'|'deactivate') {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');setMessage('');
    try {
      accept(await manage({data:{seat:seat.seat,revision:seat.revision,user:seat.user,action,label:labels[seat.seat]??''}}));
      setConfirm(null);
      if(action==='replace')setShown(seat.seat);
      setMessage(action==='label'?'Invitation label saved.':action==='deactivate'?'Key deactivated. It cannot be claimed or used for new beta generation.':seat.user?'Teacher access removed. A replacement invitation is ready.':'Replacement invitation ready. The previous link is no longer valid.');
    }catch(e){setError(e instanceof Error?e.message:'Could not update teacher access. Refresh to check the latest status.');}
    finally{lock.current=false;setBusy(false);}
  }
  function link(seat:Seat) {return `${window.location.origin}/builder#invite=${seat.code}`;}
  async function resetLessons(seat:Seat) {
    if(lock.current||!seat.user)return;
    lock.current=true;setBusy(true);setError('');setMessage('');
    try {
      const previous=resetAttempt.current;
      if(!previous || previous.seat!==seat.seat || previous.user!==seat.user)resetAttempt.current={seat:seat.seat,user:seat.user,revision:seat.revision,allowanceRevision:seat.allowanceRevision,operation:crypto.randomUUID()};
      accept(await reset({data:resetAttempt.current!}));resetAttempt.current=null;
      setMessage('Lesson allowance reset to three. Their invitation, saved lessons, and spending history were kept. Ask the teacher to refresh their allowance.');
    } catch(e) {setError(e instanceof Error?e.message:'Could not reset this allowance. Retry or refresh teachers to check.');}
    finally {lock.current=false;setBusy(false);}
  }
  async function copy(seat:Seat) {
    setShown(seat.seat);setMessage('');
    try{await navigator.clipboard.writeText(link(seat));setMessage(`Invitation ${seat.seat} link copied.`);}
    catch{setMessage('Select the invitation link below and copy it.');}
  }
  return <section id="lesson-allowances" tabIndex={-1} className="scroll-mt-24 space-y-4 outline-none" aria-label="Beta teacher controls">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Beta teachers & invitations</h2>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={()=>void addInvitation()}>{creation.current?'Retry create invitation':'Create invitation'}</Button>
        <Button variant="outline" disabled={busy} onClick={()=>void refresh()}>Refresh teachers</Button>
      </div>
    </div>
    <p className="text-sm">Create and manage teacher invitation keys. Only your owner account can see these controls and invitation links.</p>
    {roster ? <>
      <p className="font-medium">{roster.seats.filter(s=>s.active&&s.user).length} active teachers · {roster.seats.filter(s=>s.active&&!s.user).length} unused invitations{roster.seats.some(s=>!s.active)?` · ${roster.seats.filter(s=>!s.active).length} deactivated`:''}</p>
      {roster.seats.length===0 && <p>No invitations yet. Use Create invitation to add one.</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        {roster.seats.map(seat=><article key={seat.seat} className="min-w-0 space-y-3 rounded-lg border p-4" aria-label={`Invitation ${seat.seat}`}>
          <h4 className="font-semibold">Invitation {seat.seat} — {!seat.active?'Deactivated':seat.user?'Active':'Unused'}</h4>
          <label className="block space-y-1 text-sm">
            <span>Private label</span>
            <Input maxLength={100} placeholder="Teacher name or your note" value={labels[seat.seat]??''} onChange={e=>setLabels(current=>({...current,[seat.seat]:e.target.value}))}/>
          </label>
          <Button size="sm" variant="outline" disabled={busy||labels[seat.seat]===seat.label} onClick={()=>void change(seat,'label')}>Save label</Button>
          {!seat.active ? <>
            <p className="text-sm">This key is deactivated. Its previous link no longer works.</p>
            <Button variant="outline" disabled={busy} onClick={()=>{setConfirm({...seat,intent:'replace'});setError('');}}>Activate with new link</Button>
          </> : seat.user ? <>
            {seat.name && <p className="break-words font-medium">{seat.name}</p>}
            <p className="break-all font-medium">{seat.email??'Email available after their next sign-in check'}</p>
            <p className="break-all text-xs text-muted-foreground">Account: {seat.user}</p>
            <p className="text-sm">{seat.completed} lessons completed · {seat.remaining} new lesson slots left</p>
            <Button variant="outline" disabled={busy||seat.remaining===3||seat.pending>0} onClick={()=>void resetLessons(seat)}>{resetAttempt.current?.seat===seat.seat?'Retry allowance reset':'Reset lesson allowance'}</Button>
            {seat.pending>0 && <p className="text-xs text-muted-foreground">{seat.pending} unfinished lesson(s). Finish or resume those before resetting the allowance.</p>}
            <p className="text-xs text-muted-foreground">Joined: {date(seat.claimedAt)}<br/>Last access check: {date(seat.lastSeenAt)}</p>
            <Button variant="destructive" disabled={busy} onClick={()=>{setConfirm({...seat,intent:'replace'});setError('');}}>Remove access</Button>
          </> : <>
            <p className="text-sm">One teacher can claim this invitation and generate three lessons.</p>
            {seat.code ? <Button disabled={busy} onClick={()=>void copy(seat)}>Copy invitation link</Button> : <p className="text-sm">Use your previously saved invitation link, or replace it below.</p>}
            {shown===seat.seat && seat.code && <Input ref={invitationLink} aria-label={`Invitation ${seat.seat} link`} readOnly value={link(seat)} onFocus={e=>e.target.select()}/>}
            <Button variant="outline" disabled={busy} onClick={()=>{setConfirm({...seat,intent:'replace'});setError('');}}>Replace invitation link</Button>
          </>}
          {seat.active && <Button className="block" variant="outline" disabled={busy} onClick={()=>{setConfirm({...seat,intent:'deactivate'});setError('');}}>Deactivate key</Button>}
        </article>)}
      </div>
      {confirm && <div ref={confirmation} tabIndex={-1} role="group" aria-label="Confirm invitation change" className="space-y-3 rounded-lg border border-destructive p-4">
        <p className="font-semibold">{confirm.intent==='deactivate'?`Deactivate invitation ${confirm.seat}?`:confirm.user?`Remove access for ${confirm.email||confirm.label||`account ${confirm.user}`}?`:`Replace invitation ${confirm.seat}?`}</p>
        <p className="text-sm">{confirm.user?'This blocks new beta generation and prevents this account from claiming another invitation. Requests already started may finish. Saved lessons and spending history are kept.':confirm.intent==='deactivate'?'Anyone holding this invitation link will no longer be able to claim it.':'Anyone holding the previous unused link will need your new link.'} {confirm.intent==='deactivate'?'No replacement invitation will be created.':'A new single-use invitation will replace the old link.'}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="destructive" disabled={busy} onClick={()=>void change(confirm,confirm.intent)}>{confirm.intent==='deactivate'?'Confirm deactivation':confirm.user?'Remove access & replace invitation':'Confirm replacement'}</Button>
          <Button variant="outline" disabled={busy} onClick={()=>setConfirm(null)}>Cancel</Button>
        </div>
      </div>}
      {!!roster.removed.length && <details className="rounded-lg border p-3">
        <summary>Removed teachers ({roster.removed.length})</summary>
        <ul className="mt-3 space-y-2 text-sm">{roster.removed.map(t=><li key={t.user} className="break-words">{t.name?`${t.name} · `:''}{t.email||t.user} · Removed {date(t.revokedAt)} · {t.savedLessons} saved lesson records retained</li>)}</ul>
      </details>}
      <p className="text-sm text-muted-foreground">Each invited teacher gets three lessons. Creating or replacing keys, or resetting an allowance, does not increase or reset your shared $10 round budget. An email used for the beta cannot claim a fresh trial through another account.</p>
    </> : <p>{busy?'Loading teacher access…':'Teacher access is unavailable. Use Refresh teachers to retry.'}</p>}
    {message && <p role="status" className="text-sm">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </section>;
}
