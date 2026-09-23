import {mkdirSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const directory = resolve(process.env.ACCESS_REQUEST_FIXTURE);
mkdirSync(directory, {recursive: true});
Object.assign(process.env, {
  NODE_ENV: 'test', HOST: '127.0.0.1', NITRO_HOST: '127.0.0.1', PORT: '4213', NITRO_PORT: '4213',
  TEACHERFLOW_BETA: 'true', TEACHERFLOW_OWNER_USER_ID: 'access-owner',
  TEACHERFLOW_BETA_DB: resolve(directory, 'beta.sqlite'), TEACHERFLOW_MANAGEMENT_DB: resolve(directory, 'management.sqlite'),
  TEACHERFLOW_BUDGET_DB: resolve(directory, 'budget.sqlite'), SUPABASE_URL: 'https://access-fixture.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fixture-only', RESEND_API_KEY: '', OPENROUTER_API_KEY: '', LOVABLE_API_KEY: '',
});
globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url === 'https://access-fixture.supabase.co/auth/v1/user') {
    const rawToken = new Headers(init?.headers).get('authorization')?.replace('Bearer ', '');
    const token = rawToken?.includes('.') ? JSON.parse(Buffer.from(rawToken.split('.')[1],'base64url').toString()).sub : rawToken;
    const users = {'access-owner': 'owner@example.test', 'access-teacher': 'teacher@example.test', 'access-outsider': 'outsider@example.test'};
    if (users[token]) return Response.json({id: token, email: users[token], user_metadata: {full_name: token}});
    return Response.json({message: 'Invalid fixture token'}, {status: 401});
  }
  if (url.startsWith('https://access-fixture.supabase.co/rest/v1/lessons')) {
    const headers = new Headers(init?.headers), token=headers.get('authorization')?.replace('Bearer ','');
    const user=token?.includes('.') ? JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString()).sub : token;
    if (user !== 'access-teacher') return Response.json([]);
    const {lesson,request}=JSON.parse(readFileSync('public/previews/v1/weather-and-clothes.json','utf8'));
    const row={id:'11111111-1111-4111-8111-111111111111',user_id:user,topic:request.topic,level:request.level,content:lesson,inputs:request,created_at:new Date().toISOString()};
    return Response.json(headers.get('accept')?.includes('object') ? row : [row]);
  }
  throw Error('Unexpected external service request in isolated access-request fixture.');
};
await import(pathToFileURL(resolve('.output/server/index.mjs')).href);
