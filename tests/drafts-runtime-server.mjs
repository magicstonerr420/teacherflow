// Production server with real RPC/auth/quota/draft code; only external services are fixtures.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = resolve(process.env.DRAFTS_RUNTIME_FIXTURE);
mkdirSync(directory, { recursive: true });
Object.assign(process.env, {
  NODE_ENV: 'production', HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1',
  PORT: process.env.DRAFTS_RUNTIME_PORT || '3012', NITRO_PORT: process.env.DRAFTS_RUNTIME_PORT || '3012',
  TEACHERFLOW_BETA: 'true', TEACHERFLOW_OWNER_USER_ID: 'runtime-owner',
  TEACHERFLOW_BETA_DB: resolve(directory, 'beta.sqlite'), TEACHERFLOW_MANAGEMENT_DB: resolve(directory, 'management.sqlite'),
  TEACHERFLOW_BUDGET_DB: resolve(directory, 'budget.sqlite'), TEACHERFLOW_TEACHER_TOOLS_DB: resolve(directory, 'tools.sqlite'),
  TEACHERFLOW_READING_DB: resolve(directory, 'readings.sqlite'), TEACHERFLOW_LISTENING_DB: resolve(directory, 'listening.sqlite'),
  SUPABASE_URL: 'https://drafts-fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'fixture-only',
  RESEND_API_KEY: '', OPENROUTER_API_KEY: 'fixture-only', LOVABLE_API_KEY: '',
  TEACHERFLOW_AI_PROVIDER: 'openrouter', OPENROUTER_MODEL: 'openai/gpt-5.4-mini',
});
const lesson = JSON.parse(readFileSync('comparison/budget-lesson.json', 'utf8')).lesson;
delete lesson.reading; delete lesson.listening;
lesson.overview.topic = 'Durable classroom discussion';
lesson.overview.age = 'Adults'; lesson.overview.level = 'C2'; lesson.overview.mainSkill = 'Speaking';
lesson.lessonPlan.stages.forEach(stage => { stage.studentActions = 'Discuss the topic with a partner.'; });
lesson.worksheet.student = { title: 'Saved discussion worksheet', instructions: 'Discuss each question.', sections: [{
  label: 'A', title: 'A reasoned opinion', format: 'speaking-prompts', instructions: 'Give your own opinion.', passage: '', wordBank: [],
  items: [{ number: 1, prompt: 'What change would improve your community?', choices: [], answerLines: 3, visual: '' }],
}] };
lesson.worksheet.studentB = { title: '', instructions: '', sections: [] }; lesson.worksheet.teacherB = [];
const files = { calls: resolve(directory, 'provider.jsonl'), control: resolve(directory, 'control.json'), lessons: resolve(directory, 'lessons.json') };
const read = (file, fallback) => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; } };
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
function identity(headers) {
  const token = headers.get('authorization')?.replace(/^Bearer /, '');
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
    if (['runtime-owner', 'runtime-teacher', 'runtime-other'].includes(claims.sub)) return claims.sub;
  } catch {}
  return null;
}
function teacherAnswer() {
  return { overview: 'Use this retained guide.', groupWorkGuidance: '', sections: { section_1: {
    answers: { item_1: 'Accept any supported opinion about the community.' }, explanation: 'Support an opinion with evidence.',
    expectedResponses: [], commonErrors: [], corrections: [], teacherNotes: 'Accept other valid responses.',
  } } };
}
function providerValue(name) {
  if (name === 'teacherflow_foundation') return { overview: lesson.overview, lessonPlan: lesson.lessonPlan };
  if (name === 'teacherflow_student') return { worksheet: { title: 'Retained worksheet', student: lesson.worksheet.student } };
  if (name === 'teacherflow_teacher') return teacherAnswer();
  if (name === 'teacherflow_presentation') return { presentation: lesson.presentation };
  if (name === 'teacherflow_activity') return { activity: lesson.activity };
  if (name === 'teacherflow_assessment') return Object.fromEntries(['homework', 'exitTicket', 'assessment', 'versionB'].map(key => [key, lesson[key]]));
  if (name === 'teacherflow_differentiation') return Object.fromEntries(['supportVersion', 'challengeVersion', 'teacherNotes', 'qualityCheck'].filter(key => key in lesson).map(key => [key, lesson[key]]));
  throw Error('Unexpected fixture provider contract: ' + name);
}
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  const user = identity(headers);
  if (url.origin === 'https://drafts-fixture.supabase.co') {
    if (url.pathname === '/auth/v1/user') return user
      ? Response.json({ id: user, email: user + '@example.test', user_metadata: { full_name: user }, app_metadata: {} })
      : Response.json({ message: 'Invalid fixture token' }, { status: 401 });
    if (url.pathname === '/auth/v1/authorize') return new Response('', { status: 302, headers: { location: 'https://accounts.google.com/fixture' } });
    if (url.pathname === '/rest/v1/lessons') {
      if (!user) return Response.json({ message: 'Unauthorized' }, { status: 401 });
      let rows = read(files.lessons, []), selected;
      const method = init?.method || (input instanceof Request ? input.method : 'GET');
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      if (method === 'POST') {
        const control = read(files.control, {});
        appendFileSync(resolve(directory, 'save-attempts.jsonl'), JSON.stringify({ at: Date.now() }) + '\n');
        if (control.saveDelayMs) await new Promise(resolve => setTimeout(resolve, control.saveDelayMs));
        if (control.failSave) return Response.json({ message: 'Fixture library unavailable' }, { status: 503 });
        const body = JSON.parse(String(init.body));
        const incoming = Array.isArray(body) ? body : [body];
        if (incoming.some(row => row.user_id !== user)) return Response.json({ message: 'Fixture RLS denied' }, { status: 403 });
        if (incoming.some(row => rows.some(existing => existing.id === row.id))) return Response.json({ code: '23505', message: 'Duplicate fixture lesson' }, { status: 409 });
        selected = incoming.map(row => ({ ...row, id: row.id || crypto.randomUUID(), created_at: new Date().toISOString() }));
        rows.push(...selected); writeFileSync(files.lessons, JSON.stringify(rows));
      } else if (method === 'PATCH') {
        appendFileSync(resolve(directory, 'edit-attempts.jsonl'), JSON.stringify({ at: Date.now() }) + '\n');
        const control = read(files.control, {});
        if (control.editDelayMs) await new Promise(resolve => setTimeout(resolve, control.editDelayMs));
        const patch = JSON.parse(String(init.body));
        rows = rows.map(row => row.user_id === user && row.id === id ? { ...row, ...patch } : row);
        writeFileSync(files.lessons, JSON.stringify(rows)); selected = rows.filter(row => row.user_id === user && row.id === id);
      } else {
        const requestedUser = url.searchParams.get('user_id')?.replace(/^eq\./, '');
        const inputs = url.searchParams.get('inputs')?.replace(/^eq\./, '');
        selected = rows.filter(row => row.user_id === user && (!requestedUser || row.user_id === requestedUser) && (!id || row.id === id)
          && (!inputs || canonical(row.inputs) === canonical(JSON.parse(inputs))));
        if (url.searchParams.get('order')?.includes('updated_at')) selected.sort((a, b) => (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at));
        const limit = Number(url.searchParams.get('limit')); if (limit) selected = selected.slice(0, limit);
      }
      if (headers.get('accept')?.includes('application/vnd.pgrst.object+json')) return selected.length ? Response.json(selected[0]) : Response.json({ code: 'PGRST116', details: 'The result contains 0 rows', message: 'No rows' }, { status: 406 });
      return Response.json(selected);
    }
  }
  if (url.href === 'https://openrouter.ai/api/v1/chat/completions') {
    const body = JSON.parse(String(init.body)), name = body.response_format.json_schema.name;
    const control = read(files.control, {});
    appendFileSync(files.calls, JSON.stringify({ name, at: Date.now() }) + '\n');
    const delay = control.delay?.[name] || 20;
    await new Promise(resolve => setTimeout(resolve, delay));
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(providerValue(name)) } }], usage: { cost: 0.001, completion_tokens: 10 } });
  }
  throw Error('Unexpected external request denied by draft runtime fixture: ' + url.origin + url.pathname);
};
const { BetaStore } = await import('../src/lib/beta-store.server.ts');
const store = new BetaStore(process.env.TEACHERFLOW_BETA_DB);
if (!existsSync(resolve(directory, 'seeded'))) {
  const codes = store.issue(); store.claim('runtime-teacher', codes[0], 'teacher@example.test', 'Runtime Teacher');
  store.claim('runtime-other', codes[1], 'other@example.test', 'Other Teacher');
  writeFileSync(resolve(directory, 'seeded'), 'seeded');
}
store.db.close();
await import(pathToFileURL(resolve('.output/server/index.mjs')).href);
