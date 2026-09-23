import { useSyncExternalStore } from "react";
import type { Session, User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import { createAuthSessionStore, type AuthSessionSnapshot } from "@/lib/auth-session-store";

const serverSnapshot: AuthSessionSnapshot<Session> = { session: null, loading: true, error: null };
let browserStore: ReturnType<typeof createAuthSessionStore<Session>> | undefined;

function getBrowserStore() {
  return browserStore ??= createAuthSessionStore<Session>(() => supabase.auth);
}

function subscribe(listener: () => void) {
  return typeof window === "undefined" ? () => {} : getBrowserStore().subscribe(listener);
}

function getSnapshot() {
  return typeof window === "undefined" ? serverSnapshot : getBrowserStore().getSnapshot();
}

const getServerSnapshot = () => serverSnapshot;
const retry = () => { if (typeof window !== "undefined") getBrowserStore().retry(); };

export function useAuth() {
  // SSR always gets an anonymous pending snapshot; no session is shared between requests.
  const { session, loading, error } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const user: User | null = session?.user ?? null;
  return { session, user, loading, error, retry, isAuthenticated: !!user };
}
