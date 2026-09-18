import { createServerFn } from '@tanstack/react-start';
import { getRequest, setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { betaAdministrator } from './beta-admin.server';

// POST avoids prefetching/caching private invitation links; server verifies owner on every call.
export const listBetaTeachers = createServerFn({method:'POST'}).handler(async()=>{
  setResponseHeader('Cache-Control','no-store');
  const {store}=await betaAdministrator(getRequest());
  return store.administration();
});
export const manageBetaTeacher = createServerFn({method:'POST'})
  .inputValidator((data:unknown)=>z.object({
    seat:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),revision:z.string().regex(/^[a-f0-9]{64}$/),
    user:z.string().min(1).max(128).nullable(),action:z.enum(['replace','label','deactivate']),label:z.string().max(100).default(''),
  }).parse(data))
  .handler(async({data})=>{
    setResponseHeader('Cache-Control','no-store');
    const {actor,store}=await betaAdministrator(getRequest());
    store.manageSeat(actor,data);
    return store.administration();
  });
export const createBetaInvitation = createServerFn({method:'POST'})
  .inputValidator((data:unknown)=>z.object({operation:z.string().uuid()}).parse(data))
  .handler(async({data})=>{
    setResponseHeader('Cache-Control','no-store');
    const {actor,store}=await betaAdministrator(getRequest());
    store.createInvitation(actor,data.operation);
    return store.administration();
  });

export const resetBetaAllowance = createServerFn({method:'POST'})
  .inputValidator((data:unknown)=>z.object({
    seat:z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),revision:z.string().regex(/^[a-f0-9]{64}$/),
    user:z.string().min(1).max(128),allowanceRevision:z.string().regex(/^[a-f0-9]{64}$/),operation:z.string().uuid(),
  }).parse(data))
  .handler(async({data})=>{
    setResponseHeader('Cache-Control','no-store');
    const {actor,store}=await betaAdministrator(getRequest());
    store.resetTeacherAllowance(actor,data);
    return store.administration();
  });
