import { betaBudgetStatus } from './beta-budget.server';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { betaEnabled, betaStore } from './beta-store.server';
import { betaIdentity, isOwner } from './beta-auth.server';

export const betaStatus = createServerFn({method:'GET'}).handler(async()=>{
  if(!betaEnabled()) return {enabled:false,owner:false,claimed:false,remaining:0,completed:0,lessons:[]};
  const user=await betaIdentity(getRequest());
  return {enabled:true,...betaStore().status(user.id,user.email),owner:isOwner(user.id),...(isOwner(user.id)?{claimed:true, budget:betaBudgetStatus()}:{})};
});
export const claimBeta = createServerFn({method:'POST'})
  .inputValidator((code: string)=>{if(typeof code!=='string'||code.length>100)throw new Error('Invalid invitation.');return code;})
  .handler(async({data})=>{
    if(!betaEnabled())throw new Error('Teacher beta is not enabled.');
    const user=await betaIdentity(getRequest());
    if (!isOwner(user.id)) betaStore().claim(user.id,data,user.email);
    return {ok:true};
  });
export const betaMode = createServerFn({method:'GET'}).handler(()=>betaEnabled());
