export function safeAuthPath(value?: string) {
  const base = 'https://teacherflow.invalid';
  if (!value?.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020\u007f]/.test(value)) return '/builder';
  try {
    const url = new URL(value, base);
    return url.origin === base ? url.pathname + url.search : '/builder';
  } catch { return '/builder'; }
}

export function googleReturnUrl(origin: string, redirect?: string) {
  return `${origin}/auth?redirect=${encodeURIComponent(safeAuthPath(redirect))}`;
}
