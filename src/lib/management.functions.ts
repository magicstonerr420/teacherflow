import {manageGenerationRequest} from './management-admin.server';
import {createServerFn} from '@tanstack/react-start';
import {getRequest,setResponseHeader} from '@tanstack/react-start/server';
import {z} from 'zod';
import {betaAdministrator} from './beta-admin.server';
import {BetaBudget} from './beta-budget.server';
import {ManagementStore} from './management-store.server';
import {emailConfiguration} from './management-alerts.server';

export const loadManagement=createServerFn({method:'POST'}).handler(async()=>{
  const {store}=await betaAdministrator(getRequest());setResponseHeader('Cache-Control','no-store');
  const management=new ManagementStore(),budget=new BetaBudget();
  try{return {operations:management.list(),...store.managementProgress(),notes:management.notes(),audit:management.history(),budget:budget.status(),spending:budget.breakdown(),
    settings:management.settings(),email:emailConfiguration(),alerts:management.db.prepare('SELECT id,status,created,attempts,error FROM alert_outbox ORDER BY created DESC LIMIT 50').all() as {id:string;status:string;created:number;attempts:number;error:string|null}[]};
  }finally{management.close();budget.close();}
});
export const manageGeneration=createServerFn({method:'POST'})
  .inputValidator((v:unknown)=>z.object({id:z.string().uuid(),action:z.enum(['resolve','allow_retry','restore_slot'])}).parse(v))
  .handler(async({data})=>{
    setResponseHeader('Cache-Control','no-store');
    return manageGenerationRequest(getRequest(),data);
  });
export const saveSupportNote=createServerFn({method:'POST'})
 .inputValidator((v:unknown)=>z.object({user:z.string().min(1).max(128),note:z.string().max(3000)}).parse(v))
 .handler(async({data})=>{const {actor,store}=await betaAdministrator(getRequest());if(!store.managementProgress().teachers.some(t=>t.user===data.user))throw Error('Teacher not found.');const management=new ManagementStore();try{management.saveNote(actor,data.user,data.note);return {ok:true};}finally{management.close();}});
export const saveManagementNotifications=createServerFn({method:'POST'})
 .inputValidator((v:unknown)=>z.object({emailEnabled:z.boolean(),dailySummary:z.boolean()}).parse(v))
 .handler(async({data})=>{const {actor}=await betaAdministrator(getRequest());const management=new ManagementStore();try{management.saveSettings(actor,data);return {ok:true};}finally{management.close();}});
