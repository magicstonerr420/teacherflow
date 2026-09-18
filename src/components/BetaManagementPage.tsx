import { Link } from '@tanstack/react-router';
import { AppShell } from './AppShell';
import { BetaTeacherControls } from './BetaTeacherControls';
import { Button } from './ui/button';
import { useBetaStatus } from '@/hooks/useBetaStatus';

export function BetaManagementPage() {
  const {isAuthenticated,checking,status,error,refresh}=useBetaStatus();
  return <AppShell>
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-10">
      <div className="space-y-2">
        <h1 className="display-heading text-3xl">Beta management</h1>
        <p className="text-muted-foreground">Manage teacher access, invitation links, and your beta budget.</p>
      </div>
      {checking ? <p role="status">Checking owner access…</p> : !isAuthenticated ? <section className="space-y-4 rounded-xl border bg-card p-5">
        <p>Sign in with your owner account to manage the private beta.</p>
        <Button asChild><Link to="/auth" search={{redirect:'/beta-management'}}>Sign in to manage beta</Link></Button>
      </section> : error ? <section className="space-y-4 rounded-xl border bg-card p-5">
        <p role="alert">Could not verify owner access. Please try again.</p>
        <Button onClick={()=>void refresh()}>Retry access check</Button>
      </section> : !status?.enabled ? <p>Private beta management is not enabled on this site.</p> : !status.owner ? <section className="space-y-4 rounded-xl border bg-card p-5">
        <p role="status">This page is only available to the beta owner.</p>
        <Button asChild variant="outline"><Link to="/builder">Go to Lesson builder</Link></Button>
      </section> : <>
        <section className="space-y-3 rounded-xl border bg-card p-5" aria-label="Sharing invitations">
          <h2 className="font-semibold">Invite a teacher with a link</h2>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Click <strong>Create invitation</strong> below to add a new invitation card.</li>
            <li>Click <strong>Copy invitation link</strong> on that card, then paste it into WhatsApp or an email to the teacher.</li>
            <li>The teacher opens the link and signs in or creates an account. The key inside the link claims their invitation automatically.</li>
          </ol>
        </section>
        {'budget' in status && status.budget && <section className="space-y-2 rounded-xl border bg-card p-5 text-sm" aria-label="Beta budget">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Teacher beta budget: ${status.budget.limitUsd.toFixed(2)} total · ${status.budget.remainingUsd.toFixed(2)} available</h2>
            <Button size="sm" variant="outline" onClick={()=>void refresh()}>Refresh budget</Button>
          </div>
          <p>${status.budget.accountedUsd.toFixed(2)} accounted for · ${status.budget.reservedUsd.toFixed(2)} reserved for requests in progress or awaiting charge confirmation.</p>
          <p>Your owner testing is separate. This budget does not reset on refresh or deployment.</p>
          {status.budget.paused && <p role="alert">Teacher generation is paused because a provider charge needs review.</p>}
        </section>}
        <div className="rounded-xl border bg-card p-5"><BetaTeacherControls /></div>
      </>}
    </div>
  </AppShell>;
}
