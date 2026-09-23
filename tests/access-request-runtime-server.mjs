import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const directory = resolve(process.env.ACCESS_REQUEST_FIXTURE);
mkdirSync(directory, {recursive: true});
Object.assign(process.env, {
  NODE_ENV: 'test', HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1', PORT: '4213', NITRO_PORT: '4213',
  TEACHERFLOW_BETA: 'true', TEACHERFLOW_OWNER_USER_ID: 'access-owner',
  TEACHERFLOW_BETA_DB: resolve(directory, 'beta.sqlite'), TEACHERFLOW_MANAGEMENT_DB: resolve(directory, 'management.sqlite'),
  TEACHERFLOW_BUDGET_DB: resolve(directory, 'budget.sqlite'), SUPABASE_URL: 'https://access-fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-only', TEACHERFLOW_APPROVAL_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: '', OPENROUTER_API_KEY: '', LOVABLE_API_KEY: '',
});
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === 'https://access-fixture.supabase.co/auth/v1/user') {
    const token = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '');
    const users = {'access-owner': 'owner@example.test', 'access-teacher': 'teacher@example.test', 'access-outsider': 'outsider@example.test'};
    if (users[token]) return Response.json({id: token, email: users[token], user_metadata: {full_name: token}});
    return Response.json({message: 'Invalid fixture token'}, {status: 401});
  }
  throw Error('Unexpected external service request in isolated access-request fixture.');
};
await import(pathToFileURL(resolve('.output/server/index.mjs')).href);
