/** Browser UI state only. Server requests must still validate their own credentials. */
export type AuthSessionSnapshot<Session> = {
  session: Session | null;
  loading: boolean;
  error: string | null;
};

type AuthSource<Session> = {
  onAuthStateChange: (callback: (event: string, session: Session | null) => void) => {
    data: { subscription: { unsubscribe: () => void } };
  };
  getSession: () => Promise<{ data: { session: Session | null }; error?: unknown }>;
};

export const AUTH_SESSION_TIMEOUT_MS = 12_000;
export const AUTH_SESSION_ERROR = 'Your session is taking longer than expected to load. Please try again.';

export function createAuthSessionStore<Session>(
  getSource: () => AuthSource<Session>,
  timeoutMs = AUTH_SESSION_TIMEOUT_MS,
) {
  let snapshot: AuthSessionSnapshot<Session> = { session: null, loading: true, error: null };
  const listeners = new Set<() => void>();
  let source: AuthSource<Session> | undefined;
  let started = false;
  let readId = 0;
  let authRevision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function publish(next: AuthSessionSnapshot<Session>) {
    snapshot = next;
    listeners.forEach(listener => listener());
  }

  function clearTimer() {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function failed() {
    // An unavailable session is not proof of sign-out. Keep the gate closed until
    // Supabase confirms a session or confirms there is no signed-in account.
    publish({ ...snapshot, error: AUTH_SESSION_ERROR });
  }

  function readSession() {
    const currentRead = ++readId;
    const revisionAtStart = authRevision;
    clearTimer();
    if (snapshot.error) publish({ ...snapshot, error: null });
    const isCurrent = () => currentRead === readId && revisionAtStart === authRevision;
    timer = setTimeout(() => {
      timer = undefined;
      if (isCurrent()) failed();
    }, timeoutMs);

    // Promise.resolve also catches a synchronous storage/client initialization error.
    void Promise.resolve().then(() => source!.getSession()).then(result => {
      if (!isCurrent()) return;
      clearTimer();
      if (result.error) {
        failed();
        return;
      }
      publish({ session: result.data.session, loading: false, error: null });
    }).catch(() => {
      if (!isCurrent()) return;
      clearTimer();
      failed();
    });
  }

  function start() {
    if (started) return;
    started = true;
    try {
      source = getSource();
      source.onAuthStateChange((_event, session) => {
        authRevision += 1;
        clearTimer();
        publish({ session, loading: false, error: null });
      });
      readSession();
    } catch {
      started = false;
      failed();
    }
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      start();
      // The single browser subscription stays alive between route mounts so
      // sign-out/token refresh cannot leave a cached session stale on navigation.
      return () => { listeners.delete(listener); };
    },
    retry() {
      if (started) readSession();
      else start();
    },
  };
}
