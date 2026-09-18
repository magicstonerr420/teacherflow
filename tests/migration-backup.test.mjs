import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupBeforeAuthMigration } from '../scripts/backup-before-auth-migration.mjs';

test('migration backup includes committed WAL data without changing live records', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'teacherflow-migration-backup-'));
  const file = join(folder, 'beta.sqlite');
  const live = new DatabaseSync(file);
  try {
    live.exec("PRAGMA journal_mode=WAL; CREATE TABLE invitations (code TEXT, remaining INTEGER); INSERT INTO invitations VALUES ('fixture',2)");
    const result = await backupBeforeAuthMigration({ TEACHERFLOW_BETA_DB: file, TEACHERFLOW_OWNER_USER_ID: '00000000-0000-4000-8000-000000000001' });
    assert.deepEqual(result.backedUp, ['beta']);
    const saved = new DatabaseSync(join(result.folder, 'beta.sqlite'), { readOnly: true });
    try { assert.equal(saved.prepare('SELECT remaining FROM invitations').get().remaining, 2); } finally { saved.close(); }
    live.exec('UPDATE invitations SET remaining=1');
    const second = await backupBeforeAuthMigration({ TEACHERFLOW_BETA_DB: file, TEACHERFLOW_OWNER_USER_ID: '00000000-0000-4000-8000-000000000001' });
    assert.notEqual(second.folder, result.folder);
    assert.equal(live.prepare('SELECT remaining FROM invitations').get().remaining, 1);
    const first = new DatabaseSync(join(result.folder, 'beta.sqlite'), { readOnly: true });
    try { assert.equal(first.prepare('SELECT remaining FROM invitations').get().remaining, 2); } finally { first.close(); }
  } finally { live.close(); }
});

test('migration backup refuses a missing beta database instead of creating one', async () => {
  await assert.rejects(backupBeforeAuthMigration({}), /database is missing/);
});
