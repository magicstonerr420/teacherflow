import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useBetaStatus } from '@/hooks/useBetaStatus';
import { betaMode, claimBeta } from '@/lib/beta.functions';
import { ACCOUNT_READ_STALE_MS, readRequest } from '@/lib/read-request';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { LessonRequestInput } from '@/lib/lesson-schema';
import { Link } from '@tanstack/react-router';

export function BetaAccess({onOpen,onAccess}: {onOpen: (request: LessonRequestInput)=>void; onAccess: (allowed:boolean)=>void}) {
  const {isAuthenticated,loading,user,status,error:statusError,refresh}=useBetaStatus();
  const claimFn=useServerFn(claimBeta), modeFn=useServerFn(betaMode);
  const cache=useQueryClient();
  const mode=useQuery({
    queryKey:['beta-mode'],
    queryFn:({signal})=>readRequest(requestSignal=>modeFn({signal:requestSignal}),{signal}),
    staleTime:ACCOUNT_READ_STALE_MS,
    retry:false,
  });
  const enabled=mode.data===true;
  const [code,setCode]=useState('');
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const automaticAttempt=useRef('');
  useEffect(()=>{
    const invite=new URLSearchParams(window.location.hash.slice(1)).get('invite');
    if(invite){localStorage.setItem('teacherflow-beta-invite',JSON.stringify({code:invite,expires:Date.now()+86400000}));history.replaceState(null,'',window.location.pathname+window.location.search);}
    try {const saved=JSON.parse(localStorage.getItem('teacherflow-beta-invite')||'null');if(saved?.expires>Date.now())setCode(saved.code);else localStorage.removeItem('teacherflow-beta-invite');}catch{localStorage.removeItem('teacherflow-beta-invite');}
  },[]);
  useEffect(()=>{
    onAccess(!mode.isError && (mode.data===false || (enabled && isAuthenticated && !statusError && !!status?.enabled && (!!status.owner || (!!status.claimed && status.remaining>0)))));
  },[mode.data,mode.isError,enabled,isAuthenticated,status,statusError,onAccess]);
  useEffect(()=>{
    const attemptKey=`${user?.id}:${code}`;
    if(enabled && isAuthenticated && status && !statusError && !status.claimed && code && !busy && automaticAttempt.current!==attemptKey){
      automaticAttempt.current=attemptKey;
      void claim();
    }
  },[enabled,isAuthenticated,status,statusError,user?.id,code,busy]);
  async function claim(){
    setBusy(true);setError('');
    try{
      await claimFn({data:code.trim()});localStorage.removeItem('teacherflow-beta-invite');setCode('');
      // The navigation and builder share this account's result. Refetch after a claim.
      await cache.invalidateQueries({queryKey:['beta-access-status',user?.id],exact:true});
    }
    catch(e){setError(e instanceof Error?e.message:'Could not claim invitation.');}
    finally{setBusy(false);}
  }
  const readError=mode.error || statusError;
  if(!enabled && !mode.isError)return null;
  if(readError)return <section className="my-6 space-y-3 rounded-xl border bg-card p-5" aria-label="Teacher beta access">
    <p role="alert">Could not check your beta access. Your invitation and saved lessons are kept.</p>
    <Button variant="outline" disabled={mode.isFetching} onClick={()=>{if(mode.isError)void mode.refetch();else void refresh();}}>Retry access check</Button>
  </section>;
  if(status && !status.enabled)return <section role="status" className="my-6 rounded-xl border bg-card p-5">Lesson generation is temporarily paused. You can still explore TeacherFlow and open saved lessons.</section>;
  if(status?.owner)return <section className="my-6 space-y-3 rounded-xl border bg-card p-5" aria-label="Owner workspace">
    <h2 className="font-semibold">Owner workspace</h2>
    <p>You can generate lessons without the three-lesson beta limit.</p>
    <p className="text-sm">AI usage is billed to your OpenRouter account. Teacher invitations still have their own three-lesson allowance.</p>
    <Button asChild variant="outline"><Link to="/beta-management">Open Beta management</Link></Button>
  </section>;
  return <section className="my-6 space-y-3 rounded-xl border bg-card p-5" aria-label="Teacher beta access">
    <h2 className="font-semibold">Private teacher beta</h2>
    <p className="text-sm">Signing in, including with Google, does not activate generation. You need an active invitation from the owner.</p>
    {!status?.claimed && <p className="text-sm"><Link className="font-medium text-primary underline" to="/request-access">Request beta access or check your request status</Link></p>}
    <p className="text-sm">Three lessons per invited account, with up to six illustrations and one recording per lesson. Progress and completed images are saved for reuse.</p>
    {loading ? <p>Checking sign-in…</p> : !isAuthenticated ? <a className="underline" href="/auth?redirect=%2Fbuilder">Sign in or create an account to claim your invitation</a> : !status && !error ? <p>Checking your account access…</p> : status?.claimed ? <>
      <p className="font-medium">{status.remaining} new lesson slots remaining · {status.completed} of 3 lessons completed</p>
      {status.remaining===0 && <p className="text-sm font-medium">Your beta allowance is used. You can still open and download your saved lessons. New lessons require an allowance reset from the organizer; another invitation will not start a new trial for this email.</p>}
      <Button variant="outline" size="sm" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await refresh({throwOnError:true});}catch(e){setError(e instanceof Error?e.message:'Could not refresh allowance.');}finally{setBusy(false);}}}>Refresh allowance</Button>
      <p className="text-sm">Starting a lesson reserves a slot. Failed parts can resume in that slot; they do not use another. Each part has up to three attempts, and each illustration has up to two.</p>
      {status.lessons.map((item:any,i:number)=><div key={i}><Button variant="outline" onClick={()=>onOpen(item.request)}>{item.complete?'Reopen':'Resume'}: {item.request.topic}</Button></div>)}
    </> : status && 'revoked' in status && status.revoked ? <p role="status">Your beta access has been removed. Contact the organizer about future access. Your saved lessons have been kept.</p> : <div className="flex flex-wrap gap-2"><Input aria-label="Invitation code" placeholder="Invitation code" value={code} onChange={e=>setCode(e.target.value)} /><Button onClick={()=>void claim()} disabled={busy||!code.trim()}>{busy?'Claiming…':'Claim invitation'}</Button></div>}
    {error?<p role="alert" className="text-destructive">{error}</p>:null}
  </section>;
}
