const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const ORDER_UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const MAX_ORDER_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_ORDER_IMAGES = 3;

const SAFE_IMAGE_TYPES = [
  {
    mimeType: 'image/jpeg',
    extension: '.jpg',
    matches: (buffer) =>
      buffer.length >= 3
      && buffer[0] === 0xff
      && buffer[1] === 0xd8
      && buffer[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    extension: '.png',
    matches: (buffer) =>
      buffer.length >= 8
      && buffer[0] === 0x89
      && buffer[1] === 0x50
      && buffer[2] === 0x4e
      && buffer[3] === 0x47
      && buffer[4] === 0x0d
      && buffer[5] === 0x0a
      && buffer[6] === 0x1a
      && buffer[7] === 0x0a,
  },
  {
    mimeType: 'image/gif',
    extension: '.gif',
    matches: (buffer) => {
      if (buffer.length < 6) return false;

      const signature = buffer
        .subarray(0, 6)
        .toString('ascii');

      return signature === 'GIF87a'
        || signature === 'GIF89a';
    },
  },
  {
    mimeType: 'image/webp',
    extension: '.webp',
    matches: (buffer) =>
      buffer.length >= 12
      && buffer.subarray(0, 4).toString('ascii') === 'RIFF'
      && buffer.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

const SAFE_UPLOAD_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
]);

class OrderImageValidationError extends Error {
  constructor(message, code = 'INVALID_IMAGE') {
    super(message);
    this.name = 'OrderImageValidationError';
    this.code = code;
  }
}

function ensureOrderUploadDirectory() {
  fs.mkdirSync(ORDER_UPLOAD_DIR, {
    recursive: true,
  });
}

ensureOrderUploadDirectory();

function detectSafeImageType(buffer) {
  return SAFE_IMAGE_TYPES.find(
    (type) => type.matches(buffer),
  ) || null;
}

async function readFileHeader(filePath, length = 64) {
  const handle = await fs.promises.open(filePath, 'r');

  try {
    const buffer = Buffer.alloc(length);
    const result = await handle.read(
      buffer,
      0,
      length,
      0,
    );

    return buffer.subarray(0, result.bytesRead);
  } finally {
    await handle.close();
  }
}

async function finalizeOrderImageFiles(files) {
  const entries = Array.isArray(files) ? files : [];

  try {
    for (const file of entries) {
      if (!file?.path || !file?.size) {
        throw new OrderImageValidationError(
          'The uploaded image is empty.',
          'EMPTY_IMAGE',
        );
      }

      const header = await readFileHeader(file.path);
      const detected = detectSafeImageType(header);

      if (!detected) {
        throw new OrderImageValidationError(
          'Only JPEG, PNG, GIF, or WebP images are allowed.',
          'UNSUPPORTED_IMAGE',
        );
      }

      const safeName =
        `${crypto.randomUUID()}${detected.extension}`;
      const safePath = path.join(
        ORDER_UPLOAD_DIR,
        safeName,
      );

      await fs.promises.rename(file.path, safePath);

      file.filename = safeName;
      file.path = safePath;
      file.destination = ORDER_UPLOAD_DIR;
      file.mimetype = detected.mimeType;
    }

    return entries;
  } catch (error) {
    await removeOrderImageFiles(entries);
    throw error;
  }
}

async function removeOrderImageFiles(files) {
  const entries = Array.isArray(files) ? files : [];

  await Promise.all(
    entries.map((file) =>
      deleteOrderImageFile(file?.path),
    ),
  );
}

async function deleteOrderImageFile(filePath) {
  if (!filePath) return;

  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      // Cleanup failures must never hide the original request error.
    }
  }
}

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    ensureOrderUploadDirectory();
    callback(null, ORDER_UPLOAD_DIR);
  },
  filename: (req, file, callback) => {
    callback(null, `${crypto.randomUUID()}.upload`);
  },
});

const orderImageUpload = multer({
  storage,
  limits: {
    fileSize: MAX_ORDER_IMAGE_BYTES,
    files: MAX_ORDER_IMAGES,
    fields: 20,
    fieldSize: 100 * 1024,
    parts: 30,
  },
  fileFilter: (req, file, callback) => {
    if (
      typeof file.mimetype === 'string'
      && file.mimetype.startsWith('image/')
    ) {
      callback(null, true);
      return;
    }

    callback(
      new OrderImageValidationError(
        'Only image files are allowed.',
        'UNSUPPORTED_IMAGE',
      ),
    );
  },
}).array('images', MAX_ORDER_IMAGES);

function orderImageUploadErrorMessage(error) {
  if (error?.code === 'LIMIT_FILE_SIZE') {
    return 'Each image must be 5MB or smaller.';
  }

  if (
    error?.code === 'LIMIT_FILE_COUNT'
    || error?.code === 'LIMIT_UNEXPECTED_FILE'
  ) {
    return `A maximum of ${MAX_ORDER_IMAGES} images is allowed.`;
  }

  if (error instanceof OrderImageValidationError) {
    return error.message;
  }

  return 'Invalid image upload.';
}

function isSafeUploadExtension(filePath) {
  return SAFE_UPLOAD_EXTENSIONS.has(
    path.extname(String(filePath || '')).toLowerCase(),
  );
}

module.exports = {
  ORDER_UPLOAD_DIR,
  MAX_ORDER_IMAGE_BYTES,
  MAX_ORDER_IMAGES,
  SAFE_UPLOAD_EXTENSIONS,
  OrderImageValidationError,
  orderImageUpload,
  orderImageUploadErrorMessage,
  finalizeOrderImageFiles,
  removeOrderImageFiles,
  deleteOrderImageFile,
  detectSafeImageType,
  isSafeUploadExtension,
};
