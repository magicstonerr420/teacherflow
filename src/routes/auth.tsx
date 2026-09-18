import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";

import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { safeAuthPath as safePath, googleReturnUrl } from "@/lib/auth-redirect";
import { googleSignInStatus } from "@/lib/google-auth.functions";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>): {redirect?: string; password?: boolean} => ({
    ...(typeof search['redirect'] === 'string' ? {redirect:search['redirect']} : {}),
    password: search['password'] === true || search['password'] === 'true',
  }),
  head: () => ({
    meta: [
      { title: "Sign in — TeacherFlow" },
      { name: "description", content: "Sign in to save your lessons and open your lesson history." },
      { property: "og:title", content: "Sign in — TeacherFlow" },
      { property: "og:description", content: "Save and revisit your lesson packages." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect, password: passwordPage } = Route.useSearch();
  const navigate = useNavigate();
  const { isAuthenticated, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [recovery,setRecovery]=useState(!!passwordPage);
  const [confirmPassword,setConfirmPassword]=useState('');
  const googleStatus = useServerFn(googleSignInStatus);
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    googleStatus().then(result => { if (active) setGoogleAvailable(result.available); })
      .catch(() => { if (active) setGoogleAvailable(false); });
    return () => { active = false; };
  }, [googleStatus]);

  useEffect(()=>{
    const callbackError=new URLSearchParams(window.location.hash.slice(1)).get('error') || new URLSearchParams(window.location.search).get('error');
    if(callbackError){setNotice(callbackError==='access_denied'?'Google sign-in was cancelled or denied. Try again or use an email sign-in link.':'Google sign-in could not finish. Use an email sign-in link or contact the app owner.');history.replaceState(null,'',window.location.pathname+window.location.search);}
    const {data}=supabase.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')setRecovery(true);});
    return ()=>data.subscription.unsubscribe();
  },[]);

  useEffect(() => {
    if (!loading && isAuthenticated && !recovery && !passwordPage) navigate({ to: safePath(redirect) });
  }, [loading, isAuthenticated, navigate, redirect,recovery,passwordPage]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice("");
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
            emailRedirectTo: `${window.location.origin}${safePath(redirect)}`,
          },
        });
        if (error) throw error;
        if(data.session) toast.success("You're signed in.");
        else setNotice("Check your email to confirm your account. After confirmation, return here and sign in. Your invitation is saved in this browser.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      const message=error instanceof Error ? error.message : 'We could not sign you in.';
      setNotice(/invalid login credentials/i.test(message) ? 'The email or password was not accepted. If you previously used an email sign-in link, you may not have set a password yet. Use “Set or reset my password” below, or sign in with an email link.' : message);
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (!googleAvailable || busy) return;
    setBusy(true);setNotice('');
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: googleReturnUrl(window.location.origin, redirect), queryParams: { prompt: 'select_account' } },
      });
      if(error)throw error;
    }catch{setNotice('Google sign-in could not start. Try an email sign-in link instead.');}
    finally{setBusy(false);}
  }

  async function resetPassword() {
    if(!email.trim()){setNotice('Enter your email address first, then click Set or reset my password.');return;}
    setBusy(true);setNotice('Requesting your password-reset email…');
    try {
      const {error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:`${window.location.origin}/auth?password=true&redirect=%2Fbuilder`});
      if(error)throw error;
      setNotice('Check your email for the password reset link. Open it in this browser to choose your TeacherFlow password.');
    }catch(error){setNotice(error instanceof Error?error.message:'Could not send the password reset email.');}
    finally{setBusy(false);}
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if(password.length<8){setNotice('Use at least 8 characters for your new password.');return;}
    if(!confirmPassword){setNotice('Enter your new password again in Confirm new password.');return;}
    if(password!==confirmPassword){setNotice('The passwords do not match.');return;}
    setBusy(true);setNotice('Saving your password…');
    try {
      let timer:ReturnType<typeof setTimeout>|undefined;
      const result=await Promise.race([
        supabase.auth.updateUser({password}),
        new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('We could not confirm that your password was saved. Try signing in with the new password before requesting another reset.')),25000);}),
      ]).finally(()=>clearTimeout(timer));
      if(result.error)throw result.error;
      setPassword('');setConfirmPassword('');setNotice('Password saved. Opening your workspace…');
      window.location.assign('/builder');
    }catch(error){setNotice(error instanceof Error?error.message:'Could not save the password.');}
    finally{setBusy(false);}
  }

  async function emailLink() {
    if(!email.trim()){setNotice('Enter your email address first.');return;}
    setBusy(true);setNotice('Requesting your sign-in email…');
    try {
      const {error}=await supabase.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:`${window.location.origin}${safePath(redirect)}`}});
      if(error)throw error;
      setNotice('Check your email for a sign-in link. Open it in this browser. If the email contains a sign-in code, enter it below. Your invitation is saved.');
    }catch(error){setNotice(error instanceof Error?error.message:'Could not send the sign-in email.');}
    finally{setBusy(false);}
  }

  async function verifyCode() {
    setBusy(true);
    try {const {error}=await supabase.auth.verifyOtp({email:email.trim(),token:emailCode.trim(),type:'email'});if(error)throw error;}
    catch(error){setNotice(error instanceof Error?error.message:'Could not verify the code.');}
    finally{setBusy(false);}
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-md px-5 py-20">
        <h1 className="display-heading text-3xl">
          {recovery && isAuthenticated ? 'Set your TeacherFlow password' : mode === "signin" ? "Welcome back" : "Create your account"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in to explore TeacherFlow and access your saved lessons. Generating lessons, illustrations, or audio requires an active beta invitation from the owner.
        </p>

        {notice && !(recovery && isAuthenticated)?<p role="status" className="mt-5 rounded-lg border p-4 text-sm">{notice}</p>:null}

        {recovery && isAuthenticated ? <form onSubmit={savePassword} noValidate className="mt-8 space-y-4 rounded-xl border bg-card p-6">
          <Label htmlFor="new-password">New password</Label><Input id="new-password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} />
          <Label htmlFor="confirm-password">Confirm new password</Label><Input id="confirm-password" type="password" autoComplete="new-password" required minLength={8} value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} />
          <p role="status" aria-live="polite" className="text-sm">{notice}</p><p className="text-sm text-muted-foreground">Use at least 8 characters and enter the same password in both boxes.</p><Button type="submit" disabled={busy}>{busy?'Saving…':'Save password'}</Button>
        </form> : <form onSubmit={submit} className="mt-8 space-y-4 rounded-xl border bg-card p-6">
          {mode === "signup" ? (
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
          <Button type="button" variant="outline" className="w-full" onClick={emailLink} disabled={busy}>Email me a sign-in link</Button>
          <Button type="button" variant="ghost" className="w-full" onClick={resetPassword} disabled={busy}>Set or reset my password</Button>
          <p className="text-xs text-muted-foreground">An email sign-in link works without a password. Your TeacherFlow password is separate from your email account password.</p>
          <Button type="button" variant="outline" className="w-full" onClick={google} disabled={busy || !googleAvailable}>
            {googleAvailable === null ? 'Checking Google sign-in…' : 'Continue with Google'}
          </Button>
          {googleAvailable === false && <p className="text-xs text-muted-foreground">Google sign-in is being set up. You can use email or try again later.</p>}
        </form>}
        {notice.includes('sign-in code')?<div className="mt-4 space-y-2"><Label htmlFor="email-code">Email sign-in code (if provided)</Label><Input id="email-code" autoComplete="one-time-code" value={emailCode} onChange={e=>setEmailCode(e.target.value)} /><Button onClick={verifyCode} disabled={busy||!emailCode.trim()}>Verify code</Button></div>:null}

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New to TeacherFlow?" : "Already have an account?"}{" "}
          <button
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </AppShell>
  );
}
