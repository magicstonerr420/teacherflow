import { createServerFn } from '@tanstack/react-start';
import { googleProviderAvailable } from './google-auth.server';

export const googleSignInStatus = createServerFn({ method: 'GET' }).handler(async () => ({ available: await googleProviderAvailable() }));
