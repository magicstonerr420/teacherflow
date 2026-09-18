import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

/** Run on the existing Render service before changing its authentication project. */
export async function backupBeforeAuthMigration(env = process.env) {
  const beta = env.TEACHERFLOW_BETA_DB;
  if (!beta || !existsSync(beta)) throw new Error('The configured beta database is missing; check the persistent disk before switching.');
  const owner = env.TEACHERFLOW_OWNER_USER_ID?.trim();
  if (!owner || !/^[0-9a-f-]{36}$/i.test(owner)) throw new Error('The owner account ID is missing or invalid.');
  const dataDir = dirname(resolve(beta));
  const sources = {
    beta: resolve(beta),
    budget: resolve(env.TEACHERFLOW_BUDGET_DB || join(dataDir, 'budget.sqlite')),
    readings: resolve(env.TEACHERFLOW_READING_DB || join(dataDir, 'readings.sqlite')),
    listening: resolve(env.TEACHERFLOW_LISTENING_DB || join(dataDir, 'listening.sqlite')),
  };
  const root = join(dataDir, 'backups');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const folder = mkdtempSync(join(root, 'before-auth-migration-'));
  const report = { createdAt: new Date().toISOString(), ownerId: owner, databases: {}, missing: [] };
  for (const [name, source] of Object.entries(sources)) {
    if (!existsSync(source)) { report.missing.push(name); continue; }
    const destination = join(folder, name + '.sqlite');
    const db = new DatabaseSync(source, { readOnly: true });
    try { await backup(db, destination); } finally { db.close(); }
    const copy = new DatabaseSync(destination, { readOnly: true });
    try {
      if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error(`The ${name} backup failed its integrity check.`);
    } finally { copy.close(); }
    report.databases[name] = { source, file: destination, sha256: createHash('sha256').update(readFileSync(destination)).digest('hex') };
  }
  writeFileSync(join(folder, 'manifest.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  return { folder, backedUp: Object.keys(report.databases), missing: report.missing, ownerConfigured: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await backupBeforeAuthMigration();
    console.log('Backup complete. Existing databases and owner settings were preserved.');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Backup failed.');
    process.exitCode = 1;
  }
}
