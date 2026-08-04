import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from './server.js';

test('GET /healthz returns 200', async () => {
  const app = createApp();
  const response = await request(app).get('/healthz');
  assert.equal(response.status, 200);
  assert.deepStrictEqual(response.body, { status: 'ok' });
});
