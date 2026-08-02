const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

describe('security defaults', () => {
  it('rate limiting is on unless RATE_LIMIT_ENABLED=false', () => {
    const prev = process.env.RATE_LIMIT_ENABLED;
    delete process.env.RATE_LIMIT_ENABLED;
    delete require.cache[require.resolve('../src/config/env')];
    const config = require('../src/config/env');
    assert.equal(config.rateLimitEnabled, true);
    if (prev === undefined) delete process.env.RATE_LIMIT_ENABLED;
    else process.env.RATE_LIMIT_ENABLED = prev;
  });

  it('api docs are disabled in production by default', () => {
    assert.match(
      fs.readFileSync(path.join(__dirname, '../src/config/env.js'), 'utf8'),
      /enableApiDocs:\s*process\.env\.ENABLE_API_DOCS === 'true' \|\| nodeEnv !== 'production'/
    );
  });

  it('migrate enables FORCE ROW LEVEL SECURITY on public tables', () => {
    const src = fs.readFileSync(path.join(__dirname, '../src/db/migrate.js'), 'utf8');
    assert.match(src, /FORCE ROW LEVEL SECURITY/);
    assert.match(src, /REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC/);
    assert.match(src, /migrateRowLevelSecurity/);
  });

  it('validateRequest strips submitted values from client errors', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '../src/middleware/validateRequest.js'),
      'utf8'
    );
    assert.match(src, /Never echo submitted values/);
    assert.doesNotMatch(src, /errors:\s*arr\b/);
  });
});
