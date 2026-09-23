import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { generationAccess } from '@/lib/generation-access.server';
import { betaStore } from '@/lib/beta-store.server';
import { lessonRequestSchema } from '@/lib/lesson-schema';
import { ManagementStore, managementKey } from '@/lib/management-store.server';
import { PART_NAMES } from '@/lib/management';
const schema=z.object({id:z.string().uuid(),request:lessonRequestSchema,part:z.string().refine(v=>Object.hasOwn(PART_NAMES,v)),detail:z.string().max(4000).default(''),status:z.enum(['started','completed','failed']),error:z.string().max(1800).optional()});
export const Route=createFileRoute('/api/generation-events')({server:{handlers:{POST:async({request})=>{
  let store:ManagementStore|undefined;
  try{
    const access=await generationAccess(request);
    if(!access.limited)return Response.json({ok:true});
    const text=await request.text();if(text.length>30000)return Response.json({error:'Report too large.'},{status:413});
    const data=schema.parse(JSON.parse(text));
    const beta=betaStore();
    if(!beta.status(access.user).claimed)return Response.json({error:'This teacher invitation is inactive.'},{status:403});
    const own=beta.managementProgress().lessons.some(l=>l.user===access.user&&l.key===managementKey(data.request));
    if(!own)return Response.json({error:'This lesson is unavailable.'},{status:403});
    store=new ManagementStore();
    const existing=store.get(data.id);
    if(existing&&(existing.user!==access.user||existing.source!=='browser'||existing.lesson!==managementKey(data.request)||existing.part!==data.part))return Response.json({error:'Invalid report.'},{status:403});
    if(!existing){
      const recent=store.db.prepare("SELECT COUNT(*) AS n FROM operations WHERE user=? AND source='browser' AND started>?").get(access.user,Date.now()-60000) as any;
      if(recent.n>=120)return Response.json({error:'Reporting is temporarily limited.'},{status:429});
      store.begin({user:access.user,request:data.request,part:data.part,detail:data.detail,source:'browser'},data.id);
    }
    if(data.status!=='started'&&(!existing||existing.status==='generating'))store.finish(data.id,data.status==='failed'?(data.error??'The browser reported a failure without diagnostic details.'):undefined);
    return Response.json({ok:true},{headers:{'Cache-Control':'no-store'}});
  }catch{return Response.json({error:'Could not record this event.'},{status:403});}finally{store?.close();}
}}}});
