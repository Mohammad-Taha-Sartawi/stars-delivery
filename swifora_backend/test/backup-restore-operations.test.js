const {
  afterEach,
  test,
} = require('node:test');

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const os =
  require('node:os');

const path =
  require('node:path');

const {
  BACKUP_QUIESCED_TOKEN,
  RESTORE_CONFIRM_TOKEN,
  createBackup,
  restoreBackup,
  verifyBackup,
} = require(
  '../src/scripts/backupRestore',
);

const fsPromises =
  fs.promises;

const roots = [];

async function tempRoot() {
  const root =
    await fsPromises.mkdtemp(
      path.join(
        os.tmpdir(),
        'stars-backup-test-',
      ),
    );

  roots.push(root);

  return root;
}

async function write(
  file,
  content,
) {
  await fsPromises.mkdir(
    path.dirname(file),
    {
      recursive: true,
    },
  );

  await fsPromises.writeFile(
    file,
    content,
  );
}

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await fsPromises.rm(
      root,
      {
        recursive: true,
        force: true,
      },
    );
  }
});

test(
  'backup requires explicit quiesced-write acknowledgement',
  async () => {
    const root =
      await tempRoot();

    await assert.rejects(
      () =>
        createBackup({
          env: {
            MONGODB_URI:
              'mongodb://example.invalid/stars',
            STARS_BACKUP_ROOT:
              path.join(root, 'backups'),
          },
          providerRoot:
            path.join(root, 'provider'),
          uploadsRoot:
            path.join(root, 'uploads'),
          runner:
            () => {},
        }),
      /STARS_BACKUP_QUIESCED/,
    );
  },
);

test(
  'backup creates Mongo archive filesystem copies and integrity manifest without storing the Mongo URI',
  async () => {
    const root =
      await tempRoot();

    const backupRoot =
      path.join(root, 'backups');

    const provider =
      path.join(root, 'provider');

    const uploads =
      path.join(root, 'uploads');

    await write(
      path.join(
        provider,
        'provider.jpg',
      ),
      Buffer.from(
        'private-provider-file',
      ),
    );

    await write(
      path.join(
        uploads,
        'order.jpg',
      ),
      Buffer.from(
        'public-order-file',
      ),
    );

    const uri =
      'mongodb://secret-user:secret-pass@example.invalid/stars';

    let call;

    const runner =
      (executable, args) => {
        call = {
          executable,
          args,
        };

        const archiveArg =
          args.find(
            (arg) =>
              arg.startsWith(
                '--archive=',
              ),
          );

        fs.writeFileSync(
          archiveArg.slice(
            '--archive='.length,
          ),
          'fake-mongo-bson',
        );
      };

    const backupDir =
      await createBackup({
        env: {
          MONGODB_URI:
            uri,
          STARS_BACKUP_ROOT:
            backupRoot,
          STARS_BACKUP_QUIESCED:
            BACKUP_QUIESCED_TOKEN,
        },
        now:
          new Date(
            '2026-08-31T10:00:00.000Z',
          ),
        providerRoot:
          provider,
        uploadsRoot:
          uploads,
        runner,
      });

    assert.equal(
      call.executable,
      'mongodump',
    );

    assert.ok(
      call.args.includes(
        `--uri=${uri}`,
      ),
    );

    assert.ok(
      call.args.includes(
        '--gzip',
      ),
    );

    const manifestText =
      await fsPromises.readFile(
        path.join(
          backupDir,
          'manifest.json',
        ),
        'utf8',
      );

    assert.equal(
      manifestText.includes(uri),
      false,
    );

    assert.equal(
      manifestText.includes(
        'secret-pass',
      ),
      false,
    );

    assert.equal(
      (
        await fsPromises.readFile(
          path.join(
            backupDir,
            'provider-documents',
            'provider.jpg',
          ),
          'utf8',
        )
      ),
      'private-provider-file',
    );

    assert.equal(
      (
        await fsPromises.readFile(
          path.join(
            backupDir,
            'uploads',
            'order.jpg',
          ),
          'utf8',
        )
      ),
      'public-order-file',
    );

    await verifyBackup(
      backupDir,
    );
  },
);

test(
  'failed mongodump removes the incomplete backup directory',
  async () => {
    const root =
      await tempRoot();

    const backupRoot =
      path.join(root, 'backups');

    await assert.rejects(
      () =>
        createBackup({
          env: {
            MONGODB_URI:
              'mongodb://example.invalid/stars',
            STARS_BACKUP_ROOT:
              backupRoot,
            STARS_BACKUP_QUIESCED:
              BACKUP_QUIESCED_TOKEN,
          },
          providerRoot:
            path.join(root, 'provider'),
          uploadsRoot:
            path.join(root, 'uploads'),
          runner:
            () => {
              throw new Error(
                'mongodump failed',
              );
            },
        }),
      /mongodump failed/,
    );

    const contents =
      await fsPromises.readdir(
        backupRoot,
      );

    assert.deepEqual(
      contents,
      [],
    );
  },
);

test(
  'restore requires an explicit destructive confirmation token',
  async () => {
    const root =
      await tempRoot();

    await assert.rejects(
      () =>
        restoreBackup({
          env: {
            MONGODB_URI:
              'mongodb://example.invalid/stars',
            STARS_RESTORE_FROM:
              path.join(root, 'backup'),
          },
          providerRoot:
            path.join(root, 'provider'),
          uploadsRoot:
            path.join(root, 'uploads'),
          runner:
            () => {},
        }),
      /STARS_RESTORE_CONFIRM/,
    );
  },
);

test(
  'restore rejects tampered filesystem content before mongorestore runs',
  async () => {
    const root =
      await tempRoot();

    const provider =
      path.join(root, 'provider-source');

    const backupRoot =
      path.join(root, 'backups');

    await write(
      path.join(
        provider,
        'identity.jpg',
      ),
      'original',
    );

    const backupDir =
      await createBackup({
        env: {
          MONGODB_URI:
            'mongodb://example.invalid/stars',
          STARS_BACKUP_ROOT:
            backupRoot,
          STARS_BACKUP_QUIESCED:
            BACKUP_QUIESCED_TOKEN,
        },
        providerRoot:
          provider,
        uploadsRoot:
          path.join(
            root,
            'uploads-source',
          ),
        runner:
          (executable, args) => {
            const archive =
              args.find(
                (arg) =>
                  arg.startsWith(
                    '--archive=',
                  ),
              );

            fs.writeFileSync(
              archive.slice(
                '--archive='.length,
              ),
              'mongo',
            );
          },
      });

    await fsPromises.writeFile(
      path.join(
        backupDir,
        'provider-documents',
        'identity.jpg',
      ),
      'tampered',
    );

    let restoreCalled =
      false;

    await assert.rejects(
      () =>
        restoreBackup({
          env: {
            MONGODB_URI:
              'mongodb://example.invalid/stars',
            STARS_RESTORE_FROM:
              backupDir,
            STARS_RESTORE_CONFIRM:
              RESTORE_CONFIRM_TOKEN,
          },
          providerRoot:
            path.join(
              root,
              'provider-restored',
            ),
          uploadsRoot:
            path.join(
              root,
              'uploads-restored',
            ),
          runner:
            () => {
              restoreCalled =
                true;
            },
        }),
      /integrity verification failed/,
    );

    assert.equal(
      restoreCalled,
      false,
    );
  },
);

test(
  'restore invokes mongorestore with drop and restores provider documents and uploads',
  async () => {
    const root =
      await tempRoot();

    const providerSource =
      path.join(root, 'provider-source');

    const uploadsSource =
      path.join(root, 'uploads-source');

    const providerTarget =
      path.join(root, 'provider-target');

    const uploadsTarget =
      path.join(root, 'uploads-target');

    await write(
      path.join(
        providerSource,
        'license.png',
      ),
      'provider-document',
    );

    await write(
      path.join(
        uploadsSource,
        'order.png',
      ),
      'order-image',
    );

    const backupDir =
      await createBackup({
        env: {
          MONGODB_URI:
            'mongodb://backup.invalid/stars',
          STARS_BACKUP_ROOT:
            path.join(root, 'backups'),
          STARS_BACKUP_QUIESCED:
            BACKUP_QUIESCED_TOKEN,
        },
        providerRoot:
          providerSource,
        uploadsRoot:
          uploadsSource,
        runner:
          (executable, args) => {
            const archive =
              args.find(
                (arg) =>
                  arg.startsWith(
                    '--archive=',
                  ),
              );

            fs.writeFileSync(
              archive.slice(
                '--archive='.length,
              ),
              'mongo-archive',
            );
          },
      });

    await write(
      path.join(
        providerTarget,
        'stale.jpg',
      ),
      'stale',
    );

    await write(
      path.join(
        uploadsTarget,
        'stale.jpg',
      ),
      'stale',
    );

    let restoreCall;

    await restoreBackup({
      env: {
        MONGODB_URI:
          'mongodb://restore.invalid/stars',
        STARS_RESTORE_FROM:
          backupDir,
        STARS_RESTORE_CONFIRM:
          RESTORE_CONFIRM_TOKEN,
      },
      providerRoot:
        providerTarget,
      uploadsRoot:
        uploadsTarget,
      runner:
        (executable, args) => {
          restoreCall = {
            executable,
            args,
          };
        },
    });

    assert.equal(
      restoreCall.executable,
      'mongorestore',
    );

    assert.ok(
      restoreCall.args.includes(
        '--uri=mongodb://restore.invalid/stars',
      ),
    );

    assert.ok(
      restoreCall.args.includes(
        '--gzip',
      ),
    );

    assert.ok(
      restoreCall.args.includes(
        '--drop',
      ),
    );

    assert.equal(
      (
        await fsPromises.readFile(
          path.join(
            providerTarget,
            'license.png',
          ),
          'utf8',
        )
      ),
      'provider-document',
    );

    assert.equal(
      (
        await fsPromises.readFile(
          path.join(
            uploadsTarget,
            'order.png',
          ),
          'utf8',
        )
      ),
      'order-image',
    );

    await assert.rejects(
      fsPromises.access(
        path.join(
          providerTarget,
          'stale.jpg',
        ),
      ),
    );

    await assert.rejects(
      fsPromises.access(
        path.join(
          uploadsTarget,
          'stale.jpg',
        ),
      ),
    );
  },
);

test(
  'backup root must be absolute and outside the repository',
  async () => {
    await assert.rejects(
      () =>
        createBackup({
          env: {
            MONGODB_URI:
              'mongodb://example.invalid/stars',
            STARS_BACKUP_ROOT:
              'relative/backups',
            STARS_BACKUP_QUIESCED:
              BACKUP_QUIESCED_TOKEN,
          },
          providerRoot:
            path.join(
              os.tmpdir(),
              'provider',
            ),
          uploadsRoot:
            path.join(
              os.tmpdir(),
              'uploads',
            ),
          runner:
            () => {},
        }),
      /absolute path/,
    );
  },
);

test(
  'restore rejects an unsupported backup manifest version',
  async () => {
    const root =
      await tempRoot();

    const backupDir =
      path.join(root, 'backup');

    await fsPromises.mkdir(
      backupDir,
      {
        recursive: true,
      },
    );

    await fsPromises.writeFile(
      path.join(
        backupDir,
        'manifest.json',
      ),
      JSON.stringify({
        version:
          999,
      }),
    );

    await assert.rejects(
      () =>
        restoreBackup({
          env: {
            MONGODB_URI:
              'mongodb://example.invalid/stars',
            STARS_RESTORE_FROM:
              backupDir,
            STARS_RESTORE_CONFIRM:
              RESTORE_CONFIRM_TOKEN,
          },
          providerRoot:
            path.join(root, 'provider'),
          uploadsRoot:
            path.join(root, 'uploads'),
          runner:
            () => {},
        }),
      /invalid or unsupported/,
    );
  },
);
