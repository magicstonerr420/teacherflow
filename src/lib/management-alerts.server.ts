import { ManagementStore, managementKey, type ManagedOperation } from './management-store.server.ts';
import { betaStore } from './beta-store.server.ts';
import { PART_NAMES } from './management.ts';
import { CONTACT_EMAIL, SITE_ORIGIN } from '../config/contact.ts';

export function emailConfiguration() {
  const from=process.env['TEACHERFLOW_ALERT_FROM']?.trim()??'';
  const to=process.env['TEACHERFLOW_ALERT_TO']?.trim()||CONTACT_EMAIL;
  const valid=(value:string)=>!/[\r\n]/.test(value)&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value);
  const missing=[...(!process.env['RESEND_API_KEY']?.trim()?['RESEND_API_KEY']:[]),...(!valid(from)?['TEACHERFLOW_ALERT_FROM']:[]),...(!valid(to)?['TEACHERFLOW_ALERT_TO']:[])];
  return {configured:missing.length===0,from,to,missing};
}
type AlertBody={kind?:'issue'|'daily'|'repeated';issueIds:string[];subject:string;text:string;to:string;from:string};
type AlertRow={id:string;body:string;status:string;created:number;attempts:number;next:number;lease:number;error:string|null};
function describe(row:ManagedOperation) {
  let teacher: {name:string;email:string}|undefined;
  if(process.env['TEACHERFLOW_BETA_DB'])try{teacher=betaStore().managementProgress().teachers.find(t=>t.user===row.user);}catch{}

  return [`Lesson: ${row.request.topic}`,`Teacher: ${teacher?.name||row.user}${teacher?.email?' <'+teacher.email+'>':''}`,`Teacher account: ${row.user}`,`Part: ${PART_NAMES[row.part]??row.part}`,
    `When: ${new Date(row.started).toISOString()}`,`Outcome: ${row.status}`,
    `Explanation: ${row.failure?.explanation??'Recovered after retry.'}`,`Details: ${row.failure?.detail??'See the dashboard for the provider attempts.'}`,
    `Next action: ${row.failure?.nextAction??'No action required.'}`,`Submitted lesson settings: ${JSON.stringify(row.request,null,2)}`,
    row.detail?`Part details: ${row.detail}`:'',`Provider attempts: ${JSON.stringify(row.providers)}`].filter(Boolean).join('\n');
}
export function queueManagementAlerts(store:ManagementStore, now=Date.now()) {
  const settings=store.settings();if(!settings.emailEnabled)return;
  const config=emailConfiguration();
  const rows=store.list(), previous=store.db.prepare('SELECT * FROM alert_outbox ORDER BY created DESC LIMIT 5000').all() as AlertRow[];
  const covered=new Set(previous.filter(r=>r.status!=='canceled'&&!r.body.includes('TeacherFlow daily generation summary')).flatMap(r=>(JSON.parse(r.body) as AlertBody).issueIds));
  const issues=rows.filter(r=>r.issue==='open'&&r.status!=='generating'&&now-r.updated>=300000&&!covered.has(r.id));
  const groups=new Map<string,ManagedOperation[]>();
  for(const row of issues){const category=row.failure?.category??'unknown';groups.set(category,[...(groups.get(category)??[]),row]);}
  function queue(id:string,subject:string,selected:ManagedOperation[],prefix:string,kind:AlertBody['kind']='issue'){
    const body:AlertBody={kind,issueIds:selected.map(r=>r.id),subject,from:config.from,to:config.to,text:`${prefix}\n\n${selected.slice(0,25).map(describe).join('\n\n---\n\n')}\n\nOpen owner-only Management: ${SITE_ORIGIN}/beta-management#issues`};
    store.db.prepare("INSERT OR IGNORE INTO alert_outbox(id,body,status,created,next) VALUES(?,?,'queued',?,?)").run(id,JSON.stringify(body),now,now);
  }
  for(const [category,group] of groups){
    // One digest per category per half-hour, rather than one email for every retry.
    const id=managementKey(`issues:${category}:${Math.floor(now/1800000)}`);
    queue(id,`TeacherFlow: ${group.length} generation issue${group.length===1?'':'s'} need attention`,group,'These generation issues remain unresolved after the recovery window. Open Management to review teachers, settings, and saved progress.');
  }
  const repeated=new Map<string,ManagedOperation[]>();
  for(const row of rows.filter(r=>r.source==='server'&&r.status==='failed'&&r.issue==='recovered'&&now-r.started<86400000&&!covered.has(r.id))){
    const key=`${row.user}:${row.lesson}:${row.part}`;repeated.set(key,[...(repeated.get(key)??[]),row]);
  }
  for(const [key,group] of repeated)if(group.length>=3)queue(managementKey(`repeated:${key}:${Math.floor(now/86400000)}`),'TeacherFlow: repeated generation failures recovered',group,'These attempts eventually recovered, but repeated failures may need investigation.','repeated');
  if(settings.dailySummary){
    const day=Math.floor(now/86400000),cutoff=day*86400000;
    const daily=rows.filter(r=>r.started>=cutoff-86400000&&r.started<cutoff&&r.issue!=='none');
    if(daily.length)queue(managementKey(`summary:${day}`),'TeacherFlow daily generation summary',daily,`${daily.length} tracked issues yesterday; ${daily.filter(r=>r.issue==='recovered').length} recovered automatically. This summary includes recovered issues.`, 'daily');
  }
}
export async function deliverManagementAlerts(store:ManagementStore, send:typeof fetch=fetch, now=Date.now()) {
  const config=emailConfiguration();if(!config.configured||!store.settings().emailEnabled)return;
  const jobs=store.db.prepare("SELECT * FROM alert_outbox WHERE status='queued' AND next<=? AND lease<? ORDER BY created LIMIT 5").all(now,now) as AlertRow[];
  for(const job of jobs){
    const body=JSON.parse(job.body) as AlertBody;
    const daily=body.kind==='daily'||body.subject.includes('daily');
    const claimed=store.db.prepare("UPDATE alert_outbox SET lease=? WHERE id=? AND status='queued' AND lease<?").run(now+60000,job.id,now);
    if(!claimed.changes)continue;
    if(daily&&!store.settings().dailySummary){store.db.prepare("UPDATE alert_outbox SET status='canceled',lease=0 WHERE id=?").run(job.id);continue;}
    if(!daily&&body.kind!=='repeated'&&body.issueIds.every(id=>store.get(id)?.issue!=='open')){store.db.prepare("UPDATE alert_outbox SET status='canceled' WHERE id=?").run(job.id);continue;}
    if(job.attempts>0&&now-job.created>22*3600000){store.db.prepare("UPDATE alert_outbox SET status='review',error='Delivery could not be confirmed. Automatic retries stopped to avoid duplicate mail.' WHERE id=?").run(job.id);continue;}
    store.db.prepare('UPDATE alert_outbox SET attempts=attempts+1 WHERE id=?').run(job.id);
    try{
      // Freeze the first delivery payload. Retry with the same idempotency key.
      if(!job.attempts){
        if(!daily&&body.kind!=='repeated'){
          const open=body.issueIds.map(id=>store.get(id)).filter((r):r is ManagedOperation=>!!r&&r.issue==='open');
          body.subject=`TeacherFlow: ${open.length} generation issue${open.length===1?'':'s'} need attention`;
          body.text=`These issues remain unresolved.\n\n${open.slice(0,25).map(describe).join('\n\n---\n\n')}\n\nOpen owner-only Management: ${SITE_ORIGIN}/beta-management#issues`;
        }
        body.to=config.to;body.from=config.from;store.db.prepare('UPDATE alert_outbox SET body=?,created=? WHERE id=?').run(JSON.stringify(body),now,job.id);}
      const response=await send('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env['RESEND_API_KEY']}`, 'Content-Type':'application/json','Idempotency-Key':job.id},body:JSON.stringify({from:body.from,to:[body.to],subject:body.subject,text:body.text})});
      if(!response.ok)throw Error(`Email service returned HTTP ${response.status}. Check sender verification and sending credentials.`);
      const result=await response.json();if(typeof result?.id!=='string')throw Error('Email service acceptance could not be confirmed.');
      store.db.prepare("UPDATE alert_outbox SET status='accepted',lease=0,error=NULL WHERE id=?").run(job.id);
    }catch(error){store.db.prepare('UPDATE alert_outbox SET lease=0,next=?,error=? WHERE id=?').run(now+Math.min(1800000,60000*2**job.attempts),error instanceof Error&&error.message.startsWith('Email service')?error.message:'Email delivery was interrupted; waiting to retry.',job.id);}
  }
}
let worker:ReturnType<typeof setInterval>|undefined,running=false;
export function startManagementWorker() {
  if(worker||process.env['NODE_ENV']!=='production'||process.env['TEACHERFLOW_BETA']!=='true')return;
  const tick=async()=>{if(running)return;running=true;let store:ManagementStore|undefined;
    try{store=new ManagementStore();queueManagementAlerts(store);await deliverManagementAlerts(store);}catch{console.error('Management alerts could not complete a check.');}finally{store?.close();running=false;}};
  worker=setInterval(()=>void tick(),60000);worker.unref();void tick();
}
