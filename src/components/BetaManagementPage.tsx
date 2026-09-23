import { Link } from '@tanstack/react-router';
import { AppShell } from './AppShell';
import { ManagementDashboard } from './ManagementDashboard';
import { Button } from './ui/button';
import { useBetaStatus } from '@/hooks/useBetaStatus';

export function BetaManagementPage() {
  const {isAuthenticated,checking,status,error,refresh}=useBetaStatus();
  return <AppShell>
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-10">
      <div className="space-y-2">
        <h1 className="display-heading text-3xl">Management</h1>
        <p className="text-muted-foreground">Follow teacher progress, review generation issues, and manage your private beta.</p>
      </div>
      {checking ? <p role="status">Checking owner access…</p> : !isAuthenticated ? <section className="space-y-4 rounded-xl border bg-card p-5">
        <p>Sign in with your owner account to manage the private beta.</p>
        <Button asChild><Link to="/auth" search={{redirect:'/beta-management'}}>Sign in to Management</Link></Button>
      </section> : error ? <section className="space-y-4 rounded-xl border bg-card p-5">
        <p role="alert">Could not verify owner access. Please try again.</p>
        <p className="text-sm text-muted-foreground">If the check keeps failing, your session may have expired. Sign out and sign in again with your owner account, then retry.</p>
        <Button onClick={()=>void refresh()}>Retry access check</Button>
      </section> : !status?.enabled ? <p>Private beta management is not enabled on this site.</p> : !status.owner ? <section className="space-y-4 rounded-xl border bg-card p-5">
        <p role="status">This page is only available to the beta owner.</p>
        <Button asChild variant="outline"><Link to="/builder">Go to Lesson builder</Link></Button>
      </section> : <ManagementDashboard />}
    </div>
  </AppShell>;
}
