import { createServerFn } from '@tanstack/react-start';
import { getRequest, setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { requestStatuses } from './access-request';
import { ownerAccessRequests, activateRequestedAccess } from './access-request.server';
import { approvalEmailConfiguration } from './approval-email.server';

export const listAccessRequests = createServerFn({method: 'POST'})
  .inputValidator((value: unknown) => z.object({status: z.enum(requestStatuses), offset: z.number().int().min(0).max(1000)}).parse(value))
  .handler(async ({data}) => {
    setResponseHeader('Cache-Control', 'no-store');
    const {requests} = await ownerAccessRequests(getRequest());
    return {...requests.list(data.status, data.offset), email: approvalEmailConfiguration()};
  });
export const reviewAccessRequest = createServerFn({method: 'POST'})
  .inputValidator((value: unknown) => z.object({id: z.string().uuid(), revision: z.string().uuid(), decision: z.enum(['approved', 'declined'])}).parse(value))
  .handler(async ({data}) => {
    setResponseHeader('Cache-Control', 'no-store');
    const {actor, requests} = await ownerAccessRequests(getRequest());
    requests.review(actor, data.id, data.revision, data.decision);
    return {ok: true};
  });
export const checkRequestedAccess = createServerFn({method: 'POST'}).handler(async () => {
  setResponseHeader('Cache-Control', 'no-store');
  return activateRequestedAccess(getRequest());
});
