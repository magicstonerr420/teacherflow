export const PART_NAMES: Record<string, string> = {
  foundation: 'Lesson overview and plan', student: 'Worksheet A', teacher: 'Answers and teacher guidance',
  studentB: 'Worksheet B', teacherB: 'Worksheet B answers', presentation: 'Presentation content',
  activity: 'Activities and homework', assessment: 'Assessment', differentiation: 'Support and challenge',
  reading: 'Reading activity', listening: 'Listening activity', recording: 'Listening recording',
  illustration: 'Presentation illustration', export: 'PowerPoint export', alternate: 'Worksheet B repair',
};
export function safeDiagnostic(value: unknown): string {
  const text = value instanceof Error ? value.message : typeof value === 'string' ? value : '';
  if (/<(?:!doctype|html|head|body|style)\b/i.test(text)) {
    const status = text.match(/<(?:title|h1)[^>]*>\s*(\d{3})/i)?.[1];
    return `A server or gateway returned ${status ?? 'an HTML error page'}. Its underlying cause was not reported.`;
  }
  return text.replace(/(?:Bearer\s+|(?:sk-or-|sb_secret_|re_))[A-Za-z0-9_.-]+/gi, '[credential removed]')
    .replace(/https?:\/\/\S+/g, '[address removed]').replace(/data:[^\s]+/g, '[data removed]').slice(0, 1800) || 'No diagnostic details were returned.';
}
export function explainFailure(value: unknown, status?: number) {
  const detail = safeDiagnostic(value);
  const categories: [boolean, string, string, string][] = [
    [/uncertain|charge.*confirm|running or its previous charge/i.test(detail), 'uncertain_charge', 'The provider charge could not be confirmed.', 'Review the provider charge before retrying. Budget reservations remain protected.'],
    [status === 429 || /rate limit/i.test(detail), 'rate_limit', 'The AI provider temporarily limited requests.', 'Wait for the cooldown. Retry only this part.'],
    [status === 402 || /credits|spending allowance|account balance/i.test(detail), 'provider_credit', 'The provider rejected the request for a billing or spending-limit reason.', 'Check the provider balance and spending allowance.'],
    [/budget|pricing|cost.*checked/i.test(detail), 'budget', 'A budget or price check stopped generation.', 'Review the Budget tab. Completed materials are preserved.'],
    [status === 401 || status === 403 || /denied access|sign in|unauthorized/i.test(detail), 'access', 'Access to the app or provider was rejected.', 'Check sign-in and provider configuration.'],
    [/retry limit|three.*slots|six illustration/i.test(detail), 'allowance', 'An allowance or retry limit stopped this part.', 'Review the attempt history before granting one extra attempt.'],
    [(status ?? 0) >= 500 || /gateway|interrupted|timeout|timed out|fetch|connection/i.test(detail), 'connection', 'A service response was interrupted or unavailable.', 'Check whether saved progress recovered. The exact underlying cause may be unknown.'],
    [/answer|evidence|validation|schema|match|incomplete|invalid|checking|usable illustration/i.test(detail), 'content', 'Generated material did not pass its content or format checks.', 'Review the diagnostic details and allow a targeted retry if needed.'],
  ];
  const match = categories.find(([matches]) => matches);
  return { category: match?.[1] ?? 'unknown', explanation: match?.[2] ?? 'Generation stopped without a confirmed cause.',
    nextAction: match?.[3] ?? 'Review the last completed step and the available diagnostics.', detail };
}
