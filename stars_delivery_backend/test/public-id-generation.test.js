const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidPublicId,
  isValidAdminPublicId,
  isSpecialPublicId,
  randomPublicId,
  MAX_PUBLIC_ID_LENGTH,
  GENERATED_MIN_LENGTH,
} = require('../src/utils/publicId');

test('public IDs follow the numeric and uniqueness-safe format rules', () => {
  assert.equal(MAX_PUBLIC_ID_LENGTH, 12);
  assert.equal(isValidPublicId('482915730164'), true);
  assert.equal(isValidPublicId('3412371'), true);

  assert.equal(isValidPublicId('111111'), false);
  assert.equal(isValidPublicId('1112'), false);
  assert.equal(isValidPublicId('123456'), false);
  assert.equal(isValidPublicId('987654'), false);
  assert.equal(isValidPublicId('121212'), false);
  assert.equal(isValidPublicId('012345'), false);
  assert.equal(isValidPublicId('1234567890123'), false);
  assert.equal(isValidPublicId('12A456'), false);
  assert.equal(isSpecialPublicId('482915730164'), false);
});

test('admin dashboard may assign special, repeated, and leading-zero IDs', () => {
  assert.equal(isValidAdminPublicId('1'), true);
  assert.equal(isValidAdminPublicId('111111'), true);
  assert.equal(isValidAdminPublicId('123456'), true);
  assert.equal(isValidAdminPublicId('000001'), true);
  assert.equal(isValidAdminPublicId('9'.repeat(50)), true);
  assert.equal(isValidAdminPublicId('12A456'), false);
  assert.equal(isValidAdminPublicId(''), false);
});

test('generated public IDs are random numeric IDs up to twelve digits', () => {
  for (let index = 0; index < 200; index += 1) {
    const id = randomPublicId();
    assert.match(id, /^[1-9]\d*$/);
    assert.ok(id.length >= GENERATED_MIN_LENGTH);
    assert.ok(id.length <= MAX_PUBLIC_ID_LENGTH);
  }
});

test('user and driver screens show ID instead of a hash prefix', () => {
  const fs = require('fs');
  const path = require('path');
  const projectRoot = path.resolve(__dirname, '..', '..');
  const screens = [
    'lib/screens/profile_screen.dart',
    'lib/screens/order_offers_screen.dart',
    'lib/screens/order_detail_screen.dart',
    'lib/screens/pending_orders_screen.dart',
    'lib/screens/offered_orders_screen.dart',
    'lib/screens/provider_active_orders_screen.dart',
    'lib/screens/rejected_orders_screen.dart',
    'lib/screens/report_screen.dart',
  ];

  for (const screen of screens) {
    const source = fs.readFileSync(path.join(projectRoot, screen), 'utf8');
    assert.doesNotMatch(source, /'#\$/);
    assert.match(source, /'ID \$/);
  }

  const adminScript = fs.readFileSync(
    path.join(projectRoot, 'stars_delivery_backend/src/public/js/main.js'),
    'utf8',
  );
  assert.doesNotMatch(adminScript, /<small>#\$\{/);
  assert.doesNotMatch(adminScript, /<td>#\$\{/);
});
