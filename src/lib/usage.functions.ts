import { createServerFn } from '@tanstack/react-start';
import { getRequest, setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { ownerAccessRequests } from './access-request.server';
import { usageStore } from './usage-store.server';
export const loadUsage = createServerFn({method: 'POST'})
  .inputValidator((value: unknown) => z.object({days: z.union([z.literal(7), z.literal(30)])}).parse(value))
  .handler(async ({data}) => {
    setResponseHeader('Cache-Control', 'no-store');
    const {requests} = await ownerAccessRequests(getRequest());
    const report = usageStore().report(data.days);
    const since = (Math.floor(Date.now() / 86400000) - data.days + 1) * 86400000;
    const applications = requests.beta.db.prepare("SELECT COUNT(CASE WHEN created>=? THEN 1 END) AS requested,COUNT(CASE WHEN status='approved' AND reviewed>=? THEN 1 END) AS approved FROM access_requests").get(since, since) as {requested: number; approved: number};
    return {...report, applications};
  });
