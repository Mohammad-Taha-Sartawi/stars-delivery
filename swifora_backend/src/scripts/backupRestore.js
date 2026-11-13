const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const childProcess = require('child_process');

const {
  providerDocumentsRoot,
} = require('../services/providerDocumentStorage');

const fsPromises = fs.promises;

const MANIFEST_VERSION = 1;

const BACKUP_QUIESCED_TOKEN =
  'SWIFORA_BACKUP_WRITES_QUIESCED';

const RESTORE_CONFIRM_TOKEN =
  'RESTORE_SWIFORA_DATA';

// Pre-rebrand (Stars Delivery) names, still accepted so existing operator
// scripts and runbooks keep working.
const LEGACY_BACKUP_QUIESCED_TOKEN =
  'STARS_BACKUP_WRITES_QUIESCED';

const LEGACY_RESTORE_CONFIRM_TOKEN =
  'RESTORE_STARS_DELIVERY_DATA';

const LEGACY_ENV_NAMES = Object.freeze({
  SWIFORA_BACKUP_ROOT: 'STARS_BACKUP_ROOT',
  SWIFORA_BACKUP_QUIESCED: 'STARS_BACKUP_QUIESCED',
  SWIFORA_RESTORE_FROM: 'STARS_RESTORE_FROM',
  SWIFORA_RESTORE_CONFIRM: 'STARS_RESTORE_CONFIRM',
});

/** Copy of env where each SWIFORA_* name falls back to its STARS_* name. */
function withLegacyEnvNames(env) {
  const resolved = { ...env };
  for (const [name, legacy] of Object.entries(LEGACY_ENV_NAMES)) {
    if (resolved[name] === undefined && resolved[legacy] !== undefined) {
      resolved[name] = resolved[legacy];
    }
  }
  return resolved;
}

const backendRoot =
  path.resolve(__dirname, '../..');

const repositoryRoot =
  path.resolve(backendRoot, '..');

function requiredEnv(
  name,
  env = process.env,
) {
  const value =
    typeof env[name] === 'string'
      ? env[name].trim()
      : '';

  if (!value) {
    throw new Error(
      `${name} is required.`,
    );
  }

  return value;
}

function requireAbsoluteOutsideRepository(
  candidate,
  label,
) {
  if (
    typeof candidate !== 'string'
    || !path.isAbsolute(candidate)
  ) {
    throw new Error(
      `${label} must be an absolute path.`,
    );
  }

  const resolved =
    path.resolve(candidate);

  const relative =
    path.relative(
      repositoryRoot,
      resolved,
    );

  const insideRepository =
    relative === ''
    || (
      relative !== '..'
      && !relative.startsWith(
        `..${path.sep}`,
      )
      && !path.isAbsolute(relative)
    );

  if (insideRepository) {
    throw new Error(
      `${label} must be outside the repository.`,
    );
  }

  return resolved;
}

function timestampForPath(
  date = new Date(),
) {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

async function sha256File(filePath) {
  const hash =
    crypto.createHash('sha256');

  await new Promise(
    (resolve, reject) => {
      const input =
        fs.createReadStream(filePath);

      input.on(
        'data',
        (chunk) => hash.update(chunk),
      );

      input.once(
        'error',
        reject,
      );

      input.once(
        'end',
        resolve,
      );
    },
  );

  return hash.digest('hex');
}

async function regularFiles(root) {
  const result = [];

  async function walk(
    current,
    prefix = '',
  ) {
    let entries;

    try {
      entries =
        await fsPromises.readdir(
          current,
          {
            withFileTypes: true,
          },
        );
    } catch (error) {
      if (
        error
        && error.code === 'ENOENT'
      ) {
        return;
      }

      throw error;
    }

    for (const entry of entries) {
      const full =
        path.join(
          current,
          entry.name,
        );

      const relative =
        path.join(
          prefix,
          entry.name,
        );

      if (entry.isDirectory()) {
        await walk(
          full,
          relative,
        );
      } else if (entry.isFile()) {
        result.push({
          full,
          relative:
            relative
              .split(path.sep)
              .join('/'),
        });
      } else {
        throw new Error(
          `Unsupported filesystem entry: ${full}`,
        );
      }
    }
  }

  await walk(root);

  return result.sort(
    (a, b) =>
      a.relative.localeCompare(
        b.relative,
      ),
  );
}

async function copyDirectoryContents(
  source,
  destination,
) {
  try {
    await fsPromises.access(source);
  } catch (error) {
    if (
      error
      && error.code === 'ENOENT'
    ) {
      await fsPromises.mkdir(
        destination,
        {
          recursive: true,
        },
      );

      return;
    }

    throw error;
  }

  await fsPromises.cp(
    source,
    destination,
    {
      recursive: true,
      force: false,
      errorOnExist: true,
    },
  );
}

async function buildTreeManifest(
  root,
) {
  const files =
    await regularFiles(root);

  const entries = [];

  for (const file of files) {
    entries.push({
      path:
        file.relative,
      size:
        (
          await fsPromises.stat(
            file.full,
          )
        ).size,
      sha256:
        await sha256File(
          file.full,
        ),
    });
  }

  return entries;
}

function defaultRunner(
  executable,
  args,
) {
  const result =
    childProcess.spawnSync(
      executable,
      args,
      {
        stdio:
          'inherit',
        shell:
          false,
      },
    );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `${executable} exited with code ${result.status}.`,
    );
  }
}

async function createBackup({
  env: rawEnv = process.env,
  now = new Date(),
  runner = defaultRunner,
  providerRoot,
  uploadsRoot,
} = {}) {
  const env = withLegacyEnvNames(rawEnv);
  const mongoUri =
    requiredEnv(
      'MONGODB_URI',
      env,
    );

  if (
    env.SWIFORA_BACKUP_QUIESCED !== BACKUP_QUIESCED_TOKEN
    && env.SWIFORA_BACKUP_QUIESCED !== LEGACY_BACKUP_QUIESCED_TOKEN
  ) {
    throw new Error(
      'Backup requires SWIFORA_BACKUP_QUIESCED acknowledgement '
      + '(legacy name: STARS_BACKUP_QUIESCED).',
    );
  }

  const backupRoot =
    requireAbsoluteOutsideRepository(
      requiredEnv(
        'SWIFORA_BACKUP_ROOT',
        env,
      ),
      'SWIFORA_BACKUP_ROOT',
    );

  const resolvedProviderRoot =
    providerRoot
    || providerDocumentsRoot(env);

  const resolvedUploadsRoot =
    uploadsRoot
    || path.join(
      backendRoot,
      'uploads',
    );

  await fsPromises.mkdir(
    backupRoot,
    {
      recursive: true,
      mode: 0o700,
    },
  );

  const backupDir =
    path.join(
      backupRoot,
      `swifora-backup-${timestampForPath(now)}`,
    );

  await fsPromises.mkdir(
    backupDir,
    {
      recursive: false,
      mode: 0o700,
    },
  );

  const mongoArchive =
    path.join(
      backupDir,
      'mongo.archive.gz',
    );

  const providerBackup =
    path.join(
      backupDir,
      'provider-documents',
    );

  const uploadsBackup =
    path.join(
      backupDir,
      'uploads',
    );

  try {
    runner(
      'mongodump',
      [
        `--uri=${mongoUri}`,
        `--archive=${mongoArchive}`,
        '--gzip',
      ],
    );

    await fsPromises.access(
      mongoArchive,
    );

    await copyDirectoryContents(
      resolvedProviderRoot,
      providerBackup,
    );

    await copyDirectoryContents(
      resolvedUploadsRoot,
      uploadsBackup,
    );

    const manifest = {
      version:
        MANIFEST_VERSION,

      createdAt:
        now.toISOString(),

      mongo: {
        archive:
          'mongo.archive.gz',
        sha256:
          await sha256File(
            mongoArchive,
          ),
      },

      providerDocuments:
        await buildTreeManifest(
          providerBackup,
        ),

      uploads:
        await buildTreeManifest(
          uploadsBackup,
        ),
    };

    await fsPromises.writeFile(
      path.join(
        backupDir,
        'manifest.json',
      ),
      `${JSON.stringify(
        manifest,
        null,
        2,
      )}\n`,
      {
        encoding:
          'utf8',
        flag:
          'wx',
        mode:
          0o600,
      },
    );

    return backupDir;
  } catch (error) {
    await fsPromises.rm(
      backupDir,
      {
        recursive: true,
        force: true,
      },
    ).catch(() => {});

    throw error;
  }
}

async function loadManifest(
  backupDir,
) {
  const raw =
    await fsPromises.readFile(
      path.join(
        backupDir,
        'manifest.json',
      ),
      'utf8',
    );

  const manifest =
    JSON.parse(raw);

  if (
    !manifest
    || manifest.version
      !== MANIFEST_VERSION
    || typeof manifest.mongo?.archive
      !== 'string'
    || typeof manifest.mongo?.sha256
      !== 'string'
    || !Array.isArray(
      manifest.providerDocuments,
    )
    || !Array.isArray(
      manifest.uploads,
    )
  ) {
    throw new Error(
      'Backup manifest is invalid or unsupported.',
    );
  }

  return manifest;
}

async function verifyTree(
  root,
  expected,
) {
  const actual =
    await buildTreeManifest(root);

  if (
    JSON.stringify(actual)
    !== JSON.stringify(expected)
  ) {
    throw new Error(
      `Backup integrity verification failed for ${root}.`,
    );
  }
}

async function verifyBackup(
  backupDir,
) {
  const manifest =
    await loadManifest(
      backupDir,
    );

  const mongoArchive =
    path.join(
      backupDir,
      manifest.mongo.archive,
    );

  const mongoHash =
    await sha256File(
      mongoArchive,
    );

  if (
    mongoHash
    !== manifest.mongo.sha256
  ) {
    throw new Error(
      'Mongo backup archive checksum mismatch.',
    );
  }

  await verifyTree(
    path.join(
      backupDir,
      'provider-documents',
    ),
    manifest.providerDocuments,
  );

  await verifyTree(
    path.join(
      backupDir,
      'uploads',
    ),
    manifest.uploads,
  );

  return manifest;
}

async function replaceDirectory(
  source,
  destination,
  {
    privateFiles = false,
  } = {},
) {
  const staging =
    `${destination}.restore-${crypto.randomUUID()}`;

  await fsPromises.mkdir(
    path.dirname(destination),
    {
      recursive: true,
    },
  );

  await fsPromises.mkdir(
    staging,
    {
      recursive: true,
      mode:
        privateFiles
          ? 0o700
          : 0o755,
    },
  );

  try {
    await fsPromises.cp(
      source,
      staging,
      {
        recursive: true,
        force: true,
      },
    );

    if (privateFiles) {
      const files =
        await regularFiles(staging);

      await fsPromises.chmod(
        staging,
        0o700,
      ).catch(() => {});

      for (const file of files) {
        await fsPromises.chmod(
          file.full,
          0o600,
        ).catch(() => {});
      }
    }

    await fsPromises.rm(
      destination,
      {
        recursive: true,
        force: true,
      },
    );

    await fsPromises.rename(
      staging,
      destination,
    );
  } catch (error) {
    await fsPromises.rm(
      staging,
      {
        recursive: true,
        force: true,
      },
    ).catch(() => {});

    throw error;
  }
}

async function restoreBackup({
  env: rawEnv = process.env,
  runner = defaultRunner,
  providerRoot,
  uploadsRoot,
} = {}) {
  const env = withLegacyEnvNames(rawEnv);
  const mongoUri =
    requiredEnv(
      'MONGODB_URI',
      env,
    );

  if (
    env.SWIFORA_RESTORE_CONFIRM !== RESTORE_CONFIRM_TOKEN
    && env.SWIFORA_RESTORE_CONFIRM !== LEGACY_RESTORE_CONFIRM_TOKEN
  ) {
    throw new Error(
      'Restore requires explicit SWIFORA_RESTORE_CONFIRM acknowledgement '
      + '(legacy name: STARS_RESTORE_CONFIRM).',
    );
  }

  const backupDir =
    requireAbsoluteOutsideRepository(
      requiredEnv(
        'SWIFORA_RESTORE_FROM',
        env,
      ),
      'SWIFORA_RESTORE_FROM',
    );

  const resolvedProviderRoot =
    providerRoot
    || providerDocumentsRoot(env);

  const resolvedUploadsRoot =
    uploadsRoot
    || path.join(
      backendRoot,
      'uploads',
    );

  const manifest =
    await verifyBackup(
      backupDir,
    );

  const mongoArchive =
    path.join(
      backupDir,
      manifest.mongo.archive,
    );

  runner(
    'mongorestore',
    [
      `--uri=${mongoUri}`,
      `--archive=${mongoArchive}`,
      '--gzip',
      '--drop',
    ],
  );

  await replaceDirectory(
    path.join(
      backupDir,
      'provider-documents',
    ),
    resolvedProviderRoot,
    {
      privateFiles: true,
    },
  );

  await replaceDirectory(
    path.join(
      backupDir,
      'uploads',
    ),
    resolvedUploadsRoot,
  );

  return backupDir;
}

async function cli() {
  const action =
    process.argv[2];

  if (action === 'backup') {
    const backupDir =
      await createBackup();

    console.log(
      `Backup complete: ${backupDir}`,
    );

    return;
  }

  if (action === 'restore') {
    const backupDir =
      await restoreBackup();

    console.log(
      `Restore complete from: ${backupDir}`,
    );

    return;
  }

  throw new Error(
    'Usage: node src/scripts/backupRestore.js <backup|restore>',
  );
}

if (require.main === module) {
  cli().catch((error) => {
    console.error(
      `Backup/restore failed: ${error.message}`,
    );

    process.exitCode = 1;
  });
}

module.exports = {
  BACKUP_QUIESCED_TOKEN,
  RESTORE_CONFIRM_TOKEN,
  LEGACY_BACKUP_QUIESCED_TOKEN,
  LEGACY_RESTORE_CONFIRM_TOKEN,
  withLegacyEnvNames,
  createBackup,
  restoreBackup,
  verifyBackup,
};
