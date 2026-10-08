const { test } = require('node:test');
const assert = require('node:assert');
const { createHmac } = require('node:crypto');
const { verifyPaddleSignature } = require('../dist/nodes/PaddleTrigger/signature');

const secret = 'pdl_ntfset_test_secret';
const body = '{"event_type":"subscription.created","data":{"id":"sub_123"}}';
const now = 1_700_000_000;
const sign = (ts, payload = body, key = secret) =>
	createHmac('sha256', key).update(`${ts}:${payload}`).digest('hex');

test('accepts a valid signature', () => {
	assert.ok(verifyPaddleSignature(secret, `ts=${now};h1=${sign(now)}`, Buffer.from(body), now));
});

test('accepts when any of several h1 values matches (secret rotation)', () => {
	const header = `ts=${now};h1=${sign(now, body, 'old')};h1=${sign(now)}`;
	assert.ok(verifyPaddleSignature(secret, header, body, now));
});

test('rejects a tampered body', () => {
	assert.ok(!verifyPaddleSignature(secret, `ts=${now};h1=${sign(now)}`, body + ' ', now));
});

test('rejects the wrong secret', () => {
	assert.ok(!verifyPaddleSignature('other', `ts=${now};h1=${sign(now)}`, body, now));
});

test('rejects stale timestamps', () => {
	const ts = now - 301;
	assert.ok(!verifyPaddleSignature(secret, `ts=${ts};h1=${sign(ts)}`, body, now));
});

test('rejects missing or malformed headers', () => {
	assert.ok(!verifyPaddleSignature(secret, undefined, body, now));
	assert.ok(!verifyPaddleSignature(secret, 'garbage', body, now));
	assert.ok(!verifyPaddleSignature(secret, `ts=${now}`, body, now));
	assert.ok(!verifyPaddleSignature(secret, `ts=${now};h1=zz`, body, now));
	assert.ok(!verifyPaddleSignature('', `ts=${now};h1=${sign(now)}`, body, now));
});
