const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot =
  path.resolve(__dirname, '../..');

function read(relativePath) {
  return fs.readFileSync(
    path.join(projectRoot, relativePath),
    'utf8',
  );
}

test(
  'Flutter endpoint policy uses a compile-time server origin and isolates HTTP fallback to Android debug',
  () => {
    const source =
      read('lib/services/api_config.dart');

    assert.match(
      source,
      /String\.fromEnvironment\(\s*['"]STARS_SERVER_URL['"]\s*,?\s*\)/,
    );

    assert.match(
      source,
      /debugMode\s*&&\s*android/,
    );

    assert.match(
      source,
      /STARS_SERVER_URL is required outside/,
    );

    assert.match(
      source,
      /STARS_SERVER_URL must use HTTPS/,
    );

    assert.match(
      source,
      /kDebugMode\s*&&\s*Platform\.isAndroid/,
    );
  },
);

test(
  'Socket transport uses the authoritative server origin without API-path string surgery',
  () => {
    const source =
      read('lib/services/socket_service.dart');

    assert.match(
      source,
      /final uri = ApiConfig\.serverUrl;/,
    );

    assert.doesNotMatch(
      source,
      /replaceFirst\(['"]\/api['"]/,
    );
  },
);

test(
  'Android main grants Internet access while denying cleartext transport',
  () => {
    const source =
      read(
        'android/app/src/main/AndroidManifest.xml',
      );

    assert.match(
      source,
      /android\.permission\.INTERNET/,
    );

    assert.match(
      source,
      /android:usesCleartextTraffic="false"/,
    );
  },
);

test(
  'Android cleartext exception exists only in debug overlay',
  () => {
    const debug =
      read(
        'android/app/src/debug/AndroidManifest.xml',
      );

    const profile =
      read(
        'android/app/src/profile/AndroidManifest.xml',
      );

    assert.match(
      debug,
      /android:usesCleartextTraffic="true"/,
    );

    assert.match(
      debug,
      /tools:replace="android:usesCleartextTraffic"/,
    );

    assert.doesNotMatch(
      profile,
      /usesCleartextTraffic="true"/,
    );
  },
);

test(
  'iOS keeps default ATS enforcement without broad insecure transport exceptions',
  () => {
    const source =
      read('ios/Runner/Info.plist');

    assert.doesNotMatch(
      source,
      /NSAllowsArbitraryLoads/,
    );

    assert.doesNotMatch(
      source,
      /NSExceptionAllowsInsecureHTTPLoads/,
    );

    assert.doesNotMatch(
      source,
      /NSTemporaryExceptionAllowsInsecureHTTPLoads/,
    );
  },
);

test(
  'production backend disables LAN discovery while preserving the audited proxy contract',
  () => {
    const source =
      read(
        'swifora_backend/src/index.js',
      );

    const envExample =
      read(
        'swifora_backend/.env.example',
      );

    assert.match(
      source,
      /if\s*\(process\.env\.NODE_ENV\s*===\s*'production'\)\s*app\.set\('trust proxy',\s*1\);/,
    );

    assert.match(
      source,
      /const isProduction\s*=\s*process\.env\.NODE_ENV === 'production'/,
    );

    assert.match(
      source,
      /const lanIp\s*=\s*isProduction \? null : getLanIp\(\)/,
    );

    assert.match(
      source,
      /if\s*\(!isProduction\)\s*\{[\s\S]*app\.get\('\/api\/config'/,
    );

    assert.match(
      envExample,
      /NODE_ENV=development/,
    );

    assert.match(
      envExample,
      /TLS-terminating reverse-proxy hop/,
    );
  },
);
