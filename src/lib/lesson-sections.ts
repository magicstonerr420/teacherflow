/** Lightweight section names shared by the lesson viewer and preview URLs. */
export const SECTIONS = [
  { key: 'overview', label: 'Overview' },
  { key: 'plan', label: 'Lesson Plan' },
  { key: 'presentation', label: 'Presentation' },
  { key: 'worksheet', label: 'Worksheet' },
  { key: 'reading', label: 'Reading' },
  { key: 'listening', label: 'Listening' },
  { key: 'activity', label: 'Activities' },
  { key: 'homework', label: 'Homework' },
  { key: 'exitTicket', label: 'Exit Ticket' },
  { key: 'assessment', label: 'Assessment' },
  { key: 'support', label: 'Support Version' },
  { key: 'challenge', label: 'Challenge Version' },
  { key: 'notes', label: 'Teacher Notes' },
  { key: 'quality', label: 'Quality Check' },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];

export function previewSection(value: unknown): SectionKey {
  return SECTIONS.find(section => section.key === value)?.key ?? 'overview';
}
