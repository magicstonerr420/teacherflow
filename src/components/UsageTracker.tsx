import { useEffect } from 'react';
import { useLocation } from '@tanstack/react-router';
import { useBetaStatus } from '@/hooks/useBetaStatus';
import { PREVIEWS } from '@/lib/preview-catalog';

export function UsageTracker() {
  const auth = useBetaStatus();
  const pathname = useLocation({select: location => location.pathname});
  useEffect(() => {
    if (auth.checking || auth.error || auth.status?.owner || navigator.doNotTrack === '1' || pathname.startsWith('/share/')) return;
    let session: string;
    try {
      session = sessionStorage.getItem('teacherflow-usage-session') || crypto.randomUUID();
      sessionStorage.setItem('teacherflow-usage-session', session);
    } catch { return; }
    const emit = (event: string, target = '') => {
      const token = auth.session?.access_token;
      void fetch('/api/usage', {method: 'POST', keepalive: true,
        headers: {'Content-Type': 'application/json', ...(event === 'download' && token ? {Authorization: 'Bearer ' + token} : {})},
        body: JSON.stringify({session, event, target}),
      }).catch(() => {});
    };
    emit('visit');
    const preview = (event: Event) => {
      const slug = (event as CustomEvent<string>).detail;
      if (PREVIEWS.some(p => p.slug === slug)) emit('preview', slug);
    };
    // Captures both ordinary downloads and the temporary anchors used by our export tools.
    const download = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null;
      if (!anchor?.hasAttribute('download')) return;
      const url = new URL(anchor.href, location.href);
      const preview = PREVIEWS.find(p => url.pathname.startsWith('/previews/v1/' + p.slug + '.')
        || url.pathname.startsWith('/previews/v1/' + p.slug + '-'));
      if (preview) emit('preview_download', preview.slug);
      else if (auth.isAuthenticated && auth.status?.claimed) {
        const format = (anchor.download || url.pathname).split('.').pop()?.toLowerCase();
        if (format && ['pptx', 'pdf', 'zip', 'mp3'].includes(format)) emit('download', format);
      }
    };
    window.addEventListener('teacherflow-preview', preview);
    document.addEventListener('click', download, true);
    // The viewer may have mounted before account status finished loading.
    const slug = document.querySelector<HTMLElement>('[data-preview-slug]')?.dataset['previewSlug'];
    if (slug) emit('preview', slug);
    return () => { window.removeEventListener('teacherflow-preview', preview); document.removeEventListener('click', download, true); };
  }, [auth.checking, auth.error, auth.status?.owner, auth.status?.claimed, auth.isAuthenticated, auth.session?.access_token, pathname]);
  return null;
}
