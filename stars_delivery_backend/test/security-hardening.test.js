const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  AD_UPLOAD_DIR,
  detectSafeImageType,
  finalizeAdImageFiles,
  removeAdImageFiles,
} = require('../src/services/adImageStorage');
const {
  validateLocationUpdate,
} = require('../src/security/locationValidation');
const {
  ORDER_CREATE_LIMIT,
  CHAT_SEND_LIMIT,
  REPORT_CREATE_LIMIT,
} = require('../src/security/actionRateLimit');
const {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCode,
} = require('../src/security/totp');

const backendRoot = path.resolve(__dirname, '..');
const uploadsRoot = AD_UPLOAD_DIR;

function source(relativePath) {
  return fs.readFileSync(
    path.join(backendRoot, relativePath),
    'utf8',
  );
}

function temporaryUploadFile(content, extension = '.upload') {
  const filePath = path.join(
    uploadsRoot,
    `security-test-${Date.now()}-${Math.random().toString(36).slice(2)}${extension}`,
  );

  fs.mkdirSync(uploadsRoot, { recursive: true });
  fs.writeFileSync(filePath, content);

  return {
    path: filePath,
    filename: path.basename(filePath),
    size: Buffer.byteLength(content),
    mimetype: 'image/png',
    destination: uploadsRoot,
  };
}

test('ad image upload rejects active HTML while accepting real image bytes', async () => {
  assert.equal(
    detectSafeImageType(Buffer.from('<html><script>alert(1)</script></html>')),
    null,
  );

  const png = Buffer.from([
    0x89, 0x50, 0x4e, 0x47,
    0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d,
  ]);

  assert.equal(
    detectSafeImageType(png).mimeType,
    'image/png',
  );

  const htmlFile = temporaryUploadFile(
    '<!doctype html><script>alert(1)</script>',
  );

  await assert.rejects(
    finalizeAdImageFiles([htmlFile]),
    /Only JPEG, PNG, GIF, or WebP images are allowed/,
  );

  assert.equal(fs.existsSync(htmlFile.path), false);

  const pngFile = temporaryUploadFile(png);

  try {
    const [finalized] = await finalizeAdImageFiles([pngFile]);

    assert.match(
      finalized.filename,
      /^[0-9a-f-]{36}\.png$/i,
    );
    assert.equal(
      finalized.filename.includes('security-test'),
      false,
    );
    assert.equal(fs.existsSync(finalized.path), true);
  } finally {
    await removeAdImageFiles([pngFile]);
  }
});

test('only ad administration accepts image uploads', () => {
  const storage = source('src/services/adImageStorage.js');
  const adminAds = source('src/routes/adminAds.js');
  const orders = source('src/routes/orders.js');
  const auth = source('src/routes/auth.js');

  assert.doesNotMatch(storage, /file\.originalname/);
  assert.match(storage, /crypto\.randomUUID\(\)/);
  assert.match(storage, /detectSafeImageType/);
  assert.match(storage, /file\.mimetype\.startsWith\('image\/'\)/);
  assert.match(adminAds, /adImageUpload/);
  assert.match(adminAds, /finalizeAdImageFiles/);
  assert.doesNotMatch(orders, /multer|orderImageUpload|finalizeOrderImageFiles/);
  assert.doesNotMatch(auth, /multer|providerRegistrationUpload|inspectProviderDocumentFiles/);
});

test('customer phone is not broadcast in new-order socket payloads', () => {
  const orders = source('src/routes/orders.js');
  const offers = source('src/routes/offers.js');

  assert.doesNotMatch(orders, /phone:\s*orderPhone/);
  assert.doesNotMatch(offers, /phone:\s*order\.phone/);
  assert.match(orders, /phoneMasked:\s*maskedPhone\(order\.phone\)/);
});

test('uploads are served only with safe image extensions and hardened headers', () => {
  const index = source('src/index.js');

  assert.match(index, /isSafeUploadExtension\(req\.path\)/);
  assert.match(index, /Content-Security-Policy/);
  assert.match(index, /X-Content-Type-Options.*nosniff/s);
  assert.match(index, /express\.static\(uploadedFilesRoot/);
  assert.match(index, /app\.disable\('x-powered-by'\)/);
  assert.match(index, /helmet\(/);
});

test('location updates reject invalid ranges, mocked locations, and impossible jumps', () => {
  assert.equal(
    validateLocationUpdate({
      latitude: 91,
      longitude: 35,
    }).code,
    'INVALID_COORDINATES',
  );

  assert.equal(
    validateLocationUpdate({
      latitude: 31.9,
      longitude: 35.2,
      isMocked: true,
      rejectMocked: true,
    }).code,
    'MOCK_LOCATION',
  );

  assert.equal(
    validateLocationUpdate({
      latitude: 31.9,
      longitude: 35.2,
      isMocked: true,
    }).ok,
    true,
  );

  const jump = validateLocationUpdate({
    latitude: 31.9,
    longitude: 35.2,
    previousLatitude: 31.9,
    previousLongitude: 35.2,
    previousUpdatedAt: new Date(),
    now: Date.now(),
  });

  assert.equal(jump.ok, true);

  const impossible = validateLocationUpdate({
    latitude: 32.5,
    longitude: 35.9,
    previousLatitude: 31.9,
    previousLongitude: 35.2,
    previousUpdatedAt: new Date(),
    now: Date.now(),
  });

  assert.equal(impossible.code, 'LOCATION_JUMP');
});

test('rate limits, request length caps, and admin audit infrastructure are wired', () => {
  assert.equal(ORDER_CREATE_LIMIT, 5);
  assert.equal(CHAT_SEND_LIMIT, 30);
  assert.equal(REPORT_CREATE_LIMIT, 5);

  assert.match(source('src/routes/orders.js'), /orderCreateLimiter/);
  assert.match(source('src/routes/chat.js'), /chatSendLimiter/);
  assert.match(source('src/routes/reports.js'), /reportCreateLimiter/);
  assert.match(source('src/routes/users.js'), /locationUpdateLimiter/);
  assert.match(source('src/models/Order.js'), /maxlength: 2000/);
  assert.match(source('src/models/ChatMessage.js'), /maxlength: 2000/);
  assert.match(source('src/models/Report.js'), /maxlength: 2000/);
  assert.match(source('src/index.js'), /adminAuditLogger/);
  assert.match(source('src/models/AdminAuditLog.js'), /createdAt/);
  assert.match(source('src/middleware/adminAuditLog.js'), /bodyKeys/);
});

test('admin sessions are revalidated against the database and version', () => {
  const middleware = source('src/middleware/requireAdminSession.js');
  const adminAuth = source('src/routes/adminAuth.js');

  assert.match(middleware, /loadAdminById/);
  assert.match(middleware, /isActiveAdminAccount/);
  assert.match(middleware, /adminSessionVersionMatches/);
  assert.match(adminAuth, /sessionVersion: admin\.sessionVersion \?\? 0/);
  assert.match(adminAuth, /adminLoginAccountLimiter/);
});

test('logout revokes the mobile session on the server side', () => {
  const auth = source('src/routes/auth.js');
  const service = source('../lib/services/auth_service.dart');
  const customer = source('../lib/screens/home_screen.dart');
  const provider = source('../lib/screens/provider_home_screen.dart');

  assert.match(auth, /router\.post\(\s*'\/logout'/s);
  assert.match(auth, /sessionVersion: 1/);
  assert.match(service, /revokeSession/);
  assert.match(service, /'\/auth\/logout'/);
  assert.match(customer, /revokeSession\(widget\.token\)/);
  assert.match(provider, /revokeSession\(widget\.token\)/);
});

test('order creation no longer accepts or returns images', () => {
  const orders = source('src/routes/orders.js');
  const model = source('src/models/Order.js');

  assert.doesNotMatch(orders, /images|upload/i);
  assert.doesNotMatch(model, /images:/);
});

test('administrator TOTP codes and recovery codes are verified and hashed', () => {
  const secret = generateTotpSecret();
  const code = generateTotpCode(secret);

  assert.match(code, /^\d{6}$/);
  assert.equal(verifyTotpCode(secret, code), true);
  assert.equal(verifyTotpCode(secret, '000000'), false);

  const recoveryCodes = generateRecoveryCodes(8);
  assert.equal(recoveryCodes.length, 8);
  assert.equal(new Set(recoveryCodes).size, 8);

  const digest = hashRecoveryCode(recoveryCodes[0]);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.equal(digest, hashRecoveryCode(recoveryCodes[0].toLowerCase()));

  const auth = source('src/routes/adminAuth.js');
  const login = source('src/views/admin/login.ejs');
  const dashboard = source('src/views/admin/index.ejs');

  assert.match(auth, /router\.post\('\/2fa\/setup'/);
  assert.match(auth, /router\.post\('\/2fa\/enable'/);
  assert.match(auth, /verifyTotpCode/);
  assert.match(login, /name="twoFactorCode"/);
  assert.match(dashboard, /data-admin-action="manageTwoFactor"/);
});
