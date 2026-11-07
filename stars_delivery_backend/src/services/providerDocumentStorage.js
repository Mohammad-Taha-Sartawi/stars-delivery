const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const fsPromises = fs.promises;

const MAX_PROVIDER_DOCUMENT_SIZE =
  5 * 1024 * 1024;

const PROVIDER_DOCUMENT_KINDS =
  Object.freeze([
    'identity_document',
    'driver_license',
  ]);

const REQUIRED_PROVIDER_DOCUMENT_FIELDS =
  Object.freeze([
    {
      fieldName: 'driverLicenseDocument',
      kind: 'driver_license',
    },
  ]);

const REQUIRED_PROVIDER_DOCUMENT_KINDS =
  Object.freeze(
    REQUIRED_PROVIDER_DOCUMENT_FIELDS
      .map((entry) => entry.kind),
  );

const ALLOWED_CONTENT_TYPES =
  Object.freeze([
    'image/jpeg',
    'image/png',
  ]);

function providerDocumentError(
  message,
  code = 'INVALID_PROVIDER_DOCUMENT',
) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function storageUnavailable(message) {
  return providerDocumentError(
    message,
    'PROVIDER_DOCUMENT_STORAGE_UNAVAILABLE',
  );
}

function isWithin(parent, candidate) {
  const relative =
    path.relative(parent, candidate);

  return (
    relative === ''
    || (
      !relative.startsWith(`..${path.sep}`)
      && relative !== '..'
      && !path.isAbsolute(relative)
    )
  );
}

function validateProviderDocumentsRoot(
  candidate,
) {
  const backendRoot =
    path.resolve(__dirname, '../..');

  const resolved =
    path.resolve(candidate);

  const blockedRoots = [
    path.join(backendRoot, 'uploads'),
    path.join(
      backendRoot,
      'src',
      'public',
    ),
  ];

  for (const blocked of blockedRoots) {
    if (isWithin(blocked, resolved)) {
      throw storageUnavailable(
        'Provider document storage cannot use a public upload directory.',
      );
    }
  }

  return resolved;
}

function providerDocumentsRoot(
  env = process.env,
) {
  const configured =
    typeof env.PROVIDER_DOCUMENTS_DIR
      === 'string'
      ? env.PROVIDER_DOCUMENTS_DIR.trim()
      : '';

  if (configured) {
    if (!path.isAbsolute(configured)) {
      throw storageUnavailable(
        'PROVIDER_DOCUMENTS_DIR must be an absolute path.',
      );
    }

    return validateProviderDocumentsRoot(
      configured,
    );
  }

  if (env.NODE_ENV === 'production') {
    throw storageUnavailable(
      'PROVIDER_DOCUMENTS_DIR is required in production.',
    );
  }

  return validateProviderDocumentsRoot(
    path.resolve(
      __dirname,
      '../../private/provider-documents',
    ),
  );
}

function hasProviderDocumentUploads(files) {
  if (
    !files
    || typeof files !== 'object'
  ) {
    return false;
  }

  return Object.values(files).some(
    (entries) =>
      Array.isArray(entries)
      && entries.length > 0,
  );
}

function detectDocumentType(file) {
  if (
    !file
    || !Buffer.isBuffer(file.buffer)
    || file.buffer.length === 0
  ) {
    throw providerDocumentError(
      'Provider document is empty.',
    );
  }

  if (
    file.buffer.length
    > MAX_PROVIDER_DOCUMENT_SIZE
  ) {
    throw providerDocumentError(
      'Provider document exceeds the size limit.',
    );
  }

  const buffer = file.buffer;

  const jpeg =
    buffer.length >= 3
    && buffer[0] === 0xff
    && buffer[1] === 0xd8
    && buffer[2] === 0xff;

  const pngSignature = [
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
  ];

  const png =
    buffer.length >= pngSignature.length
    && pngSignature.every(
      (value, index) =>
        buffer[index] === value,
    );

  let contentType;
  let extension;

  if (jpeg) {
    contentType = 'image/jpeg';
    extension = '.jpg';
  } else if (png) {
    contentType = 'image/png';
    extension = '.png';
  } else {
    throw providerDocumentError(
      'Provider document content is not an allowed image.',
    );
  }

  if (
    !ALLOWED_CONTENT_TYPES.includes(
      file.mimetype,
    )
    || file.mimetype !== contentType
  ) {
    throw providerDocumentError(
      'Provider document MIME type does not match its content.',
    );
  }

  return {
    contentType,
    extension,
    size: buffer.length,
  };
}

function inspectProviderDocumentFiles(files) {
  const source =
    files && typeof files === 'object'
      ? files
      : {};

  const allowed =
    new Set(
      REQUIRED_PROVIDER_DOCUMENT_FIELDS
        .map((entry) => entry.fieldName),
    );

  for (const fieldName of Object.keys(source)) {
    const entries = source[fieldName];

    if (
      Array.isArray(entries)
      && entries.length === 0
    ) {
      continue;
    }

    if (!allowed.has(fieldName)) {
      throw providerDocumentError(
        'Unexpected provider document field.',
      );
    }
  }

  return REQUIRED_PROVIDER_DOCUMENT_FIELDS
    .map(({ fieldName, kind }) => {
      const entries = source[fieldName];

      if (
        !Array.isArray(entries)
        || entries.length !== 1
      ) {
        throw providerDocumentError(
          'The driver-license document is required.',
          'PROVIDER_DOCUMENTS_REQUIRED',
        );
      }

      const file = entries[0];
      const detected =
        detectDocumentType(file);

      return {
        fieldName,
        kind,
        buffer: file.buffer,
        contentType:
          detected.contentType,
        extension:
          detected.extension,
        size:
          detected.size,
      };
    });
}

async function persistProviderDocumentFiles(
  inspectedFiles,
  options = {},
) {
  const root =
    options.root
      ? validateProviderDocumentsRoot(
          path.resolve(options.root),
        )
      : providerDocumentsRoot(
          options.env || process.env,
        );

  await fsPromises.mkdir(
    root,
    {
      recursive: true,
      mode: 0o700,
    },
  );

  const persisted = [];

  try {
    for (const file of inspectedFiles) {
      const storageKey =
        `${crypto.randomUUID()}${file.extension}`;

      const fullPath =
        path.join(root, storageKey);

      await fsPromises.writeFile(
        fullPath,
        file.buffer,
        {
          flag: 'wx',
          mode: 0o600,
        },
      );

      persisted.push({
        kind: file.kind,
        storageKey,
        contentType:
          file.contentType,
        size: file.size,
        sha256:
          crypto
            .createHash('sha256')
            .update(file.buffer)
            .digest('hex'),
        uploadedAt:
          new Date(),
      });
    }

    return persisted;
  } catch (error) {
    await deleteProviderDocuments(
      persisted,
      { root },
    ).catch(() => {});

    throw error;
  }
}

function providerDocumentPath(
  storageKey,
  options = {},
) {
  if (
    typeof storageKey !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png)$/i
      .test(storageKey)
  ) {
    throw providerDocumentError(
      'Invalid provider document storage key.',
    );
  }

  const root =
    options.root
      ? validateProviderDocumentsRoot(
          path.resolve(options.root),
        )
      : providerDocumentsRoot(
          options.env || process.env,
        );

  const fullPath =
    path.resolve(root, storageKey);

  if (!isWithin(root, fullPath)) {
    throw providerDocumentError(
      'Invalid provider document path.',
    );
  }

  return fullPath;
}

async function deleteProviderDocuments(
  documents,
  options = {},
) {
  if (!Array.isArray(documents)) {
    return;
  }

  for (const document of documents) {
    if (
      !document
      || typeof document.storageKey
        !== 'string'
    ) {
      continue;
    }

    const fullPath =
      providerDocumentPath(
        document.storageKey,
        options,
      );

    try {
      await fsPromises.unlink(fullPath);
    } catch (error) {
      if (
        error
        && error.code === 'ENOENT'
      ) {
        continue;
      }

      throw error;
    }
  }
}

function requiredProviderDocumentsPresent(
  documents,
) {
  if (!Array.isArray(documents)) {
    return false;
  }

  const kinds =
    new Set(
      documents.map(
        (document) => document?.kind,
      ),
    );

  return REQUIRED_PROVIDER_DOCUMENT_KINDS
    .every(
      (kind) => kinds.has(kind),
    );
}

function findProviderDocument(
  documents,
  kind,
) {
  if (
    !PROVIDER_DOCUMENT_KINDS
      .includes(kind)
    || !Array.isArray(documents)
  ) {
    return null;
  }

  return (
    documents.find(
      (document) =>
        document?.kind === kind,
    )
    || null
  );
}

function providerDocumentMetadata(document) {
  return {
    kind: document.kind,
    contentType:
      document.contentType,
    size: document.size,
    uploadedAt:
      document.uploadedAt,
  };
}

function providerDocumentDownloadName(
  kind,
  contentType,
) {
  const extension =
    contentType === 'image/png'
      ? 'png'
      : 'jpg';

  const prefix =
    kind === 'driver_license'
      ? 'driver-license'
      : 'identity-document';

  return `${prefix}.${extension}`;
}

module.exports = {
  MAX_PROVIDER_DOCUMENT_SIZE,
  PROVIDER_DOCUMENT_KINDS,
  REQUIRED_PROVIDER_DOCUMENT_FIELDS,
  REQUIRED_PROVIDER_DOCUMENT_KINDS,
  ALLOWED_CONTENT_TYPES,
  providerDocumentsRoot,
  validateProviderDocumentsRoot,
  hasProviderDocumentUploads,
  inspectProviderDocumentFiles,
  persistProviderDocumentFiles,
  providerDocumentPath,
  deleteProviderDocuments,
  requiredProviderDocumentsPresent,
  findProviderDocument,
  providerDocumentMetadata,
  providerDocumentDownloadName,
};
