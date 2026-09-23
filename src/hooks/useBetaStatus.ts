import { useQuery } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { useAuth } from './useAuth';
import { betaStatus } from '@/lib/beta.functions';
import { ACCOUNT_READ_STALE_MS, readRequest } from '@/lib/read-request';

/** Account-scoped display state. Management endpoints still verify the owner on every call. */
export function useBetaStatus() {
  const auth=useAuth();
  const status=useServerFn(betaStatus);
  const query=useQuery({
    queryKey:['beta-access-status',auth.user?.id],
    queryFn:({signal})=>readRequest(requestSignal=>status({signal:requestSignal}),{signal}),
    enabled:!auth.loading&&auth.isAuthenticated,
    staleTime:ACCOUNT_READ_STALE_MS,
    retry:false,
  });
  return {...auth,status:auth.isAuthenticated?query.data:undefined,
    checking:auth.loading||(auth.isAuthenticated&&query.isPending),
    error:auth.isAuthenticated?query.error:null,refresh:query.refetch};
}
