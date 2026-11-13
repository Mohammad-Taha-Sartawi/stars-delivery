const test = require('node:test');
const assert = require('node:assert/strict');
const {
  BACKUP_QUIESCED_TOKEN,
  RESTORE_CONFIRM_TOKEN,
  LEGACY_BACKUP_QUIESCED_TOKEN,
  LEGACY_RESTORE_CONFIRM_TOKEN,
  withLegacyEnvNames,
  createBackup,
  restoreBackup,
} = require('../src/scripts/backupRestore');

test('Swifora backup variable names, with the Stars Delivery names as fallback', () => {
  assert.equal(BACKUP_QUIESCED_TOKEN, 'SWIFORA_BACKUP_WRITES_QUIESCED');
  assert.equal(RESTORE_CONFIRM_TOKEN, 'RESTORE_SWIFORA_DATA');
  assert.equal(LEGACY_BACKUP_QUIESCED_TOKEN, 'STARS_BACKUP_WRITES_QUIESCED');
  assert.equal(LEGACY_RESTORE_CONFIRM_TOKEN, 'RESTORE_STARS_DELIVERY_DATA');

  const legacyOnly = withLegacyEnvNames({ STARS_BACKUP_ROOT: '/old', STARS_RESTORE_FROM: '/old/b' });
  assert.equal(legacyOnly.SWIFORA_BACKUP_ROOT, '/old');
  assert.equal(legacyOnly.SWIFORA_RESTORE_FROM, '/old/b');

  // The new name wins when both are set.
  const both = withLegacyEnvNames({ STARS_BACKUP_ROOT: '/old', SWIFORA_BACKUP_ROOT: '/new' });
  assert.equal(both.SWIFORA_BACKUP_ROOT, '/new');
});

test('backup and restore refuse to run without an acknowledgement', async () => {
  const env = { MONGODB_URI: 'mongodb://example.invalid/swifora' };
  await assert.rejects(() => createBackup({ env }), /SWIFORA_BACKUP_QUIESCED/);
  await assert.rejects(() => restoreBackup({ env }), /SWIFORA_RESTORE_CONFIRM/);
});
