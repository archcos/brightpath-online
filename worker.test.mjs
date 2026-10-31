// Run: node --test worker.test.mjs
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleContact } from './worker.js';

const realFetch = globalThis.fetch;
const turnstile = (success) => { globalThis.fetch = async () => Response.json({ success }); };

function setup({ fail } = {}) {
  const sent = [];
  const env = {
    CONTACT_TO: 'owner@example.com',
    TURNSTILE_SECRET: 'secret',
    EMAIL: { send: async (m) => { if (fail) throw Object.assign(new Error('nope'), { code: 'E_X' }); sent.push(m); return { messageId: '1' }; } },
  };
  return { env, sent };
}

function post(fields) {
  const body = new FormData();
  for (const [k, v] of Object.entries({ 'cf-turnstile-response': 'tok', ...fields })) body.append(k, v);
  return new Request('https://brightpath-solutions.online/api/contact', { method: 'POST', body });
}

const valid = { topic: 'school', name: 'Ana Cruz', email: 'ana@school.ph', school: 'Makati ES', message: 'We would like a demo.' };

test('sends the inquiry to CONTACT_TO with reply-to set to the visitor', async () => {
  turnstile(true);
  const { env, sent } = setup();
  const res = await handleContact(post(valid), env);
  assert.equal(res.status, 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'owner@example.com');
  assert.equal(sent[0].from.email, 'contact@brightpath-solutions.online');
  assert.deepEqual(sent[0].replyTo, { email: 'ana@school.ph', name: 'Ana Cruz' });
  assert.equal(sent[0].subject, 'School inquiry from Ana Cruz (Makati ES)');
  assert.match(sent[0].text, /We would like a demo\./);
});

test('strips line breaks from header fields', async () => {
  turnstile(true);
  const { env, sent } = setup();
  await handleContact(post({ ...valid, name: 'Ana\r\nBcc: evil@x.com', school: 'A\nB' }), env);
  assert.ok(!/[\r\n]/.test(sent[0].subject));
  assert.ok(!/[\r\n]/.test(sent[0].replyTo.name));
});

test('rejects bad input before calling Turnstile or sending', async () => {
  turnstile(true);
  const { env, sent } = setup();
  assert.equal((await handleContact(post({ ...valid, email: 'not-an-email' }), env)).status, 400);
  assert.equal((await handleContact(post({ ...valid, message: '' }), env)).status, 400);
  assert.equal((await handleContact(post({ ...valid, message: 'x'.repeat(5001) }), env)).status, 400);
  assert.equal(sent.length, 0);
});

test('rejects a failed spam check', async () => {
  turnstile(false);
  const { env, sent } = setup();
  assert.equal((await handleContact(post(valid), env)).status, 403);
  assert.equal(sent.length, 0);
});

test('reports a send failure and a missing configuration', async () => {
  turnstile(true);
  assert.equal((await handleContact(post(valid), setup({ fail: true }).env)).status, 502);
  const { env } = setup();
  delete env.TURNSTILE_SECRET;
  assert.equal((await handleContact(post(valid), env)).status, 500);
  globalThis.fetch = realFetch;
});
