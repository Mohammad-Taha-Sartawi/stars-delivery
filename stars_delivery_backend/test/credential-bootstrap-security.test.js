const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  MIN_PROVIDER_BOOTSTRAP_PASSWORD_LENGTH,
  MAX_PROVIDER_BOOTSTRAP_PASSWORD_LENGTH,
  isValidProviderBootstrapPassword,
} = require('../src/security/passwordPolicy');

const backendRoot =
  path.resolve(__dirname, '..');

function source(relativePath) {
  return fs.readFileSync(
    path.join(
      backendRoot,
      relativePath,
    ),
    'utf8',
  );
}

function collectSourceFiles(directory) {
  const results = [];

  for (
    const entry
    of fs.readdirSync(
      directory,
      {
        withFileTypes: true,
      },
    )
  ) {
    const fullPath =
      path.join(
        directory,
        entry.name,
      );

    if (entry.isDirectory()) {
      results.push(
        ...collectSourceFiles(
          fullPath,
        ),
      );
    } else if (
      entry.isFile()
      && /\.(?:js|ejs)$/.test(
        entry.name,
      )
    ) {
      results.push(fullPath);
    }
  }

  return results;
}

test(
  'provider bootstrap password policy rejects unsafe lengths',
  () => {
    assert.equal(
      MIN_PROVIDER_BOOTSTRAP_PASSWORD_LENGTH,
      12,
    );

    assert.equal(
      MAX_PROVIDER_BOOTSTRAP_PASSWORD_LENGTH,
      128,
    );

    assert.equal(
      isValidProviderBootstrapPassword(
        'short',
      ),
      false,
    );

    assert.equal(
      isValidProviderBootstrapPassword(
        '            ',
      ),
      false,
    );

    assert.equal(
      isValidProviderBootstrapPassword(
        'Secure Provider 2026!',
      ),
      true,
    );
  },
);

test(
  'legacy Driver model is removed from the runtime source tree',
  () => {
    assert.equal(
      fs.existsSync(
        path.join(
          backendRoot,
          'src/models/Driver.js',
        ),
      ),
      false,
    );
  },
);

test(
  'direct admin provider creation requires explicit matching credential without returning it',
  () => {
    const adminDriversSource =
      source(
        'src/routes/adminDrivers.js',
      );

    const directCreateStart =
      adminDriversSource.indexOf(
        "router.post('/',",
      );

    const directCreateEnd =
      adminDriversSource.indexOf(
        "router.put('/:id/status'",
        directCreateStart,
      );

    assert.ok(
      directCreateStart >= 0
      && directCreateEnd > directCreateStart,
      'direct provider creation route must exist',
    );

    const directCreate =
      adminDriversSource.slice(
        directCreateStart,
        directCreateEnd,
      );

    assert.match(
      directCreate,
      /driverPassword,[\s\S]*driverPasswordConfirm,/,
    );

    assert.match(
      directCreate,
      /password !== passwordConfirm/,
    );

    assert.match(
      directCreate,
      /isValidProviderBootstrapPassword\(password\)/,
    );

    assert.match(
      directCreate,
      /bcrypt\.hash\(\s*password,\s*10,\s*\)/,
    );

    assert.doesNotMatch(
      directCreate,
      /res\.json\(\s*\{[^}]*\b(?:password|hashedPassword)\s*:/,
    );
  },
);

test(
  'admin direct-add browser collects and confirms a non-disclosed initial credential',
  () => {
    const viewSource =
      source(
        'src/views/admin/index.ejs',
      );

    const browserSource =
      source(
        'src/public/js/main.js',
      );

    assert.match(
      viewSource,
      /name="driverPassword"[^>]*minlength="12"[^>]*maxlength="128"[^>]*autocomplete="new-password"/,
    );

    assert.match(
      viewSource,
      /name="driverPasswordConfirm"[^>]*minlength="12"[^>]*maxlength="128"[^>]*autocomplete="new-password"/,
    );

    assert.match(
      browserSource,
      /if\s*\(\s*password !== passwordConfirm\s*\)/,
    );

    assert.doesNotMatch(
      browserSource,
      /const pendingId = form\.dataset\.pendingId;/,
    );

    assert.doesNotMatch(
      browserSource,
      /\/admin\/drivers\/pending\/\$\{pendingId\}/,
    );

    assert.match(
      browserSource,
      /new FormData\(\)/,
    );

    assert.match(
      browserSource,
      /payload\.append\('driverPassword', password\)/,
    );

    assert.match(
      browserSource,
      /payload\.append\('driverPasswordConfirm', passwordConfirm\)/,
    );

    assert.doesNotMatch(
      browserSource,
      /\bdata\.password\b/,
    );
  },
);

test(
  'admin browser bundle remains syntactically valid',
  () => {
    const browserSource =
      source(
        'src/public/js/main.js',
      );

    assert.doesNotThrow(
      () => {
        new vm.Script(
          browserSource,
          {
            filename:
              'src/public/js/main.js',
          },
        );
      },
    );
  },
);

test(
  'backend source and regression tests contain no legacy fixed provider credential',
  () => {
    const fixedCredential =
      'Pass' + '1234';

    const files = [
      ...collectSourceFiles(
        path.join(
          backendRoot,
          'src',
        ),
      ),
      ...collectSourceFiles(
        path.join(
          backendRoot,
          'test',
        ),
      ),
    ];

    for (const file of files) {
      const text =
        fs.readFileSync(
          file,
          'utf8',
        );

      assert.equal(
        text.includes(
          fixedCredential,
        ),
        false,
        `legacy credential remains in ${file}`,
      );
    }
  },
);
