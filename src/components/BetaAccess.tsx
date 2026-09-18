import { useEffect, useRef, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { useAuth } from '@/hooks/useAuth';
import { betaMode, betaStatus, claimBeta } from '@/lib/beta.functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LessonRequestInput } from '@/lib/lesson-schema';
import { Link } from '@tanstack/react-router';

export function BetaAccess({onOpen,onAccess}: {onOpen: (request: LessonRequestInput)=>void; onAccess: (allowed:boolean)=>void}) {
  const {isAuthenticated,loading}=useAuth();
  const statusFn=useServerFn(betaStatus), claimFn=useServerFn(claimBeta), modeFn=useServerFn(betaMode);
  const [enabled,setEnabled]=useState(false);
  const [status,setStatus]=useState<Awaited<ReturnType<typeof betaStatus>> | null>(null);
  const [code,setCode]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const automaticAttempt=useRef('');
  useEffect(()=>{
    const invite=new URLSearchParams(window.location.hash.slice(1)).get('invite');
    if(invite){localStorage.setItem('teacherflow-beta-invite',JSON.stringify({code:invite,expires:Date.now()+86400000}));history.replaceState(null,'',window.location.pathname+window.location.search);}
    try {const saved=JSON.parse(localStorage.getItem('teacherflow-beta-invite')||'null');if(saved?.expires>Date.now())setCode(saved.code);else localStorage.removeItem('teacherflow-beta-invite');}catch{localStorage.removeItem('teacherflow-beta-invite');}
    modeFn().then(mode=>{setEnabled(mode);if(!mode)onAccess(true);}).catch(()=>setError('Could not check beta access. Refresh to retry.'));
  },[]);
  useEffect(()=>{if(enabled && isAuthenticated)statusFn().then(setStatus).catch(e=>setError(e.message));else setStatus(null);},[enabled,isAuthenticated]);
  useEffect(()=>{if(enabled)onAccess(!!status?.owner || (!!status?.claimed && status.remaining>0));},[enabled,status]);
  useEffect(()=>{
    if(enabled && isAuthenticated && status && !status.claimed && code && automaticAttempt.current!==code){
      automaticAttempt.current=code;
      void claim();
    }
  },[enabled,isAuthenticated,status,code]);
  async function claim(){
    setBusy(true);setError('');
    try{await claimFn({data:code.trim()});localStorage.removeItem('teacherflow-beta-invite');setCode('');setStatus(await statusFn());}
    catch(e){setError(e instanceof Error?e.message:'Could not claim invitation.');}
    finally{setBusy(false);}
  }
  if(!enabled && !error)return null;
  if(status?.owner)return <section className="my-6 space-y-3 rounded-xl border bg-card p-5" aria-label="Owner workspace">
    <h2 className="font-semibold">Owner workspace</h2>
    <p>You can generate lessons without the three-lesson beta limit.</p>
    <p className="text-sm">AI usage is billed to your OpenRouter account. Teacher invitations still have their own three-lesson allowance.</p>
    <Button asChild variant="outline"><Link to="/beta-management">Open Beta management</Link></Button>
  </section>;
  return <section className="my-6 space-y-3 rounded-xl border bg-card p-5" aria-label="Teacher beta access">
    <h2 className="font-semibold">Private teacher beta</h2>
    <p className="text-sm">Three lessons per invited account, with up to six illustrations and one recording per lesson. Progress and completed images are saved for reuse.</p>
    {loading ? <p>Checking sign-in…</p> : !isAuthenticated ? <a className="underline" href="/auth?redirect=%2Fbuilder">Sign in or create an account to claim your invitation</a> : !status && !error ? <p>Checking your account access…</p> : status?.claimed ? <>
      <p className="font-medium">{status.remaining} new lesson slots remaining · {status.completed} of 3 lessons completed</p>
      <p className="text-sm">Starting a lesson reserves a slot. Failed parts can resume in that slot; they do not use another. Each part has up to three attempts, and each illustration has up to two.</p>
      {status.lessons.map((item:any,i:number)=><div key={i}><Button variant="outline" onClick={()=>onOpen(item.request)}>{item.complete?'Reopen':'Resume'}: {item.request.topic}</Button></div>)}
    </> : status && 'revoked' in status && status.revoked ? <p role="status">Your beta access has been removed. Contact the organizer about future access. Your saved lessons have been kept.</p> : <div className="flex flex-wrap gap-2"><Input aria-label="Invitation code" placeholder="Invitation code" value={code} onChange={e=>setCode(e.target.value)} /><Button onClick={()=>void claim()} disabled={busy||!code.trim()}>{busy?'Claiming…':'Claim invitation'}</Button></div>}
    {error?<p role="alert" className="text-destructive">{error}</p>:null}
  </section>;
}
