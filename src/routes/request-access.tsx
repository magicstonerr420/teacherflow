import { useRef, useState } from 'react';
import { Link, createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useQueryClient } from '@tanstack/react-query';
import { AppShell } from '@/components/AppShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/useAuth';
import { checkRequestedAccess } from '@/lib/access-request.functions';
import { CONTACT_EMAIL } from '@/config/contact';
import { FIRST_PREVIEW_SLUG } from '@/lib/preview-entry';

export const Route = createFileRoute('/request-access')({
  head: () => ({meta: [{title: 'Request beta access | TeacherFlow'}, {name: 'description', content: 'Tell us what you teach and request access to the TeacherFlow private teacher beta.'}]}),
  component: RequestAccess,
});
const statusMessages = {
  active: 'Your beta access is active. You can open the lesson builder.',
  pending: 'Your request is waiting for the owner to review it. Check back here later.',
  declined: 'Your request was not approved for this beta round. You can still use all the free previews.',
  inactive: 'This invitation is no longer active. Contact the organizer about your access.',
  none: 'No request was found for your signed-in email. Submit the form with that email, or sign in with the email you used for your request.',
  'missing-email': 'Your account has no verified email available. Sign in with the email used for your request.',
};

function RequestAccess() {
  const {user, isAuthenticated, loading} = useAuth();
  const check = useServerFn(checkRequestedAccess), cache = useQueryClient();
  const [busy, setBusy] = useState(false), [checking, setChecking] = useState(false);
  const [emailNotifications, setEmailNotifications] = useState(false);
  const [error, setError] = useState(''), [checkError, setCheckError] = useState(''), [submitted, setSubmitted] = useState('');
  const [result, setResult] = useState<{user: string; status: keyof typeof statusMessages} | null>(null);
  const lock = useRef(false), checkLock = useRef(false);
  const currentResult = result?.user === user?.id ? result : null;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return;
    const fields = new FormData(event.currentTarget);
    const data = {name: fields.get('name'), email: fields.get('email'), teaching: fields.get('teaching'), consent: fields.get('consent') === 'on', website: fields.get('website') || ''};
    lock.current = true; setBusy(true); setError('');
    try {
      const response = await fetch('/api/access-request', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data), signal: AbortSignal.timeout(15000)});
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true) throw Error(body?.error || 'Your request could not be saved. Please try again.');
      setSubmitted(String(data.email).trim()); setResult(null);
      setEmailNotifications(body.emailNotifications === true);
    } catch (failure) {
      setError(failure instanceof Error && failure.name !== 'TimeoutError' ? failure.message : 'We could not confirm the result. Your details are kept; retrying will not create a duplicate request.');
    } finally { lock.current = false; setBusy(false); }
  }
  async function checkStatus() {
    if (!user || checkLock.current) return;
    const id = user.id; checkLock.current = true; setChecking(true); setCheckError('');
    try {
      const response = await check({signal: AbortSignal.timeout(15000)});
      setResult({user: id, status: response.status});
      await cache.invalidateQueries({queryKey: ['beta-access-status', id], exact: true});
    } catch { setCheckError('Could not check your request. Please try again, or sign in again if your session expired.'); }
    finally { checkLock.current = false; setChecking(false); }
  }
  return <AppShell><div className="mx-auto max-w-2xl space-y-7 px-5 py-10 sm:py-14">
    <header className="space-y-4"><p className="text-sm font-semibold text-primary">Private teacher beta</p><h1 className="display-heading text-4xl">Try TeacherFlow with your class.</h1><p className="leading-relaxed text-muted-foreground">Tell us what you teach. The owner reviews each request before activating lesson generation. Approved teachers receive three lesson slots, subject to the beta's shared availability.</p><Link className="font-medium text-primary underline" to="/examples" search={{lesson: FIRST_PREVIEW_SLUG}}>Explore a complete lesson first</Link></header>
    {submitted ? <section role="status" className="space-y-4 rounded-xl border bg-card p-6"><h2 className="text-xl font-semibold">Request received</h2><p className="break-words">We received your request for <strong>{submitted}</strong>. If that email already has a request, the original has been kept.</p><p>Sign in with the same email and check your request below. {emailNotifications ? 'New approvals also receive an email; check your spam folder if needed.' : 'Email notifications are not set up yet, so check your status here.'}</p></section> : <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-6" aria-label="Beta access request">
      <div className="space-y-2"><label htmlFor="request-name" className="text-sm font-semibold">Your name</label><Input id="request-name" name="name" autoComplete="name" minLength={2} maxLength={100} required disabled={busy}/></div>
      <div className="space-y-2"><label htmlFor="request-email" className="text-sm font-semibold">Email</label><Input id="request-email" name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy} aria-describedby="email-help"/><p id="email-help" className="text-sm text-muted-foreground">Use the same email to sign in and activate access after approval.</p></div>
      <div className="space-y-2"><label htmlFor="request-teaching" className="text-sm font-semibold">What do you teach?</label><Textarea id="request-teaching" name="teaching" minLength={5} maxLength={800} required disabled={busy} rows={4} placeholder="For example: English for ages 8–12, levels A1–A2, in a group of 15." aria-describedby="teaching-help"/><p id="teaching-help" className="text-sm text-muted-foreground">Include the subject, student ages and levels. Please leave out student names or personal details.</p></div>
      <div hidden aria-hidden="true"><label>Website<Input name="website" tabIndex={-1} autoComplete="off"/></label></div>
      <label className="flex items-start gap-3 text-sm leading-relaxed"><input type="checkbox" name="consent" required disabled={busy} className="mt-1 size-4 shrink-0"/><span>I agree that TeacherFlow may use these details to review and contact me about my beta request.</span></label>
      <p className="text-xs leading-relaxed text-muted-foreground">Your request is visible only to the owner. To ask for its removal, contact <a className="break-all underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit beta request'}</Button>
    </form>}
    <section className="space-y-4 rounded-xl border bg-card p-6" aria-label="Check your beta request"><h2 className="text-xl font-semibold">Already requested access?</h2>
      {loading ? <p role="status">Checking sign-in…</p> : isAuthenticated ? <><p className="break-words text-sm">Check the request for <strong>{user?.email}</strong>. If approved, this activates your invitation.</p><Button variant="outline" disabled={checking} onClick={() => void checkStatus()}>{checking ? 'Checking…' : 'Check request status'}</Button>{currentResult && <p role="status">{statusMessages[currentResult.status]}</p>}{currentResult?.status === 'active' && <div><Button asChild><Link to="/builder">Open lesson builder</Link></Button></div>}{checkError && <p role="alert" className="text-sm text-destructive">{checkError}</p>}</> : <><p className="text-sm text-muted-foreground">Sign in with your request email to see your decision and activate an approved invitation.</p><Button asChild variant="outline"><Link to="/auth" search={{redirect: '/request-access'}}>Sign in to check your request</Link></Button></>}
    </section>
  </div></AppShell>;
}
