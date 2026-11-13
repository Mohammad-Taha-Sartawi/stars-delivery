const {
  test,
} = require('node:test');

const assert =
  require('node:assert/strict');

const fs =
  require('node:fs');

const path =
  require('node:path');

const root =
  path.resolve(
    __dirname,
    '../..',
  );

function read(relative) {
  return fs.readFileSync(
    path.join(
      root,
      relative,
    ),
    'utf8',
  ).replace(/\r\n?/g, '\n');
}

const nginx =
  read(
    'deployment/nginx/stars-delivery.conf',
  );

const systemd =
  read(
    'deployment/systemd/stars-delivery.service',
  );

const envExample =
  read(
    'deployment/stars-delivery.env.example',
  );

const runbook =
  read(
    'deployment/README.md',
  );

const backendIndex =
  read(
    'swifora_backend/src/index.js',
  );

const apiConfig =
  read(
    'lib/services/api_config.dart',
  );

const androidGradle =
  read(
    'android/app/build.gradle.kts',
  );

test(
  'deployment package contains the four operator artifacts',
  () => {
    for (const relative of [
      'deployment/nginx/stars-delivery.conf',
      'deployment/systemd/stars-delivery.service',
      'deployment/stars-delivery.env.example',
      'deployment/README.md',
    ]) {
      assert.equal(
        fs.statSync(
          path.join(
            root,
            relative,
          ),
        ).isFile(),
        true,
      );
    }
  },
);

test(
  'nginx redirects plaintext HTTP and terminates TLS',
  () => {
    assert.match(
      nginx,
      /listen 80;/,
    );

    assert.match(
      nginx,
      /return 301 https:\/\/\$host\$request_uri;/,
    );

    assert.match(
      nginx,
      /listen 443 ssl;/,
    );

    assert.match(
      nginx,
      /ssl_certificate\s+/,
    );

    assert.match(
      nginx,
      /ssl_certificate_key\s+/,
    );

    assert.match(
      nginx,
      /ssl_protocols TLSv1\.2 TLSv1\.3;/,
    );

    assert.match(
      nginx,
      /Strict-Transport-Security/,
    );
  },
);

test(
  'nginx proxies only to the local backend and preserves proxy identity',
  () => {
    assert.match(
      nginx,
      /server 127\.0\.0\.1:3000;/,
    );

    assert.match(
      nginx,
      /proxy_pass http:\/\/swifora_backend;/,
    );

    assert.match(
      nginx,
      /proxy_set_header Host \$host;/,
    );

    assert.match(
      nginx,
      /X-Forwarded-For/,
    );

    assert.match(
      nginx,
      /X-Forwarded-Proto/,
    );
  },
);

test(
  'nginx preserves Socket.IO WebSocket upgrade headers',
  () => {
    assert.match(
      nginx,
      /map \$http_upgrade \$stars_connection_upgrade/,
    );

    assert.match(
      nginx,
      /proxy_http_version 1\.1;/,
    );

    assert.match(
      nginx,
      /proxy_set_header Upgrade/,
    );

    assert.match(
      nginx,
      /proxy_set_header Connection/,
    );
  },
);

test(
  'systemd runs the backend as a dedicated service account',
  () => {
    assert.match(
      systemd,
      /^User=stars-delivery$/m,
    );

    assert.match(
      systemd,
      /^Group=stars-delivery$/m,
    );

    assert.match(
      systemd,
      /^WorkingDirectory=\/opt\/stars-delivery\/current\/swifora_backend$/m,
    );

    assert.match(
      systemd,
      /^EnvironmentFile=\/etc\/stars-delivery\/stars-delivery\.env$/m,
    );

    assert.match(
      systemd,
      /^ExecStart=\/usr\/bin\/node src\/index\.js$/m,
    );

    assert.match(
      systemd,
      /^Restart=on-failure$/m,
    );

    assert.match(
      systemd,
      /^KillSignal=SIGTERM$/m,
    );

    assert.match(
      systemd,
      /^NoNewPrivileges=true$/m,
    );
  },
);

test(
  'production environment template is production-safe and contains no populated secrets',
  () => {
    assert.match(
      envExample,
      /^NODE_ENV=production$/m,
    );

    assert.match(
      envExample,
      /^PORT=3000$/m,
    );

    assert.match(
      envExample,
      /^PROVIDER_DOCUMENTS_DIR=\/var\/lib\/stars-delivery\/provider-documents$/m,
    );

    for (const name of [
      'MONGODB_URI',
      'JWT_SECRET',
      'SESSION_SECRET',
      'IMGBB_API_KEY',
      'PASSWORD_RECOVERY_SECRET',
      'SMTP_HOST',
      'SMTP_USER',
      'SMTP_PASS',
      'SMTP_FROM',
    ]) {
      assert.match(
        envExample,
        new RegExp(
          `^${name}=$`,
          'm',
        ),
      );
    }

    assert.doesNotMatch(
      envExample,
      /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
    );
  },
);

test(
  'runbook makes uploads and provider documents persistent',
  () => {
    assert.match(
      runbook,
      /\/var\/lib\/stars-delivery\/uploads/,
    );

    assert.match(
      runbook,
      /swifora_backend\/uploads/,
    );

    assert.match(
      runbook,
      /operating-system symlink/,
    );

    assert.match(
      runbook,
      /PROVIDER_DOCUMENTS_DIR=\/var\/lib\/stars-delivery\/provider-documents/,
    );
  },
);

test(
  'runbook requires operational TLS SMTP backup health and service checks',
  () => {
    for (const marker of [
      'sudo nginx -t',
      'sudo systemctl enable --now stars-delivery',
      '/api/health',
      'SMTP',
      'mongodump',
      'mongorestore',
      'npm run ops:backup',
      'npm run ops:restore',
    ]) {
      assert.ok(
        runbook.includes(marker),
        `missing deployment marker: ${marker}`,
      );
    }
  },
);

test(
  'runbook requires HTTPS Flutter endpoint and external Android signing material',
  () => {
    assert.match(
      runbook,
      /--dart-define=STARS_SERVER_URL=https:\/\/api\.example\.com/,
    );

    assert.match(
      runbook,
      /android\/key\.properties/,
    );

    assert.match(
      runbook,
      /storePassword/,
    );

    assert.match(
      runbook,
      /keyPassword/,
    );

    assert.match(
      runbook,
      /keyAlias/,
    );

    assert.match(
      runbook,
      /storeFile/,
    );
  },
);

test(
  'deployment artifacts align with existing application production contracts',
  () => {
    assert.match(
      backendIndex,
      /app\.set\('trust proxy', 1\)/,
    );

    assert.match(
      backendIndex,
      /app\.get\('\/api\/health'/,
    );

    assert.match(
      backendIndex,
      /process\.on\('SIGTERM'/,
    );

    assert.match(
      apiConfig,
      /STARS_SERVER_URL/,
    );

    assert.match(
      apiConfig,
      /must use HTTPS/,
    );

    assert.match(
      androidGradle,
      /STARS_ANDROID_RELEASE_SIGNING_REQUIRED/,
    );
  },
);
