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
