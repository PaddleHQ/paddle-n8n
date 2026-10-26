const { test } = require('node:test');
const assert = require('node:assert');
const { paddleApiError, throwOnPaddleError } = require('../dist/nodes/Paddle/shared/errors');

const node = { name: 'Paddle Billing', type: 'paddle', typeVersion: 1, parameters: {} };

test('names the rejected fields using parameter labels', () => {
	const error = paddleApiError(
		node,
		400,
		{
			error: {
				code: 'invalid_field',
				detail: 'Invalid request.',
				errors: [
					{ field: 'email', message: 'must be a valid email address' },
					{ field: 'unit_price.amount', message: 'must be a number' },
				],
			},
			meta: { request_id: 'req_123' },
		},
		2,
	);
	assert.strictEqual(
		error.message,
		"Paddle rejected the value of 'Email', 'Unit Price Amount' [item 2]",
	);
	assert.match(error.description, /'Email': must be a valid email address/);
	assert.match(error.description, /Paddle request ID: req_123/);
	assert.strictEqual(error.httpCode, '400');
});

test('explains how to fix a missing permission', () => {
	const error = paddleApiError(node, 403, {
		error: { code: 'forbidden', detail: 'You aren’t permitted to perform this request.' },
	});
	assert.strictEqual(error.message, "The API key doesn't have permission for this action");
	assert.match(error.description, /Developer Tools > Authentication/);
	assert.match(error.description, /permitted to perform this request/);
});

test('treats a rejected API key as a credential problem, not a permission one', () => {
	for (const code of ['authentication_malformed', 'authentication_missing', 'invalid_token']) {
		const error = paddleApiError(node, 403, {
			error: { code, detail: 'Invalid or revoked API key.' },
		});
		assert.strictEqual(error.message, 'Paddle did not accept the API key', code);
		assert.match(error.description, /Check the API key in the 'Paddle Billing API' credential/);
		assert.match(error.description, /'Environment' matches/);
		assert.strictEqual(error.httpCode, '403');
	}
});

test('mentions the environment for a forbidden request', () => {
	const error = paddleApiError(node, 403, { error: { code: 'forbidden' } });
	assert.strictEqual(error.message, "The API key doesn't have permission for this action");
	assert.match(error.description, /'Environment' matches/);
});

test("uses Paddle's explanation as the headline for a conflict", () => {
	const error = paddleApiError(node, 409, {
		error: {
			code: 'customer_already_exists',
			detail: 'customer email conflicts with customer of id ctm_123',
		},
	});
	assert.strictEqual(error.message, 'customer email conflicts with customer of id ctm_123');
	assert.match(error.description, /Check the record in Paddle/);
	assert.strictEqual(
		paddleApiError(node, 409, {}).message,
		"The record's current state doesn't allow this change",
	);
});

test("uses Paddle's detail for statuses without a known message", () => {
	const error = paddleApiError(node, 400, {
		error: { code: 'subscription_locked', detail: 'Subscription is locked' },
	});
	assert.strictEqual(error.message, 'Subscription is locked');
});

test('keeps the HTTP code so the trigger can detect a 404', () => {
	assert.strictEqual(paddleApiError(node, 404, {}).httpCode, '404');
});

test('postReceive passes successful responses through and throws on failures', async () => {
	const ctx = { getNode: () => node, getItemIndex: () => 0 };
	const items = [{ json: { id: 'ctm_1' } }];
	assert.strictEqual(
		await throwOnPaddleError.call(ctx, items, { statusCode: 200, body: {} }),
		items,
	);
	await assert.rejects(
		throwOnPaddleError.call(ctx, items, { statusCode: 401, body: {} }),
		/Paddle did not accept the API key \[item 0\]/,
	);
});

test("uses Paddle's explanation as the headline for a 409", () => {
	const error = paddleApiError(node, 409, {
		error: {
			code: 'customer_already_exists',
			detail: 'customer email conflicts with customer of id ctm_01abc',
		},
	});
	assert.strictEqual(error.message, 'customer email conflicts with customer of id ctm_01abc');
	assert.match(error.description, /Check the record in Paddle/);
});

test('passes on how long Paddle asks to wait after a rate limit', () => {
	const error = paddleApiError(node, 429, {}, 0, { 'retry-after': '30' });
	assert.strictEqual(error.context.retryAfterSeconds, 30);
	assert.match(error.description, /wait 30 seconds/);
	assert.match(error.description, /Retry On Fail/);
});
