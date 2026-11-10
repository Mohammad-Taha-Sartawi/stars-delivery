const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const path = require('path');

const {
  REQUIRED_PROVIDER_DOCUMENT_KINDS,
  providerDocumentsRoot,
  inspectProviderDocumentFiles,
  persistProviderDocumentFiles,
  providerDocumentPath,
  deleteProviderDocuments,
  requiredProviderDocumentsPresent,
  providerDocumentMetadata,
} = require('../src/services/providerDocumentStorage');

function jpegBuffer() {
  return Buffer.from([
    0xff, 0xd8, 0xff, 0xe0,
    0x00, 0x10, 0x4a, 0x46,
    0x49, 0x46,
  ]);
}

function pngBuffer() {
  return Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
    0x00,
  ]);
}

function validFiles() {
  return {
    driverLicenseDocument: [{
      mimetype: 'image/png',
      buffer: pngBuffer(),
    }],
  };
}

function source(file) {
  return fs.readFileSync(
    path.join(__dirname, '..', file),
    'utf8',
  );
}

test(
  'development storage is private and non-public',
  () => {
    const root =
      providerDocumentsRoot({
        NODE_ENV: 'development',
      });

    assert.match(
      root,
      /private[\\/]provider-documents$/,
    );

    assert.equal(
      /[\\/]uploads([\\/]|$)/.test(root),
      false,
    );

    assert.equal(
      /[\\/]src[\\/]public([\\/]|$)/.test(root),
      false,
    );
  },
);

test(
  'production storage fails closed and rejects public roots',
  () => {
    assert.throws(
      () =>
        providerDocumentsRoot({
          NODE_ENV: 'production',
        }),
      /required in production/,
    );

    assert.throws(
      () =>
        providerDocumentsRoot({
          NODE_ENV: 'production',
          PROVIDER_DOCUMENTS_DIR:
            'relative/provider-documents',
        }),
      /absolute path/,
    );

    const backendRoot =
      path.resolve(__dirname, '..');

    assert.throws(
      () =>
        providerDocumentsRoot({
          NODE_ENV: 'production',
          PROVIDER_DOCUMENTS_DIR:
            path.join(
              backendRoot,
              'uploads',
              'provider-documents',
            ),
        }),
      /public upload directory/,
    );

    const privateRoot =
      path.join(
        os.tmpdir(),
        'stars-private-provider-documents',
      );

    assert.equal(
      providerDocumentsRoot({
        NODE_ENV: 'production',
        PROVIDER_DOCUMENTS_DIR:
          privateRoot,
      }),
      path.resolve(privateRoot),
    );
  },
);

test(
  'exact driver-license file is required',
  () => {
    assert.throws(
      () =>
        inspectProviderDocumentFiles({
          identityDocument: [{
            mimetype: 'image/jpeg',
            buffer: jpegBuffer(),
          }],
        }),
      /Unexpected provider document field/,
    );

    assert.throws(
      () =>
        inspectProviderDocumentFiles({}),
      (error) =>
        error.code
        === 'PROVIDER_DOCUMENTS_REQUIRED',
    );

    const inspected =
      inspectProviderDocumentFiles(
        validFiles(),
      );

    assert.deepEqual(
      inspected.map((file) => file.kind),
      REQUIRED_PROVIDER_DOCUMENT_KINDS,
    );
  },
);

test(
  'real JPEG and PNG signatures are accepted',
  () => {
    const pngFiles =
      inspectProviderDocumentFiles(
        validFiles(),
      );

    assert.equal(
      pngFiles[0].contentType,
      'image/png',
    );

    assert.equal(
      pngFiles[0].extension,
      '.png',
    );

    const jpegFiles =
      inspectProviderDocumentFiles({
        driverLicenseDocument: [{
          mimetype: 'image/jpeg',
          buffer: jpegBuffer(),
        }],
      });

    assert.equal(
      jpegFiles[0].contentType,
      'image/jpeg',
    );

    assert.equal(
      jpegFiles[0].extension,
      '.jpg',
    );
  },
);

test(
  'MIME spoofing and arbitrary bytes are rejected',
  () => {
    assert.throws(
      () =>
        inspectProviderDocumentFiles({
          driverLicenseDocument: [{
            mimetype: 'image/png',
            buffer: jpegBuffer(),
          }],
        }),
      /MIME type does not match/,
    );

    assert.throws(
      () =>
        inspectProviderDocumentFiles({
          driverLicenseDocument: [{
            mimetype: 'image/jpeg',
            buffer:
              Buffer.from('not-image'),
          }],
        }),
      /not an allowed image/,
    );
  },
);

test(
  'private persistence uses opaque UUID keys and SHA-256',
  async () => {
    const root =
      await fsp.mkdtemp(
        path.join(
          os.tmpdir(),
          'stars-provider-docs-',
        ),
      );

    try {
      const documents =
        await persistProviderDocumentFiles(
          inspectProviderDocumentFiles(
            validFiles(),
          ),
          { root },
        );

      assert.equal(
        documents.length,
        1,
      );

      for (const document of documents) {
        assert.match(
          document.storageKey,
          /^[0-9a-f-]{36}\.(jpg|png)$/i,
        );

        assert.match(
          document.sha256,
          /^[a-f0-9]{64}$/,
        );

        assert.equal(
          'originalName' in document,
          false,
        );

        assert.equal(
          fs.existsSync(
            path.join(
              root,
              document.storageKey,
            ),
          ),
          true,
        );
      }
    } finally {
      await fsp.rm(
        root,
        {
          recursive: true,
          force: true,
        },
      );
    }
  },
);

test(
  'storage-key resolver rejects traversal and filenames',
  () => {
    const root =
      path.join(
        os.tmpdir(),
        'stars-provider-doc-path',
      );

    assert.throws(
      () =>
        providerDocumentPath(
          '../secret.txt',
          { root },
        ),
      /Invalid provider document storage key/,
    );

    assert.throws(
      () =>
        providerDocumentPath(
          'license.jpg',
          { root },
        ),
      /Invalid provider document storage key/,
    );
  },
);

test(
  'private cleanup deletes stored files',
  async () => {
    const root =
      await fsp.mkdtemp(
        path.join(
          os.tmpdir(),
          'stars-provider-cleanup-',
        ),
      );

    try {
      const documents =
        await persistProviderDocumentFiles(
          inspectProviderDocumentFiles(
            validFiles(),
          ),
          { root },
        );

      await deleteProviderDocuments(
        documents,
        { root },
      );

      for (const document of documents) {
        assert.equal(
          fs.existsSync(
            path.join(
              root,
              document.storageKey,
            ),
          ),
          false,
        );
      }
    } finally {
      await fsp.rm(
        root,
        {
          recursive: true,
          force: true,
        },
      );
    }
  },
);

test(
  'admin metadata hides storage key and SHA-256',
  () => {
    const metadata =
      providerDocumentMetadata({
        kind:
          'identity_document',
        storageKey:
          'hidden.jpg',
        contentType:
          'image/jpeg',
        size: 10,
        sha256:
          'a'.repeat(64),
        uploadedAt:
          new Date(
            '2026-08-30T00:00:00Z',
          ),
      });

    assert.deepEqual(
      Object.keys(metadata).sort(),
      [
        'contentType',
        'kind',
        'size',
        'uploadedAt',
      ],
    );

    assert.equal(
      requiredProviderDocumentsPresent([
        {
          kind:
            'driver_license',
        },
      ]),
      true,
    );

    assert.equal(
      requiredProviderDocumentsPresent([
        {
          kind:
            'identity_document',
        },
      ]),
      false,
    );

    assert.equal(
      requiredProviderDocumentsPresent([
        {
          kind:
            'identity_document',
        },
        {
          kind:
            'driver_license',
        },
      ]),
      true,
    );
  },
);

test(
  'PendingProvider documents are select-false',
  () => {
    const text =
      source(
        'src/models/PendingProvider.js',
      );

    assert.match(
      text,
      /providerDocuments:\s*\{/,
    );

    assert.match(
      text,
      /select:\s*false/,
    );

    assert.match(
      text,
      /identity_document/,
    );

    assert.match(
      text,
      /driver_license/,
    );
  },
);

test(
  'User documents remain select-false after approval',
  () => {
    const text =
      source(
        'src/models/User.js',
      );

    assert.match(
      text,
      /providerDocuments:\s*\{/,
    );

    assert.match(
      text,
      /select:\s*false/,
    );

    assert.match(
      text,
      /sha256/,
    );
  },
);

test(
  'mobile provider registration no longer accepts document uploads',
  () => {
    const auth =
      source('src/routes/auth.js');

    assert.doesNotMatch(
      auth,
      /multer|providerRegistrationUpload|REQUIRED_PROVIDER_DOCUMENT_FIELDS|inspectProviderDocumentFiles|persistProviderDocumentFiles/,
    );

    assert.match(
      auth,
      /PendingProvider\.create\(\{/,
    );
  },
);

test(
  'legacy provider document storage remains private and validated',
  () => {
    const storage =
      source(
        'src/services/providerDocumentStorage.js',
      );

    assert.match(
      storage,
      /fieldName:\s*'driverLicenseDocument'/,
    );

    assert.match(
      storage,
      /private[\/]provider-documents/,
    );

    assert.match(
      storage,
      /contentType/,
    );
  },
);

test(
  'admin document routes inherit session and CSRF protection and force safe downloads',
  () => {
    const routes =
      source(
        'src/routes/adminDrivers.js',
      );

    const index =
      source(
        'src/index.js',
      );

    assert.match(
      index,
      /app\.use\(\s*['"]\/admin\/drivers['"]\s*,\s*requireAdminSession\s*,\s*adminCsrfProtection\s*,\s*adminDriverRoutes\s*\)/s,
    );

    assert.match(
      routes,
      /\/pending\/:id\/documents/,
    );

    assert.match(
      routes,
      /\/documents\/:id\/:kind/,
    );

    assert.match(
      routes,
      /Cache-Control/,
    );

    assert.match(
      routes,
      /no-store/,
    );

    assert.match(
      routes,
      /nosniff/,
    );

    assert.match(
      routes,
      /Content-Disposition/,
    );

    assert.match(
      routes,
      /attachment/,
    );
  },
);

test(
  'approval no longer requires evidence and transfers legacy metadata',
  () => {
    const text =
      source(
        'src/routes/adminDrivers.js',
      );

    const approvalStart =
      text.indexOf(
        "router.post('/pending/:id/approve'",
      );

    const rejectionStart =
      text.indexOf(
        "router.delete('/pending/:id/reject'",
        approvalStart,
      );

    assert.ok(approvalStart >= 0);
    assert.ok(rejectionStart > approvalStart);

    const approval =
      text.slice(approvalStart, rejectionStart);

    assert.doesNotMatch(
      approval,
      /requiredProviderDocumentsPresent|PROVIDER_DOCUMENTS_REQUIRED/,
    );

    assert.match(
      approval,
      /select\(\s*['"]\+password \+providerDocuments['"]\s*,?\s*\)/,
    );

    assert.match(
      approval,
      /providerDocuments:\s*\(pending\.providerDocuments \|\| \[\]\)/,
    );
  },
);

test(
  'rejection removes database record before private files and legacy route is disabled',
  () => {
    const text =
      source(
        'src/routes/adminDrivers.js',
      );

    const rejectionStart =
      text.indexOf(
        "router.delete('/pending/:id/reject'",
      );

    assert.ok(
      rejectionStart >= 0,
    );

    const rejection =
      text.slice(
        rejectionStart,
      );

    const databaseDeleteIndex =
      rejection.indexOf(
        'findOneAndDelete',
      );

    const fileDeleteIndex =
      rejection.indexOf(
        'deleteProviderDocuments',
      );

    assert.ok(
      databaseDeleteIndex >= 0,
    );

    assert.ok(
      fileDeleteIndex >= 0,
    );

    assert.ok(
      databaseDeleteIndex
      < fileDeleteIndex,
    );

    assert.match(
      text,
      /LEGACY_PROVIDER_DOCUMENT_FLOW_DISABLED/,
    );

    assert.match(
      text,
      /status\(410\)/,
    );
  },
);

test(
  'deployment config stays private and uncommitted',
  () => {
    const env =
      source('.env.example');

    const ignore =
      source('.gitignore');

    assert.match(
      env,
      /PROVIDER_DOCUMENTS_DIR=/,
    );

    assert.match(
      env,
      /absolute path/,
    );

    assert.match(
      ignore,
      /^private\/$/m,
    );

    assert.doesNotMatch(
      env,
      /PROVIDER_DOCUMENTS_DIR=.+\S/,
    );
  },
);
