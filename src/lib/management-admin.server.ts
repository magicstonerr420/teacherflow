import {z} from 'zod';
import {betaAdministrator} from './beta-admin.server.ts';
import {ManagementStore} from './management-store.server.ts';
export async function manageGenerationRequest(request:Request, input:unknown) {
  const data=z.object({id:z.string().uuid(),action:z.enum(['resolve','allow_retry','restore_slot'])}).parse(input);
    const {actor,store}=await betaAdministrator(request);
    const management=new ManagementStore();
    try{
      const row=management.get(data.id);if(!row)throw Error('This issue is no longer available.');
      if(data.action==='resolve'){management.resolve(actor,row.id);return {ok:true};}
      if(row.source!=='server'||row.status!=='failed'||row.issue!=='open')throw Error('Recovery requires a confirmed server failure that is still unresolved.');
      const newer=management.db.prepare("SELECT id FROM operations WHERE user=? AND lesson=? AND id<>? AND status='generating'").get(row.user,row.lesson,row.id);
      if(newer)throw Error('This lesson is generating. Wait before changing its allowance.');
      if(['uncertain_charge','budget','provider_credit','access'].includes(row.failure?.category??''))throw Error('Resolve the billing, budget, or access issue first. Extra attempts cannot bypass these protections.');
      if (!store.status(row.user).claimed) throw Error('This teacher no longer has active beta access.');
      if(data.action==='allow_retry'&&['reading','listening'].includes(row.part))management.grant(actor,row.id);
      else{
        if(data.action==='allow_retry'&&row.part==='recording'){
          const later=management.db.prepare("SELECT id FROM operations WHERE user=? AND lesson=? AND part=? AND rowid>(SELECT rowid FROM operations WHERE id=?) AND status IN ('generating','completed','recovered')").get(row.user,row.lesson,row.part,row.id);
          if(later)throw Error('This work has already resumed or recovered. Refresh the dashboard.');
        }
        store.managementRecovery(actor,{operation:`${data.action}:${row.id}`,user:row.user,lesson:row.lesson,action:data.action,part:row.part,target:row.target});
        if(data.action==='allow_retry'&&row.part==='recording')management.grant(actor,row.id);
      }
      management.audit(actor,row.user,data.action,`${row.request.topic}: ${row.part}`,`${data.action}:${row.id}`);
      return {ok:true};
    }finally{management.close();}
}
