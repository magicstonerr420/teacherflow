import { SITE_ORIGIN } from '../config/contact.ts';

let cached: { key: string; until: number; result: Promise<boolean | null> } | undefined;

/** Check the fixed auth provider, without signing anyone in or exposing credentials. */
export async function checkGoogleProvider(base: string, fetcher: typeof fetch = fetch): Promise<boolean | null> {
  try {
    const url = new URL('/auth/v1/authorize', base);
    url.searchParams.set('provider', 'google');
    url.searchParams.set('redirect_to', `${SITE_ORIGIN}/auth?redirect=%2Fbuilder`);
    const response = await fetcher(url, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    // A failed availability check does not mean browser-based sign-in is disabled.
    if (response.status === 408 || response.status === 429 || response.status >= 500) return null;
    const location = response.headers.get('location');
    return response.status >= 300 && response.status < 400 && !!location
      && new URL(location).origin === 'https://accounts.google.com';
  } catch { return null; }
}

export function googleProviderAvailable(): Promise<boolean | null> {
  const base = process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'];
  if (!base) return Promise.resolve(false);
  // Share a pending request, and avoid repeatedly starting provider checks.
  if (!cached || cached.key !== base || cached.until < Date.now()) {
    cached = { key: base, until: Date.now() + 60_000, result: checkGoogleProvider(base) };
  }
  return cached.result;
}
