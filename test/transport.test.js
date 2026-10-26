const { test } = require('node:test');
const assert = require('node:assert');
const {
	paddleApiRequest,
	BASE_URL_EXPRESSION,
	BASE_URLS,
} = require('../dist/nodes/Paddle/shared/transport');

const node = { name: 'Paddle Billing', type: 'paddle', typeVersion: 1, parameters: {} };

function fakeContext(environment, response) {
	const calls = [];
	return {
		calls,
		getNode: () => node,
		async getCredentials(name) {
			calls.push({ credentials: name });
			return { environment };
		},
		helpers: {
			async httpRequestWithAuthentication(name, options) {
				calls.push({ name, options });
				return response;
			},
		},
	};
}

test('builds the URL from the credential environment and sets the Paddle headers', async () => {
	const ctx = fakeContext('sandbox', { statusCode: 200, body: { data: { id: 'ctm_1' } } });
	const body = await paddleApiRequest.call(ctx, 'POST', '/customers', { email: 'a@b.c' }, { x: 1 });
	assert.deepStrictEqual(body, { data: { id: 'ctm_1' } });

	const [, request] = ctx.calls;
	assert.strictEqual(request.name, 'paddleBillingApi');
	assert.strictEqual(request.options.url, `${BASE_URLS.sandbox}/customers`);
	assert.strictEqual(request.options.method, 'POST');
	assert.deepStrictEqual(request.options.body, { email: 'a@b.c' });
	assert.deepStrictEqual(request.options.qs, { x: 1 });
	assert.strictEqual(request.options.headers['Paddle-Version'], '1');
	assert.strictEqual(request.options.headers.Accept, 'application/json');
	assert.strictEqual(request.options.json, true);
	assert.strictEqual(request.options.returnFullResponse, true);
	assert.strictEqual(request.options.ignoreHttpStatusErrors, true);
});

test('uses the live host for live credentials and an explicit URL when given', async () => {
	const live = fakeContext('live', { statusCode: 200, body: {} });
	await paddleApiRequest.call(live, 'GET', '/products');
	assert.strictEqual(live.calls[1].options.url, `${BASE_URLS.live}/products`);

	const explicit = fakeContext('sandbox', { statusCode: 200, body: {} });
	await paddleApiRequest.call(
		explicit,
		'GET',
		'/ignored',
		undefined,
		undefined,
		'https://x.test/y',
	);
	assert.strictEqual(explicit.calls[1].options.url, 'https://x.test/y');
});

test('throws a NodeApiError for failed responses', async () => {
	await assert.rejects(
		paddleApiRequest.call(fakeContext('live', { statusCode: 401, body: {} }), 'GET', '/x'),
		/Paddle did not accept the API key/,
	);
	await assert.rejects(
		paddleApiRequest.call(fakeContext('live', { statusCode: 404, body: {} }), 'GET', '/x'),
		(error) => error.httpCode === '404',
	);
});

test('the declarative base URL expression covers both hosts', () => {
	assert.ok(BASE_URL_EXPRESSION.startsWith('={{'));
	assert.ok(BASE_URL_EXPRESSION.includes(BASE_URLS.live));
	assert.ok(BASE_URL_EXPRESSION.includes(BASE_URLS.sandbox));
});
