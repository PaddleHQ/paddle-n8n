const { test } = require('node:test');
const assert = require('node:assert');
const { paddlePagination } = require('../dist/nodes/Paddle/shared/pagination');

// Fake Paddle list endpoint: `total` records with ids r1..rN, cursor on `after`.
function fakeContext(total) {
	const calls = [];
	const ids = Array.from({ length: total }, (_, i) => `r${i + 1}`);
	return {
		calls,
		async makeRoutingRequest(requestData) {
			const qs = requestData.options.qs;
			calls.push({ ...qs });
			const start = qs.after ? ids.indexOf(qs.after) + 1 : 0;
			return ids.slice(start, start + Number(qs.per_page)).map((id) => ({ json: { id } }));
		},
	};
}

const request = (qs, maxResults) => ({
	options: { qs },
	maxResults,
	paginate: true,
	preSend: [],
	postReceive: [],
	requestOperations: {},
});

test('returns all pages and keeps filters on every request', async () => {
	const ctx = fakeContext(450);
	const result = await paddlePagination.call(ctx, request({ per_page: 200, status: 'active' }));
	assert.strictEqual(result.length, 450);
	assert.strictEqual(ctx.calls.length, 3);
	assert.deepStrictEqual(ctx.calls[1], { per_page: 200, status: 'active', after: 'r200' });
	assert.ok(ctx.calls.every((qs) => qs.status === 'active'));
});

test('stops once the limit is reached', async () => {
	const ctx = fakeContext(1000);
	const result = await paddlePagination.call(ctx, request({ per_page: 30 }, 45));
	assert.strictEqual(result.length, 45);
	assert.strictEqual(ctx.calls.length, 2);
});

test('handles an exact multiple of the page size', async () => {
	const ctx = fakeContext(60);
	const result = await paddlePagination.call(ctx, request({ per_page: 30 }));
	assert.strictEqual(result.length, 60);
	assert.strictEqual(ctx.calls.length, 3);
});

test('handles an empty list', async () => {
	const ctx = fakeContext(0);
	assert.deepStrictEqual(await paddlePagination.call(ctx, request({ per_page: 50 })), []);
});

test('waits and retries a rate-limited page instead of failing the run', async () => {
	const ctx = fakeContext(60);
	const real = ctx.makeRoutingRequest;
	let failures = 0;
	ctx.makeRoutingRequest = async (requestData) => {
		if (requestData.options.qs.after === 'r30' && failures === 0) {
			failures++;
			throw Object.assign(new Error('rate limited'), {
				httpCode: '429',
				context: { retryAfterSeconds: 0.01 },
			});
		}
		return real(requestData);
	};
	ctx.getNode = () => ({ name: 'Paddle Billing' });
	const result = await paddlePagination.call(ctx, request({ per_page: 30 }));
	assert.strictEqual(result.length, 60);
	assert.strictEqual(failures, 1);
});

test('gives up after repeated rate limits', async () => {
	const ctx = fakeContext(60);
	ctx.getNode = () => ({ name: 'Paddle Billing', type: 'paddle', typeVersion: 1, parameters: {} });
	ctx.makeRoutingRequest = async () => {
		throw Object.assign(new Error('rate limited'), {
			httpCode: '429',
			context: { retryAfterSeconds: 0.01 },
		});
	};
	await assert.rejects(
		paddlePagination.call(ctx, request({ per_page: 30 })),
		(error) => error.httpCode === '429',
	);
});
