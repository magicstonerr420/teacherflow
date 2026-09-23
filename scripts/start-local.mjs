import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
process.chdir(root);
const args = process.argv.slice(2);
let port = 3000;
let open = true;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--no-open') open = false;
  else if (args[i] === '--port' && /^\d+$/.test(args[i + 1] ?? '')) port = Number(args[++i]);
  else {
    console.error('Usage: "Start TeacherFlow.cmd" [--port 3001] [--no-open]');
    process.exit(1);
  }
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('TeacherFlow: the port must be between 1 and 65535.');
  process.exit(1);
}
let url = `http://127.0.0.1:${port}`;

async function isListening() {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(2000);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); reject(new Error(`Could not check ${url}.`)); });
    socket.once('error', (error) => {
      if (error.code === 'ECONNREFUSED') resolve(false);
      else reject(error);
    });
  });
}

async function checkPage() {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'manual' });
    const html = await response.text();
    return {
      healthy: response.ok && /<title>[^<]*TeacherFlow/i.test(html),
      status: `HTTP ${response.status}`,
    };
  } catch {
    return { healthy: false, status: 'no successful response' };
  }
}

async function openBrowser() {
  if (!open) return;
  try {
    // The URL contains only the fixed loopback address and a validated numeric port.
    await promisify(execFile)('powershell.exe', ['-NoLogo', '-NoProfile', '-Command', `Start-Process -FilePath '${url}'`], { windowsHide: true });
  } catch {
    console.log(`Open ${url} in your browser.`);
  }
}

async function isThisProject() {
  try {
    const response = await fetch(`${url}/src/routes/index.tsx`, { signal: AbortSignal.timeout(5000), redirect: 'manual' });
    const source = await response.text();
    const routePath = path.join(root, 'src/routes/index.tsx').replaceAll('\\', '/');
    return response.ok && source.includes(routePath);
  } catch {
    return false;
  }
}

async function reuseExisting() {
  console.log(`TeacherFlow is already running at ${url}.${open ? ' Opening the existing instance.' : ''}`);
  await openBrowser();
  process.exit(0);
}

try {
  if (!existsSync(path.join(root, 'node_modules/vite/package.json'))) {
    throw new Error('Project dependencies are missing. Run npm install in this project folder, then start TeacherFlow again.');
  }
  if (await isListening()) {
    const page = await checkPage();
    if (page.healthy) {
      await reuseExisting();
    }
    if (!await isThisProject()) {
      throw new Error(`Port ${port} is already in use (${page.status}). Close the previous server window and try again. If another app needs this port, run "Start TeacherFlow.cmd" --port ${port === 3000 ? 3001 : 3000}.`);
    }
    const oldPort = port;
    let available = false;
    for (let attempt = 0; attempt < 20 && port < 65535; attempt++) {
      port++;
      url = `http://127.0.0.1:${port}`;
      if (!await isListening()) {
        available = true;
        break;
      }
      if ((await checkPage()).healthy && await isThisProject()) {
        console.log(`An older TeacherFlow server on port ${oldPort} isn't responding correctly. Close the older launcher window when convenient.`);
        await reuseExisting();
      }
    }
    if (!available) throw new Error('No free nearby port was found. Close older local server windows and try again.');
    console.log(`An older TeacherFlow server on port ${oldPort} isn't responding correctly; starting at ${url}. Close the older launcher window when convenient.`);
  }

  const { createServer, loadEnv } = await import('vite');
  // Load private server configuration too, preserving variables explicitly set in the shell.
  for (const [key, value] of Object.entries(loadEnv('development', root, ''))) {
    process.env[key] ??= value;
  }
  console.log('Preparing TeacherFlow export tools...');
  await import('./prepare-export-tools.mjs');
  const server = await createServer({ server: { host: '127.0.0.1', port, strictPort: true, open: false } });
  await server.listen();
  console.log(`TeacherFlow: ${url}`);
  console.log('Keep this window open. Press Ctrl+C to stop the local server.');
  const page = await checkPage();
  if (page.healthy) {
    await openBrowser();
  } else {
    console.error(`TeacherFlow's server started, but the page returned ${page.status}. See the error above, then reload ${url} after it is fixed.`);
  }
  const stop = async () => { await server.close(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
} catch (error) {
  console.error(`TeacherFlow could not start: ${error.message}`);
  process.exitCode = 1;
}
