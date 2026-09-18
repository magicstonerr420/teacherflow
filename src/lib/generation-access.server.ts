import { betaEnabled } from './beta-store.server.ts';
import { betaUser, isOwner } from './beta-auth.server.ts';

/** Hosted paid generation always requires the private-beta access controls. */
export async function generationAccess(request: Request) {
  if (!betaEnabled()) {
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error('Lesson generation is temporarily paused. You can still explore TeacherFlow and open saved lessons.');
    }
    return { user: 'local', limited: false };
  }
  const user = await betaUser(request);
  // Authentication is not an invitation. Each limited operation must also go
  // through BetaStore, which checks active access, ownership, quota and retries.
  return { user, limited: !isOwner(user) };
}

/** The public builder must never advertise unrestricted production generation. */
export const generationRequiresInvitation = () => betaEnabled() || process.env['NODE_ENV'] === 'production';
