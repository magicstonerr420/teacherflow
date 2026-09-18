import { useEffect, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { BookOpen, X } from 'lucide-react';
import { Button } from './ui/button';

const DISMISSED_KEY = 'teacherflow-quick-start-dismissed-v1';

export function QuickStartTip() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try { setVisible(localStorage.getItem(DISMISSED_KEY) !== 'true'); }
    catch { setVisible(true); }
  }, []);
  if (!visible) return null;
  return <aside aria-label="Getting started" className="no-print mt-5 flex items-start gap-3 rounded-xl border border-primary/20 bg-accent/40 p-4">
    <BookOpen aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
    <div className="min-w-0 flex-1 space-y-2">
      <h2 className="font-semibold">New to TeacherFlow?</h2>
      <p className="text-sm text-muted-foreground">Learn how to build, save, and download your first lesson. The guide is always in the navigation.</p>
      <Button size="sm" variant="outline" asChild><Link to="/quick-start">Open quick-start guide</Link></Button>
    </div>
    <Button variant="ghost" size="icon" aria-label="Dismiss quick-start introduction" onClick={() => {
      setVisible(false);
      try { localStorage.setItem(DISMISSED_KEY, 'true'); } catch { /* Dismiss for this visit if storage is unavailable. */ }
    }}><X className="size-4" /></Button>
  </aside>;
}
