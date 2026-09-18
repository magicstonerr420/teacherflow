import { betaUser, isOwner } from './beta-auth.server.ts';
import { betaEnabled, betaStore } from './beta-store.server.ts';

export async function betaAdministrator(request: Request) {
  if (!betaEnabled()) throw new Error('Teacher beta is not enabled.');
  const actor=await betaUser(request);
  if (!isOwner(actor)) throw new Error('Only the owner can manage teacher access.');
  // Resolve the store only after authorization. It contains private invitation codes.
  return {actor,store:betaStore()};
}
