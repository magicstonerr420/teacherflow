import { CONTACT_EMAIL } from '../config/contact.ts';

export const PROBLEM_CATEGORIES = ['Signing in or beta access', 'Lesson generation', 'Worksheets or reading', 'Presentation or PDF', 'Listening or audio', 'Something else'] as const;

export type ProblemContext = {
  topic?: string;
  studentAge?: string;
  level?: string;
  section?: string;
  worksheetVersion?: string;
};

// Deliberately include only these labels, never the full lesson or account data.
export function problemContextLines(context?: ProblemContext): string[] {
  if (!context) return [];
  const fields: [string, string | undefined, number][] = [
    ['Lesson topic', context.topic, 180], ['Student age', context.studentAge, 40],
    ['English level', context.level, 20], ['Section', context.section, 60],
    ['Worksheet', context.worksheetVersion, 80],
  ];
  return fields.flatMap(([label, value, limit]) => {
    const text = value?.replace(/[\r\n\t]+/g, ' ').trim().slice(0, limit);
    return text ? [`${label}: ${text}`] : [];
  });
}

export function problemCategory(context?: ProblemContext): string {
  const section = context?.section?.toLowerCase() ?? '';
  if (/listening|audio/.test(section)) return 'Listening or audio';
  if (/worksheet|reading/.test(section)) return 'Worksheets or reading';
  if (/presentation|pdf/.test(section)) return 'Presentation or PDF';
  return context ? 'Lesson generation' : 'Something else';
}

export function problemReport(input: {category: string; description: string; steps: string; pageUrl: string; context?: ProblemContext}) {
  const category = PROBLEM_CATEGORIES.find(value => value === input.category) ?? 'Something else';
  let page = 'TeacherFlow';
  try {
    const url = new URL(input.pageUrl);
    // OAuth tokens and invitation codes can be in the query or fragment.
    if (url.protocol === 'https:' || url.protocol === 'http:') page = url.origin + url.pathname;
  } catch { /* A report can still be written without a page URL. */ }
  const subject = `TeacherFlow problem: ${category}`;
  const body = [
    `Category: ${category}`, `Page: ${page}`, ...problemContextLines(input.context), '',
    'What happened:', input.description.trim().slice(0, 1200), '',
    'Steps to reproduce:', input.steps.trim().slice(0, 600) || 'Not provided', '',
    'You can attach a screenshot before sending this email.',
  ].join('\n');
  return { subject, body, text: `To: ${CONTACT_EMAIL}\nSubject: ${subject}\n\n${body}`,
    href: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}` };
}
