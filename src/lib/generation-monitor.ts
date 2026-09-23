import type { LessonRequestInput } from './lesson-schema';
import { safeDiagnostic } from './management';

/** Browser failures (gateway pages and exports) cannot always reach server generation handlers. */
export async function trackClientGeneration<T>(request: LessonRequestInput, part: string, run: () => Promise<T>, detail = ''): Promise<T> {
  if(typeof window==='undefined')return run();
  const id = crypto.randomUUID();
  const send = async (status: 'started' | 'completed' | 'failed', error?: unknown) => {
    try {
      const {supabase} = await import('@/integrations/supabase/client');
      const {data} = await supabase.auth.getSession();
      if(!data.session)return;
      await fetch('/api/generation-events', {method:'POST',keepalive:true,signal:AbortSignal.timeout(8000),
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token}`},
        body:JSON.stringify({id,request,part,detail:detail.slice(0,4000),status,...(error!==undefined?{error:safeDiagnostic(error)}:{})})});
    }catch{/* Reporting must never interrupt a teacher's work. */}
  };
  const started = send('started');
  try {
    const value=await run();
    const failure=value&&typeof value==='object'&&'status'in value&&value.status==='failed'?(value as any).error:undefined;
    void started.then(()=>send(failure?'failed':'completed',failure));return value;
  }catch(error){void started.then(()=>send('failed',error));throw error;}
}
