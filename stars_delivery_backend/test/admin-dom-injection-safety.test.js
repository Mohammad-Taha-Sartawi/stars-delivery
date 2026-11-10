const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const backendRoot =
  path.resolve(__dirname, '..');

const mainPath =
  path.join(
    backendRoot,
    'src/public/js/main.js',
  );

const source =
  fs.readFileSync(
    mainPath,
    'utf8',
  );

function extractEscapeHtml() {
  const match = source.match(
    /function escapeHtml\(value\) \{[\s\S]*?\n\}/,
  );

  assert.ok(
    match,
    'escapeHtml function must exist',
  );

  const context = {};

  vm.runInNewContext(
    `${match[0]}; this.escapeHtml = escapeHtml;`,
    context,
  );

  return context.escapeHtml;
}

test('escapeHtml encodes all HTML-significant characters and coerces values', () => {
  const escapeHtml =
    extractEscapeHtml();

  assert.equal(
    escapeHtml(
      `<script x="1">'&</script>`,
    ),
    '&lt;script x=&quot;1&quot;&gt;&#039;&amp;&lt;/script&gt;',
  );

  assert.equal(
    escapeHtml(42),
    '42',
  );

  assert.equal(
    escapeHtml(null),
    '',
  );

  assert.equal(
    escapeHtml(undefined),
    '',
  );
});

test('status badge fallbacks encode unknown status values', () => {
  assert.equal(
    (
      source.match(
        /return map\[status\] \|\| escapeHtml\(status\);/g,
      )
      || []
    ).length,
    3,
  );

  assert.doesNotMatch(
    source,
    /return map\[status\] \|\| status;/,
  );
});

test('driver and user result HTML encodes displayed API fields', () => {
  for (const marker of [
    '${escapeHtml(data.error)}',
    '${escapeHtml(driver.driverId)}',
    '${escapeHtml(driver.name)}',
    '${escapeHtml(driver.email)}',
    '${escapeHtml(driver.phone)}',
    '${escapeHtml(driver.governorate || \'غير محدد\')}',
    '${escapeHtml(driver.city || driver.area || \'غير محدد\')}',
    '${escapeHtml(user.userId)}',
    '${escapeHtml(user.name)}',
    '${escapeHtml(user.email)}',
    '${escapeHtml(user.phone)}',
    '${escapeHtml(user.governorate || \'غير محدد\')}',
    '${escapeHtml(user.city || user.area || \'غير محدد\')}',
  ]) {
    assert.ok(
      source.includes(marker),
      marker,
    );
  }
});

test('legacy chat, report detail, and report replies encode message text', () => {
  assert.equal(
    (
      source.match(
        /\$\{escapeHtml\(msg\.text\)\}/g,
      )
      || []
    ).length,
    2,
  );

  for (const marker of [
    '${escapeHtml(senderName)}',
    '${escapeHtml(msg.time)}',
    '${escapeHtml(report.reporter)}',
    '${escapeHtml(report.category)}',
    '${escapeHtml(report.date)}',
    '${escapeHtml(report.content)}',
  ]) {
    assert.ok(
      source.includes(marker),
      marker,
    );
  }
});

test('commission and area HTML builders encode displayed database values', () => {
  for (const marker of [
    '${escapeHtml(driver.name)}',
    '${escapeHtml(driver.driverId)}',
    '${escapeHtml(driver.phone || \'غير متوفر\')}',
    '${escapeHtml(driver.serviceType)}',
    '${escapeHtml(driver.commission)}',
    'data-gov="${escapeHtml(String(gov))}"',
    '${escapeHtml(city.name)}',
    '${escapeHtml(city.drivers)}',
    '${escapeHtml(city.users)}',
    '<h3>${escapeHtml(gov)}</h3>',
  ]) {
    assert.ok(
      source.includes(marker),
      marker,
    );
  }
});

test('report table builders encode reporter, category, ids, dates, and preview content', () => {
  const hardenedPrefix =
    'rows += `<tr><td><strong>${escapeHtml(report.reportId)}</strong></td><td>${escapeHtml(reporterName)}</td><td>ID ${escapeHtml(targetId)}</td><td>${escapeHtml(report.category)}</td><td>${escapeHtml(report.date)}</td>';

  assert.equal(
    source.split(
      hardenedPrefix,
    ).length - 1,
    2,
  );

  assert.equal(
    source.split(
      '${escapeHtml(report.content.substring(0, 40))}',
    ).length - 1,
    2,
  );
});

test('documents, financial rows, orders, broadcast, and pending providers encode visible text', () => {
  for (const marker of [
    '${escapeHtml(completionText)}',
    '${escapeHtml(label)}',
    '${escapeHtml(document.contentType)}',
    '${escapeHtml(formatProviderDocumentBytes(document.size))}',
    '${escapeHtml(formatProviderDocumentDate(document.uploadedAt))}',
    'href="${escapeHtml(downloadUrl)}"',
    '${escapeHtml(documentStatusText)}',
    '${escapeHtml(t.id.slice(-8))}',
    '${escapeHtml(t.desc)}',
    '${escapeHtml(t.date)}',
    '${escapeHtml(t.amount)}',
    '${escapeHtml(o.orderId)}',
    '${escapeHtml(o.type)}',
    '${escapeHtml(o.date)}',
    '${escapeHtml(o.status)}',
    '${escapeHtml(o.amount)}',
    '${escapeHtml(data.count)}',
    '${escapeHtml(title)}',
    '${escapeHtml(data.sentAt)}',
    '${escapeHtml(provider.fullName)}',
    '${escapeHtml(provider.email)}',
    '${escapeHtml(provider.phone)}',
    '${escapeHtml(provider.governorate || \'غير محدد\')}',
    '${escapeHtml(provider.city || provider.area || \'غير محدد\')}',
  ]) {
    assert.ok(
      source.includes(marker),
      marker,
    );
  }

  assert.match(
    source,
    /\/admin\/drivers\/documents\/\$\{encodedId\}/,
  );

  assert.match(
    source,
    /\/admin\/drivers\/pending\/\$\{encodedId\}\/documents/,
  );

  assert.match(
    source,
    /metadata\.complete !== true/,
  );

  assert.doesNotMatch(
    source,
    /driver\.documents/,
  );

  assert.doesNotMatch(
    source,
    /function enterDocs\(/,
  );

  assert.doesNotMatch(
    source,
    /\/admin\/drivers\/pending\/\$\{pendingId\}/,
  );
});

test('STARS-011 preserves strict-CSP action capability and safe support chat rendering', () => {
  assert.match(
    source,
    /data-admin-capability/,
  );

  assert.match(
    source,
    /adminActionCapability/,
  );

  assert.match(
    source,
    /body\.textContent = text \|\| '';/,
  );

  assert.match(
    source,
    /preview\.textContent = conversation\.lastMessage \|\| '';/,
  );

  assert.doesNotMatch(
    source,
    /\.outerHTML\s*=/,
  );

  assert.doesNotMatch(
    source,
    /\.insertAdjacentHTML\s*\(/,
  );

  assert.doesNotMatch(
    source,
    /\bdocument\.write(?:ln)?\s*\(/,
  );
});
