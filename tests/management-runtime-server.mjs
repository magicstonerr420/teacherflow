// Actual compiled server and RPC handlers, isolated fixture databases and fake Supabase identity.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const directory = resolve(process.env.MANAGEMENT_RUNTIME_FIXTURE);
mkdirSync(directory, { recursive: true });
Object.assign(process.env, {
  NODE_ENV: 'test', HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1', PORT: process.env.MANAGEMENT_RUNTIME_PORT || '3010', NITRO_PORT: process.env.MANAGEMENT_RUNTIME_PORT || '3010',
  TEACHERFLOW_BETA: 'true', TEACHERFLOW_OWNER_USER_ID: 'runtime-owner',
  TEACHERFLOW_BETA_DB: resolve(directory, 'beta.sqlite'), TEACHERFLOW_MANAGEMENT_DB: resolve(directory, 'management.sqlite'),
  TEACHERFLOW_BUDGET_DB: resolve(directory, 'budget.sqlite'), SUPABASE_URL: 'https://runtime-fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-only', RESEND_API_KEY: '', OPENROUTER_API_KEY: '', LOVABLE_API_KEY: '',
});
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === 'https://runtime-fixture.supabase.co/auth/v1/user') {
    const token = new Headers(init?.headers).get('authorization');
    return token === 'Bearer runtime-owner' ? Response.json({ id: 'runtime-owner', email: 'owner@example.test', user_metadata: {} }) : Response.json({ message: 'Invalid fixture token' }, { status: 401 });
  }
  throw Error('Unexpected external network request in isolated Management runtime test.');
};
// Seed through stable source exports; compiled chunk names and export aliases can change per build.
const { BetaStore } = await import('../src/lib/beta-store.server.ts');
const { ManagementStore, managementKey } = await import('../src/lib/management-store.server.ts');
const { BetaBudget } = await import('../src/lib/beta-budget.server.ts');
const store = new BetaStore(process.env.TEACHERFLOW_BETA_DB), management = new ManagementStore(), budget = new BetaBudget();
const [code] = store.issue(); store.claim('runtime-teacher', code, 'teacher@example.test', 'Runtime Teacher');
const request = { subject: 'English', topic: 'Runtime fixture lesson', studentAge: 'Adults', level: 'A1', durationMinutes: 45, mainSkill: 'Reading', secondarySkill: null, learningObjective: 'Read simple facts about school.', groupWorkEnabled: false, studentsPerGroup: null };
store.transact(state => { state.teachers['runtime-teacher'].runs[managementKey(request)] = { request, complete: false, images: {}, parts: { foundation: { attempts: 1, value: { overview: 'Saved fixture' } } } }; });
const operation = management.begin({ user: 'runtime-teacher', request, part: 'student', detail: 'Runtime worksheet fixture' });
management.finish(operation, Error('Generated answer was invalid.'));
management.saveNote('runtime-owner', 'runtime-teacher', 'Private runtime fixture note.');
management.saveSettings('runtime-owner', { emailEnabled: false, dailySummary: false });
management.db.prepare('INSERT INTO alert_outbox(id,body,status,created,next,error) VALUES(?,?,?,?,?,?)').run('runtime-alert', JSON.stringify({ issueIds: [operation], subject: 'Runtime fixture issue', text: 'Fixture only', to: 'owner@example.test', from: 'fixture@example.test' }), 'queued', Date.now(), Date.now(), 'Fixture sending is intentionally disabled.');
const charge = budget.reserve('runtime-teacher', 'fixture-charge', 'text', 'fixture-model', 0.1); budget.settle(charge, 0.01);
management.close(); budget.close(); store.db.close();
await import(pathToFileURL(resolve('.output/server/index.mjs')).href);
