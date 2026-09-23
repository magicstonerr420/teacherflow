import { Component, lazy, Suspense, type ComponentProps, type ReactNode } from 'react';
import type { LessonPackageView } from './LessonPackageView';
import { Button } from '@/components/ui/button';

const loadViewer = () => import('./LessonPackageView').then(module => ({ default: module.LessonPackageView }));
const Viewer = lazy(loadViewer);

class ViewerBoundary extends Component<{ children: ReactNode; recoveryHref?: string | undefined }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    if (this.state.failed) return <div role="alert" className="mx-auto max-w-4xl space-y-3 px-5 py-12">
      <p>We couldn't open the lesson viewer.</p>
      <p className="text-sm text-muted-foreground">{this.props.recoveryHref ? 'Reopen your saved lesson or draft to try again. Any edits not yet saved will be lost.' : 'Reload the page to try again. Any unsaved work will be lost.'}</p>
      {/* A failed dynamic import is cached by the browser. A new document is
          required to download it again; retrying React.lazy alone cannot recover. */}
      <Button asChild><a href={this.props.recoveryHref ?? ''}>{this.props.recoveryHref ? 'Reopen saved progress' : 'Reload page'}</a></Button>
    </div>;
    return this.props.children;
  }
}

/** Download the editor, media panels, and export UI only once a lesson is ready. */
export function LessonPackageLoader({ recoveryHref, ...props }: ComponentProps<typeof LessonPackageView> & { recoveryHref?: string | undefined }) {
  return <ViewerBoundary recoveryHref={recoveryHref}>
    <Suspense fallback={<p role="status" className="mx-auto max-w-4xl px-5 py-12">Opening your lesson…</p>}>
      <Viewer {...props} />
    </Suspense>
  </ViewerBoundary>;
}
