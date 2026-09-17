import type { jsPDF } from 'jspdf';

let pending: Promise<{ jsPDF: typeof jsPDF }> | undefined;
let failedLoads = 0;

/** Keep PDF exports available when an open lesson outlives a deployment. */
export function loadPdfTools(): Promise<{ jsPDF: typeof jsPDF }> {
  if (!pending) {
    const retry = failedLoads ? `?retry=${failedLoads}` : '';
    const url = new URL(`/export-tools/jspdf-4.2.1.mjs${retry}`, window.location.origin).href;
    pending = import(/* @vite-ignore */ url).then(module => {
      if (typeof module.jsPDF !== 'function') throw new Error('Invalid PDF module');
      return { jsPDF: module.jsPDF };
    }).catch(() => {
      pending = undefined;
      failedLoads++;
      throw new Error('The PDF export tools could not load. Keep your lesson open, check your connection, and try Print / Save as PDF again.');
    });
  }
  return pending;
}
