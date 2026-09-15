/** Map Render's public Supabase settings to the generated server client's names.
 * Explicit server settings take precedence. Never use a service-role key here.
 */
export function configureHostedAuth(env: Record<string, string | undefined> = process.env) {
  for (const key of ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']) {
    if (!env[key]?.trim() && env[`VITE_${key}`]?.trim()) {
      env[key] = env[`VITE_${key}`]!.trim();
    }
  }
}
