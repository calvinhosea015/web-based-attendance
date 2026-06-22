const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');

describe('health endpoints', () => {
  /** @type {import('http').Server} */
  let server;
  let baseUrl;

  before(async () => {
    if (!process.env.DATABASE_URL) {
      process.env.DATABASE_URL =
        process.env.DATABASE_URL || 'postgresql://attendance:attendance@127.0.0.1:5432/attendance';
    }
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve);
    });
    const { port } = server.address();
    baseUrl = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  async function getJson(path) {
    const res = await fetch(`${baseUrl}${path}`);
    const body = await res.json();
    return { status: res.status, body };
  }

  it('GET /health returns ok without database', async () => {
    const { status, body } = await getJson('/health');
    assert.equal(status, 200);
    assert.equal(body.ok, true);
  });

  it('GET /health/ready reflects database connectivity', async () => {
    const { status, body } = await getJson('/health/ready');
    if (status === 200) {
      assert.equal(body.ok, true);
      assert.equal(body.db, true);
    } else {
      assert.equal(status, 503);
      assert.equal(body.ok, false);
      assert.equal(body.db, false);
    }
  });
});
