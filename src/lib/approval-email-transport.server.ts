import { createHmac } from 'node:crypto';

export function approvalEmailConfiguration() {
  const provider = process.env['TEACHERFLOW_APPROVAL_EMAIL_PROVIDER']?.trim() || 'resend';
  const from = process.env['TEACHERFLOW_ALERT_FROM']?.trim() || '';
  const missing = [
    ...(!/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(from) ? ['TEACHERFLOW_ALERT_FROM'] : []),
    ...(provider === 'resend' ? (!process.env['RESEND_API_KEY']?.trim() ? ['RESEND_API_KEY'] : []) : provider === 'gmail-script' ? [
      ...(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(process.env['TEACHERFLOW_GMAIL_SCRIPT_URL']?.trim() || '') ? ['TEACHERFLOW_GMAIL_SCRIPT_URL'] : []),
      ...(!/^[a-f0-9]{64}$/.test(process.env['TEACHERFLOW_GMAIL_SCRIPT_SECRET']?.trim() || '') ? ['TEACHERFLOW_GMAIL_SCRIPT_SECRET'] : []),
    ] : ['TEACHERFLOW_APPROVAL_EMAIL_PROVIDER']),
  ];
  // Owner-visible configuration: no credentials or private relay URL.
  return {configured: !missing.length, provider, from, missing};
}

export function approvalEmailEndpoint(provider: string) {
  return provider === 'gmail-script' ? process.env['TEACHERFLOW_GMAIL_SCRIPT_URL']!.trim() : 'https://api.resend.com/emails';
}

type Delivery = {status: 'accepted'; id: string} | {status: 'retry' | 'review'; error: string; delay?: number; notAttempted?: boolean};
export async function sendApprovalEmail(provider: string, endpoint: string, key: string, payload: string, firstAttempt: number, now: number, send: typeof fetch): Promise<Delivery> {
  const gmail = provider === 'gmail-script';
  const response = await send(endpoint, gmail ? {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({key, firstAttempt, timestamp: now, payload, signature: createHmac('sha256', process.env['TEACHERFLOW_GMAIL_SCRIPT_SECRET']!.trim()).update(`${key}\n${firstAttempt}\n${now}\n${payload}`).digest('hex')}),
    signal: AbortSignal.timeout(25000),
  } : {
    method: 'POST', headers: {'Authorization': `Bearer ${process.env['RESEND_API_KEY']}`, 'Content-Type': 'application/json', 'Idempotency-Key': key},
    body: payload, signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) {
    const retry = response.status === 429 || response.status >= 500;
    return {status: retry ? 'retry' : 'review', error: `Email provider returned HTTP ${response.status}. ${retry ? 'Retry scheduled.' : 'Check the sender configuration and authorization.'}`};
  }
  const data = await response.json() as {id?: string; status?: string; code?: string};
  if (gmail && data.status !== 'accepted') {
    const retry = data.status === 'retry' && (data.code === 'quota' || data.code === 'busy');
    return {status: retry ? 'retry' : 'review', delay: data.code === 'quota' ? 3600000 : 60000, notAttempted: retry && data.code === 'quota', error: data.code === 'quota' ? 'Google daily email allowance is used; retry scheduled.' : retry ? 'Google sender is busy; retry scheduled.' : 'Google sender needs review. Check its setup and delivery records before resending.'};
  }
  if (typeof data.id !== 'string' || !data.id || data.id.length > 200) throw Error('Missing provider receipt');
  return {status: 'accepted', id: data.id};
}
