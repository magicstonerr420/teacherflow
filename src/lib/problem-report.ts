import { CONTACT_EMAIL } from '../config/contact.ts';

export const PROBLEM_CATEGORIES = ['Signing in or beta access', 'Lesson generation', 'Worksheets or reading', 'Presentation or PDF', 'Listening or audio', 'Something else'] as const;

export function problemReport(input: {category: string; description: string; steps: string; pageUrl: string}) {
  const category = PROBLEM_CATEGORIES.find(value => value === input.category) ?? 'Something else';
  let page = 'TeacherFlow';
  try {
    const url = new URL(input.pageUrl);
    // OAuth tokens and invitation codes can be in the query or fragment.
    if (url.protocol === 'https:' || url.protocol === 'http:') page = url.origin + url.pathname;
  } catch { /* A report can still be written without a page URL. */ }
  const subject = `TeacherFlow problem: ${category}`;
  const body = [
    `Category: ${category}`, `Page: ${page}`, '',
    'What happened:', input.description.trim().slice(0, 1200), '',
    'Steps to reproduce:', input.steps.trim().slice(0, 600) || 'Not provided', '',
    'You can attach a screenshot before sending this email.',
  ].join('\n');
  return { subject, body, text: `To: ${CONTACT_EMAIL}\nSubject: ${subject}\n\n${body}`,
    href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}
